const express  = require('express');
const http     = require('http');
const socketIo = require('socket.io');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST', 'PUT'] } });

app.use(cors());
app.use(express.json());

const JWT_SECRET = 'coldchain_jwt_secret_2025';

// ─── Auth middleware ──────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ─── In-memory real-time state ────────────────────────────────────────────────
const sensorHistory = { 'Room-A': [], 'Room-B': [], 'Room-C': [] };
const liveAlerts    = [];
const MAX_HIST      = 50;

const THRESHOLDS = {
  temperature: { min: 1, max: 8 },
  humidity:    { min: 80, max: 95 },
  co2:         { max: 1000 },
};

function calcRisk(temp, hum, co2) {
  let r = 0;
  if (temp > THRESHOLDS.temperature.max)      r += (temp - THRESHOLDS.temperature.max) * 10;
  else if (temp < THRESHOLDS.temperature.min) r += (THRESHOLDS.temperature.min - temp) * 5;
  if (hum > THRESHOLDS.humidity.max)          r += (hum - THRESHOLDS.humidity.max) * 2;
  else if (hum < THRESHOLDS.humidity.min)     r += (THRESHOLDS.humidity.min - hum) * 1.5;
  if (co2 > THRESHOLDS.co2.max)              r += (co2 - THRESHOLDS.co2.max) * 0.05;
  return Math.min(100, Math.max(0, r));
}

function checkAlerts(roomId, data) {
  const msgs = [];
  if (data.temperature > THRESHOLDS.temperature.max) msgs.push({ msg: `HIGH TEMP in ${roomId}: ${data.temperature.toFixed(1)}°C`,  sev: 'critical' });
  if (data.temperature < THRESHOLDS.temperature.min) msgs.push({ msg: `LOW TEMP in ${roomId}: ${data.temperature.toFixed(1)}°C`,   sev: 'critical' });
  if (data.humidity    > THRESHOLDS.humidity.max)    msgs.push({ msg: `HIGH HUMIDITY in ${roomId}: ${data.humidity.toFixed(1)}%`,   sev: 'warning'  });
  if (data.humidity    < THRESHOLDS.humidity.min)    msgs.push({ msg: `LOW HUMIDITY in ${roomId}: ${data.humidity.toFixed(1)}%`,    sev: 'warning'  });
  if (data.co2         > THRESHOLDS.co2.max)         msgs.push({ msg: `HIGH CO2 in ${roomId}: ${data.co2.toFixed(0)} ppm`,         sev: 'warning'  });
  if (data.doorOpen)                                  msgs.push({ msg: `DOOR OPEN in ${roomId}`,                                    sev: 'warning'  });

  msgs.forEach(({ msg, sev }) => {
    const key   = `${Date.now()}-${Math.random()}`;
    const alert = { id: key, message: msg, timestamp: new Date().toISOString(), room: roomId, severity: sev };
    liveAlerts.unshift(alert);
    if (liveAlerts.length > 100) liveAlerts.pop();
    io.emit('alert', alert);
    db.insertAlert(key, roomId, msg, sev);
  });
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, email and password required' });
  if (db.findByEmail(email))
    return res.status(409).json({ error: 'Email already registered' });

  const hash  = bcrypt.hashSync(password, 10);
  const user  = db.createUser(name, email, hash);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: db.safeUser(user) });
});

app.post('/api/auth/login', (req, res) => {
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

app.put('/api/auth/crop', auth, (req, res) => {
  const { crop, crop_emoji, quantity_kg } = req.body;
  const updated = db.updateCrop(req.user.id, crop, crop_emoji, quantity_kg || 0);
  res.json(updated);
});

app.get('/api/admin/users', (_req, res) => res.json(db.allUsers()));

// ─── Sensor data ──────────────────────────────────────────────────────────────
app.post('/api/sensor-data', (req, res) => {
  const { roomId, temperature, humidity, co2, doorOpen } = req.body;
  if (!sensorHistory[roomId]) return res.status(400).json({ error: 'Unknown roomId' });

  const spoilageRisk = calcRisk(temperature, humidity, co2);
  const point = { timestamp: new Date().toISOString(), temperature, humidity, co2, doorOpen, spoilageRisk };

  sensorHistory[roomId].unshift(point);
  if (sensorHistory[roomId].length > MAX_HIST) sensorHistory[roomId].pop();

  checkAlerts(roomId, { temperature, humidity, co2, doorOpen });
  io.emit('sensorUpdate', { roomId, data: point });
  db.insertReading(roomId, temperature, humidity, co2, doorOpen ? 1 : 0, spoilageRisk);

  res.json({ success: true, spoilageRisk });
});

app.get('/api/current', (_req, res) => {
  const out = {};
  Object.keys(sensorHistory).forEach(r => { out[r] = sensorHistory[r][0] || null; });
  res.json(out);
});

app.get('/api/history/:roomId',    (req, res) => res.json(sensorHistory[req.params.roomId] || []));
app.get('/api/alerts',             (_req, res) => res.json(liveAlerts));
app.get('/api/db/history/:roomId', (req, res) => res.json(db.getReadings(req.params.roomId)));
app.get('/api/db/alerts',          (_req, res) => res.json(db.getAlerts()));

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Browser connected:', socket.id);
  const current = {};
  Object.keys(sensorHistory).forEach(r => { current[r] = sensorHistory[r][0] || null; });
  socket.emit('initialData', { current, alerts: liveAlerts.slice(0, 30), history: sensorHistory });
  socket.on('disconnect', () => console.log('Browser disconnected:', socket.id));
});

// ─── Built-in Simulator ───────────────────────────────────────────────────────
const SIM_ROOMS = {
  'Room-A': { base_temp: 4.0, base_humidity: 88.0, base_co2: 600 },
  'Room-B': { base_temp: 3.0, base_humidity: 92.0, base_co2: 700 },
  'Room-C': { base_temp: 2.0, base_humidity: 85.0, base_co2: 500 },
};
const anomalySteps = { 'Room-A': 0, 'Room-B': 0, 'Room-C': 0 };
let simStep = 0;

function gauss(std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std;
}

function runSimulator() {
  const naturalVar = Math.sin(simStep * 0.08) * 0.4;
  Object.entries(SIM_ROOMS).forEach(([roomId, cfg]) => {
    let isAnomaly = false;
    if (anomalySteps[roomId] > 0) { anomalySteps[roomId]--; isAnomaly = true; }
    else if (Math.random() < 0.05) { anomalySteps[roomId] = Math.floor(Math.random() * 6) + 3; isAnomaly = true; }

    let temperature, humidity, co2, doorOpen;
    if (isAnomaly) {
      temperature = cfg.base_temp + 4 + Math.random() * 4;
      humidity    = cfg.base_humidity + 5 + Math.random() * 10;
      co2         = cfg.base_co2 + 350 + Math.random() * 350;
      doorOpen    = Math.random() < 0.45;
    } else {
      temperature = cfg.base_temp + naturalVar + gauss(0.15);
      humidity    = cfg.base_humidity + gauss(0.8);
      co2         = cfg.base_co2 + gauss(18);
      doorOpen    = Math.random() < 0.02;
    }

    temperature = parseFloat(temperature.toFixed(2));
    humidity    = parseFloat(Math.min(100, Math.max(0, humidity)).toFixed(2));
    co2         = parseFloat(Math.max(300, co2).toFixed(1));

    const spoilageRisk = calcRisk(temperature, humidity, co2);
    const point = { timestamp: new Date().toISOString(), temperature, humidity, co2, doorOpen, spoilageRisk };

    sensorHistory[roomId].unshift(point);
    if (sensorHistory[roomId].length > MAX_HIST) sensorHistory[roomId].pop();

    checkAlerts(roomId, { temperature, humidity, co2, doorOpen });
    io.emit('sensorUpdate', { roomId, data: point });
    db.insertReading(roomId, temperature, humidity, co2, doorOpen ? 1 : 0, spoilageRisk);
  });
  simStep++;
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🧊 ColdChain Guard Backend v2 running at http://localhost:${PORT}`);
  console.log('Storage: JSON files in ./data/');
  console.log('Built-in simulator: active (3s interval)\n');
  setInterval(runSimulator, 3000);
});
