const express  = require('express');
const http     = require('http');
const socketIo = require('socket.io');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const db       = require('./db');

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, { cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] } });

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

// ─── Category configs ─────────────────────────────────────────────────────────
const CATEGORY_BASES = {
  fruits:     { base_temp: 4,  base_humidity: 88, base_co2: 600 },
  vegetables: { base_temp: 3,  base_humidity: 92, base_co2: 700 },
  dairy:      { base_temp: 2,  base_humidity: 85, base_co2: 500 },
  medicines:  { base_temp: 5,  base_humidity: 50, base_co2: 400 },
  vaccines:   { base_temp: 3,  base_humidity: 45, base_co2: 400 },
  grains:     { base_temp: 15, base_humidity: 60, base_co2: 600 },
  meat:       { base_temp: 1,  base_humidity: 90, base_co2: 500 },
};

const CATEGORY_THRESHOLDS = {
  fruits:     { temperature: { min: 1,  max: 8  }, humidity: { min: 80, max: 95 }, co2: { max: 1000 } },
  vegetables: { temperature: { min: 0,  max: 8  }, humidity: { min: 85, max: 98 }, co2: { max: 1000 } },
  dairy:      { temperature: { min: 2,  max: 4  }, humidity: { min: 80, max: 90 }, co2: { max: 1000 } },
  medicines:  { temperature: { min: 2,  max: 8  }, humidity: { min: 35, max: 60 }, co2: { max: 600  } },
  vaccines:   { temperature: { min: 2,  max: 8  }, humidity: { min: 35, max: 55 }, co2: { max: 600  } },
  grains:     { temperature: { min: 10, max: 20 }, humidity: { min: 50, max: 70 }, co2: { max: 800  } },
  meat:       { temperature: { min: 0,  max: 4  }, humidity: { min: 85, max: 95 }, co2: { max: 1000 } },
};

// ─── In-memory state ──────────────────────────────────────────────────────────
const sensorHistory = {};
const liveAlerts    = [];
const anomalySteps  = {};
const MAX_HIST      = 50;

function calcRisk(temp, hum, co2, category) {
  const t = (CATEGORY_THRESHOLDS[category] || CATEGORY_THRESHOLDS.fruits);
  let r = 0;
  if (temp > t.temperature.max)      r += (temp - t.temperature.max) * 10;
  else if (temp < t.temperature.min) r += (t.temperature.min - temp) * 5;
  if (hum > t.humidity.max)          r += (hum - t.humidity.max) * 2;
  else if (hum < t.humidity.min)     r += (t.humidity.min - hum) * 1.5;
  if (co2 > t.co2.max)               r += (co2 - t.co2.max) * 0.05;
  return Math.min(100, Math.max(0, r));
}

function checkAlerts(roomKey, roomName, data, category) {
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
    io.emit('alert', alert);
    db.insertAlert(key, roomKey, msg, sev);
  });
}

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
  if (db.findByEmail(email))        return res.status(409).json({ error: 'Email already registered' });
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
  anomalySteps[room.room_key]  = 0;
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
    delete anomalySteps[room.room_key];
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

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('Browser connected:', socket.id);
  socket.on('disconnect', () => console.log('Browser disconnected:', socket.id));
});

// ─── Built-in Simulator ───────────────────────────────────────────────────────
function gauss(std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std;
}

let simStep = 0;

function runSimulator() {
  const rooms      = db.allRooms();
  const naturalVar = Math.sin(simStep * 0.08) * 0.4;

  rooms.forEach(room => {
    const key = room.room_key;
    if (!sensorHistory[key]) { sensorHistory[key] = []; anomalySteps[key] = 0; }

    const cfg       = CATEGORY_BASES[room.category] || CATEGORY_BASES.fruits;
    let isAnomaly   = false;
    if (anomalySteps[key] > 0) { anomalySteps[key]--; isAnomaly = true; }
    else if (Math.random() < 0.05) { anomalySteps[key] = Math.floor(Math.random() * 6) + 3; isAnomaly = true; }

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

    const spoilageRisk = calcRisk(temperature, humidity, co2, room.category);
    const point        = { timestamp: new Date().toISOString(), temperature, humidity, co2, doorOpen, spoilageRisk, category: room.category };

    sensorHistory[key].unshift(point);
    if (sensorHistory[key].length > MAX_HIST) sensorHistory[key].pop();

    checkAlerts(key, room.name, { temperature, humidity, co2, doorOpen }, room.category);
    io.emit('sensorUpdate', { roomKey: key, data: point });
    db.insertReading(key, temperature, humidity, co2, doorOpen ? 1 : 0, spoilageRisk);
  });
  simStep++;
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n ColdChain Guard Backend running at http://localhost:${PORT}`);
  console.log('Storage: JSON files in ./data/');
  console.log('Built-in simulator: active (3s interval)\n');
  setInterval(runSimulator, 3000);
});
