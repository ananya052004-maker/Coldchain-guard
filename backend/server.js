const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('./db');
const notify    = require('./notify');
const { CATEGORY_THRESHOLDS, calcRisk, computeForecast } = require('./risk');
const { startBroker, connectClient, TOPIC_ALL } = require('./mqtt');

// ─── CORS ───────────────────────────────────────────────────────────────────────
// Locked down to an explicit allowlist instead of '*'. Add every deployed
// frontend origin (and any local dev port) via a comma-separated ALLOWED_ORIGINS
// env var — e.g. "https://coldchain-guard.vercel.app,http://localhost:3000".
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

function corsOriginCheck(origin, callback) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  callback(new Error(`Origin ${origin} not allowed by CORS`));
}

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'DELETE'] } });

app.use(cors({ origin: corsOriginCheck }));
app.use(express.json());

// Fail-closed in production (refuse to boot with an insecure default secret),
// fail-open with a loud warning everywhere else so local dev/tests aren't
// broken by the requirement.
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('FATAL: JWT_SECRET must be set in production. Refusing to start.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || 'coldchain_jwt_secret_2025';
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET not set — using an insecure default. Set JWT_SECRET in production.');
}

// Applies to register/login only — brute-forcing either becomes materially
// harder without punishing normal API usage elsewhere. Skipped under tests so
// repeated `npm test` runs within the same window don't start failing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many attempts — try again in a few minutes.' },
});

// ─── AI Agent (agentic diagnosis layer) ────────────────────────────────────────
// Optional: only activates when ANTHROPIC_API_KEY is set. AI_AGENT_MODEL lets the
// deployer swap models (e.g. a cheaper one) without touching code.
const AI_MODEL   = process.env.AI_AGENT_MODEL || 'claude-opus-5';
const aiClient   = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
if (!aiClient) console.log('AI agent disabled: set ANTHROPIC_API_KEY to enable AI incident diagnosis.');

const AGENT_SYSTEM_PROMPT = `You are a cold-chain operations analyst embedded in an IoT monitoring system for perishable and pharmaceutical storage. You are given live sensor readings, category-specific safety thresholds, a short recent history window, and a statistical forecast for one storage room. Diagnose the most likely root cause of the flagged condition and give one concrete, actionable recommendation for a warehouse operator.

Respond with ONLY a compact JSON object, no markdown, no prose outside it:
{"rootCause": "<=140 chars, specific hypothesis grounded in the data given>", "recommendation": "<=160 chars, one concrete action>", "urgency": "low"|"medium"|"high"}`;

const AGENT_COOLDOWN_MS = 3 * 60 * 1000; // don't re-diagnose the same room more than once per 3 min
const agentCooldown = {};

async function runDiagnosisAgent(key, room, point, forecast, triggerReasons) {
  if (!aiClient || triggerReasons.length === 0) return;
  const now = Date.now();
  if (now - (agentCooldown[key] || 0) < AGENT_COOLDOWN_MS) return;
  agentCooldown[key] = now;

  const recentWindow = (sensorHistory[key] || []).slice(0, 20).map(p => ({
    t: p.timestamp, temp: p.temperature, hum: p.humidity, co2: p.co2, door: p.doorOpen,
  }));

  const payload = {
    room: room.name, category: room.category, product: room.product, quantityKg: room.quantity_kg,
    thresholds: CATEGORY_THRESHOLDS[room.category] || CATEGORY_THRESHOLDS.fruits,
    current: { temperature: point.temperature, humidity: point.humidity, co2: point.co2, doorOpen: point.doorOpen },
    forecast, triggerReasons, recentWindow,
  };

  try {
    const resp = await aiClient.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      output_config: { effort: 'low' },
      system: AGENT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    const textBlock = resp.content.find(b => b.type === 'text');
    if (!textBlock) return;
    let parsed;
    try { parsed = JSON.parse(textBlock.text.trim()); } catch { return; }

    const insight = {
      id:        `${now}-${Math.random()}`,
      room:      key,
      roomName:  room.name,
      rootCause: String(parsed.rootCause || '').slice(0, 200),
      recommendation: String(parsed.recommendation || '').slice(0, 200),
      urgency:   ['low', 'medium', 'high'].includes(parsed.urgency) ? parsed.urgency : 'medium',
      triggerReasons,
      timestamp: new Date().toISOString(),
    };
    db.insertInsight(insight);
    io.to(userChannel(room.user_id)).emit('aiInsight', insight);
  } catch (err) {
    console.error('AI agent error:', err.message);
  }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const sensorHistory = {};
const liveAlerts    = [];
const MAX_HIST      = 50;

function userChannel(userId) { return `user:${userId}`; }

function checkAlerts(roomKey, roomName, data, category, userId) {
  const t    = CATEGORY_THRESHOLDS[category] || CATEGORY_THRESHOLDS.fruits;
  const msgs = [];
  if (data.temperature > t.temperature.max) msgs.push({ msg: `HIGH TEMP in ${roomName}: ${data.temperature.toFixed(1)}°C`,  sev: 'critical' });
  if (data.temperature < t.temperature.min) msgs.push({ msg: `LOW TEMP in ${roomName}: ${data.temperature.toFixed(1)}°C`,   sev: 'critical' });
  if (data.humidity    > t.humidity.max)    msgs.push({ msg: `HIGH HUMIDITY in ${roomName}: ${data.humidity.toFixed(1)}%`,   sev: 'warning'  });
  if (data.humidity    < t.humidity.min)    msgs.push({ msg: `LOW HUMIDITY in ${roomName}: ${data.humidity.toFixed(1)}%`,    sev: 'warning'  });
  if (data.co2         > t.co2.max)         msgs.push({ msg: `HIGH CO2 in ${roomName}: ${data.co2.toFixed(0)} ppm`,         sev: 'warning'  });
  if (data.doorOpen)                         msgs.push({ msg: `DOOR OPEN in ${roomName}`,                                   sev: 'warning'  });

  msgs.forEach(({ msg, sev }) => {
    const key   = `${Date.now()}-${Math.random()}`;
    const alert = { id: key, message: msg, timestamp: new Date().toISOString(), room: roomKey, severity: sev };
    liveAlerts.unshift(alert);
    if (liveAlerts.length > 200) liveAlerts.pop();
    io.to(userChannel(userId)).emit('alert', alert);
    db.insertAlert(key, roomKey, msg, sev);
  });

  return msgs;
}

const PREDICTIVE_COOLDOWN_MS = 5 * 60 * 1000; // don't re-fire the same predicted breach for 5 min
const predictiveCooldown = {};

function checkPredictiveAlerts(roomKey, roomName, forecast, userId) {
  if (!forecast) return [];
  const fired = [];
  const now = Date.now();
  const LABELS = { temperature: 'TEMPERATURE', humidity: 'HUMIDITY', co2: 'CO2' };

  Object.entries(forecast.metrics).forEach(([metric, f]) => {
    if (f.breachInSec == null) return;
    const cdKey = `${roomKey}:${metric}`;
    if (now - (predictiveCooldown[cdKey] || 0) < PREDICTIVE_COOLDOWN_MS) return;
    predictiveCooldown[cdKey] = now;

    const mins = Math.max(1, Math.round(f.breachInSec / 60));
    const dir  = f.breachType === 'max' ? 'exceed the safe max' : 'drop below the safe min';
    const msg  = `PREDICTED ${LABELS[metric]} BREACH in ${roomName}: trending to ${dir} in ~${mins} min if this continues`;
    const key  = `${now}-${Math.random()}`;
    const alert = { id: key, message: msg, timestamp: new Date().toISOString(), room: roomKey, severity: 'predictive' };

    liveAlerts.unshift(alert);
    if (liveAlerts.length > 200) liveAlerts.pop();
    io.to(userChannel(userId)).emit('alert', alert);
    db.insertAlert(key, roomKey, msg, 'predictive');
    fired.push(msg);
  });

  return fired;
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (db.findByEmail(email))        return res.status(409).json({ error: 'Email already registered' });
  const hash  = bcrypt.hashSync(password, 10);
  const user  = db.createUser(name, email, hash);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: db.safeUser(user) });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.findByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: db.safeUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json(db.safeUser(user));
});

// ─── Cold storage routes ──────────────────────────────────────────────────────
app.post('/api/cold-storages', auth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  res.json(db.createColdStorage(req.user.id, name));
});

app.get('/api/cold-storages', auth, (req, res) => {
  res.json(db.getUserColdStorages(req.user.id));
});

// ─── Room routes ──────────────────────────────────────────────────────────────
app.post('/api/rooms', auth, (req, res) => {
  const { cold_storage_id, name, category, product, product_emoji, quantity_kg } = req.body;
  if (!cold_storage_id || !name || !category) return res.status(400).json({ error: 'Missing required fields' });
  const room = db.createRoom(req.user.id, cold_storage_id, name, category, product, product_emoji, quantity_kg);
  sensorHistory[room.room_key] = [];
  res.json(room);
});

app.get('/api/rooms', auth, (req, res) => {
  const rooms        = db.getUserRooms(req.user.id);
  const coldStorages = db.getUserColdStorages(req.user.id);
  res.json({ rooms, coldStorages });
});

app.delete('/api/rooms/:id', auth, (req, res) => {
  const roomId = parseInt(req.params.id);
  const room   = db.getRoomById(roomId);
  if (room && room.user_id === req.user.id) {
    delete sensorHistory[room.room_key];
  }
  db.deleteRoom(roomId, req.user.id);
  res.json({ success: true });
});

// ─── Sensor data ──────────────────────────────────────────────────────────────
app.get('/api/current', auth, (req, res) => {
  const rooms = db.getUserRooms(req.user.id);
  const out   = {};
  rooms.forEach(r => { out[r.room_key] = sensorHistory[r.room_key]?.[0] || null; });
  res.json(out);
});

app.get('/api/history/:roomKey', auth, (req, res) => {
  res.json(sensorHistory[req.params.roomKey] || []);
});

app.get('/api/alerts', auth, (req, res) => {
  const userRoomKeys = new Set(db.getUserRooms(req.user.id).map(r => r.room_key));
  res.json(liveAlerts.filter(a => userRoomKeys.has(a.room)));
});

app.get('/api/db/history/:roomKey', auth, (req, res) => {
  res.json(db.getReadings(req.params.roomKey));
});

app.get('/api/db/alerts', auth, (req, res) => {
  res.json(db.getUserAlerts(req.user.id));
});

app.get('/api/insights', auth, (req, res) => {
  res.json(db.getUserInsights(req.user.id));
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
// Every socket must authenticate with the same JWT used for REST calls, and is
// placed in a room scoped to its user id — sensorUpdate/alert/aiInsight events
// are emitted to that room only, so one tenant's live data never reaches
// another tenant's browser (previously these were broadcast to every socket).
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Unauthorized'));
  try {
    socket.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', socket => {
  socket.join(userChannel(socket.userId));
  console.log('Browser connected:', socket.id, 'user', socket.userId);
  socket.on('disconnect', () => console.log('Browser disconnected:', socket.id));
});

// ─── Sensor ingestion (MQTT) ────────────────────────────────────────────────────
// One reading, wherever it came from (the built-in simulator or a real device),
// goes through this single path: risk scoring, forecasting, alerting, the AI
// agent, notifications, the live socket push, and the DB write. Readings now
// arrive over MQTT instead of a direct function call from an in-process loop —
// see mqtt.js/simulator.js and the MQTT section in prep.md.
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000; // don't re-notify the same room more than once per 10 min
const notifyCooldown = {};

function ingestReading(room, data) {
  const key = room.room_key;
  if (!sensorHistory[key]) sensorHistory[key] = [];

  const temperature = data.temperature, humidity = data.humidity, co2 = data.co2, doorOpen = !!data.doorOpen;
  const spoilageRisk = calcRisk(temperature, humidity, co2, room.category);
  const point = { timestamp: new Date().toISOString(), temperature, humidity, co2, doorOpen, spoilageRisk, category: room.category };

  sensorHistory[key].unshift(point);
  if (sensorHistory[key].length > MAX_HIST) sensorHistory[key].pop();

  const forecast = computeForecast(sensorHistory[key], room.category);
  point.forecast = forecast;

  const criticalMsgs   = checkAlerts(key, room.name, { temperature, humidity, co2, doorOpen }, room.category, room.user_id);
  const predictiveMsgs = checkPredictiveAlerts(key, room.name, forecast, room.user_id);
  const criticalOnly   = criticalMsgs.filter(m => m.sev === 'critical').map(m => m.msg);
  const triggerReasons = [...criticalOnly, ...predictiveMsgs];
  if (triggerReasons.length) runDiagnosisAgent(key, room, point, forecast, triggerReasons);

  if (criticalOnly.length) {
    const now = Date.now();
    if (now - (notifyCooldown[key] || 0) >= NOTIFY_COOLDOWN_MS) {
      notifyCooldown[key] = now;
      notify.notifyCritical(room.name, criticalOnly);
    }
  }

  io.to(userChannel(room.user_id)).emit('sensorUpdate', { roomKey: key, data: point });
  db.insertReading(key, temperature, humidity, co2, doorOpen ? 1 : 0, spoilageRisk);
}

// Starts the embedded MQTT broker, subscribes to every room's telemetry topic,
// and starts the simulator publishing to it. A real device would publish to
// the same topic (`coldchain/<room_key>/telemetry`) with the same JSON shape
// ({temperature, humidity, co2, doorOpen}) and need no other backend change.
async function startIngestion() {
  await startBroker();

  const subscriber = connectClient('coldchain-backend');
  subscriber.on('connect', () => subscriber.subscribe(TOPIC_ALL, () => console.log('Backend subscribed to', TOPIC_ALL)));
  subscriber.on('error', (err) => console.error('Backend MQTT error:', err.message));
  subscriber.on('message', (topic, payload) => {
    const roomKey = topic.split('/')[1];
    const room = db.getRoomByKey(roomKey);
    if (!room) return; // room was deleted, or the message is stale/unknown
    let data;
    try { data = JSON.parse(payload.toString()); } catch { return; }
    ingestReading(room, data);
  });

  require('./simulator').start();
}

// Rebuilds each room's rolling sensor-history window from the DB on boot, so a
// restart/redeploy doesn't blank out the predictive engine's trend data (it
// previously started from zero every time since sensorHistory was in-memory only).
function hydrateSensorHistory() {
  db.allRooms().forEach(room => {
    const rows = db.getReadings(room.room_key, MAX_HIST); // already newest-first
    sensorHistory[room.room_key] = rows.map(r => ({
      timestamp: r.created_at, temperature: r.temperature, humidity: r.humidity,
      co2: r.co2, doorOpen: !!r.door_open, spoilageRisk: r.spoilage_risk, category: room.category,
    }));
  });
}

const PORT = process.env.PORT || 5000;

// Guarded so requiring this file (e.g. from tests via supertest) doesn't bind a
// port, start the MQTT broker, or start the simulator — only actually running
// `node server.js` does.
if (require.main === module) {
  hydrateSensorHistory();
  server.listen(PORT, () => {
    console.log(`\n ColdChain Guard Backend running at http://localhost:${PORT}`);
    console.log('Storage: SQLite (backend/data/coldchain.db)');
    startIngestion();
  });
}

module.exports = app;
