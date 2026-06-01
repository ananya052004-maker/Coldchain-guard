const fs   = require('fs');
const path = require('path');

const DIR      = path.join(__dirname, 'data');
const USERS_F  = path.join(DIR, 'users.json');
const ALERTS_F = path.join(DIR, 'alerts.json');
const READS_F  = path.join(DIR, 'readings.json');

if (!fs.existsSync(DIR))      fs.mkdirSync(DIR);
if (!fs.existsSync(USERS_F))  fs.writeFileSync(USERS_F,  '[]');
if (!fs.existsSync(ALERTS_F)) fs.writeFileSync(ALERTS_F, '[]');
if (!fs.existsSync(READS_F))  fs.writeFileSync(READS_F,  '[]');

function read(f)       { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function save(f, data) { fs.writeFileSync(f, JSON.stringify(data, null, 2)); }

// ─── Users ────────────────────────────────────────────────────────────────────
function findByEmail(email)   { return read(USERS_F).find(u => u.email === email) || null; }
function findById(id)         { return read(USERS_F).find(u => u.id === id)    || null; }

function createUser(name, email, password) {
  const users = read(USERS_F);
  const id    = users.length ? Math.max(...users.map(u => u.id)) + 1 : 1;
  const user  = { id, name, email, password, crop: null, crop_emoji: null, quantity_kg: 0, created_at: new Date().toISOString() };
  users.push(user);
  save(USERS_F, users);
  return user;
}

function updateCrop(id, crop, crop_emoji, quantity_kg) {
  const users = read(USERS_F);
  const i     = users.findIndex(u => u.id === id);
  if (i === -1) return null;
  users[i] = { ...users[i], crop, crop_emoji, quantity_kg };
  save(USERS_F, users);
  const { password: _, ...safe } = users[i];
  return safe;
}

function allUsers() {
  return read(USERS_F).map(({ password: _, ...u }) => u).sort((a,b) => b.id - a.id);
}

function safeUser(u) {
  if (!u) return null;
  const { password: _, ...safe } = u;
  return safe;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
function insertAlert(key, room_id, message, severity) {
  const alerts = read(ALERTS_F);
  if (alerts.find(a => a.alert_key === key)) return;
  alerts.unshift({ id: Date.now(), alert_key: key, room_id, message, severity, resolved: 0, created_at: new Date().toISOString() });
  if (alerts.length > 500) alerts.length = 500;
  save(ALERTS_F, alerts);
}

function getAlerts(limit = 200)       { return read(ALERTS_F).slice(0, limit); }

// ─── Readings ─────────────────────────────────────────────────────────────────
function insertReading(room_id, temperature, humidity, co2, door_open, spoilage_risk) {
  const rows = read(READS_F);
  rows.unshift({ id: Date.now(), room_id, temperature, humidity, co2, door_open, spoilage_risk, created_at: new Date().toISOString() });
  if (rows.length > 3000) rows.length = 3000;
  save(READS_F, rows);
}

function getReadings(room_id, limit = 200) {
  return read(READS_F).filter(r => r.room_id === room_id).slice(0, limit);
}

module.exports = { findByEmail, findById, createUser, updateCrop, allUsers, safeUser, insertAlert, getAlerts, insertReading, getReadings };
