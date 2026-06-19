const fs   = require('fs');
const path = require('path');

const DIR     = path.join(__dirname, 'data');
const USERS_F = path.join(DIR, 'users.json');
const CS_F    = path.join(DIR, 'cold_storages.json');
const ROOMS_F = path.join(DIR, 'rooms.json');
const ALERTS_F= path.join(DIR, 'alerts.json');
const READS_F = path.join(DIR, 'readings.json');

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);
[USERS_F, CS_F, ROOMS_F, ALERTS_F, READS_F].forEach(f => {
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
});

function read(f)       { return JSON.parse(fs.readFileSync(f, 'utf8')); }
function save(f, data) { fs.writeFileSync(f, JSON.stringify(data, null, 2)); }
function nextId(arr)   { return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1; }

// ─── Users ────────────────────────────────────────────────────────────────────
function findByEmail(email) { return read(USERS_F).find(u => u.email === email) || null; }
function findById(id)       { return read(USERS_F).find(u => u.id === id)       || null; }

function createUser(name, email, password) {
  const users = read(USERS_F);
  const user  = { id: nextId(users), name, email, password, created_at: new Date().toISOString() };
  users.push(user);
  save(USERS_F, users);
  return user;
}

function allUsers() {
  return read(USERS_F).map(({ password: _, ...u }) => u).sort((a, b) => b.id - a.id);
}

function safeUser(u) {
  if (!u) return null;
  const { password: _, ...safe } = u;
  return safe;
}

// ─── Cold Storages ────────────────────────────────────────────────────────────
function createColdStorage(userId, name) {
  const list = read(CS_F);
  const cs   = { id: nextId(list), user_id: userId, name, created_at: new Date().toISOString() };
  list.push(cs);
  save(CS_F, list);
  return cs;
}

function getUserColdStorages(userId) {
  return read(CS_F).filter(c => c.user_id === userId);
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
function createRoom(userId, coldStorageId, name, category, product, productEmoji, quantityKg) {
  const list = read(ROOMS_F);
  const id   = nextId(list);
  const room = {
    id,
    room_key:        `room_${id}`,
    user_id:         userId,
    cold_storage_id: coldStorageId,
    name,
    category,
    product,
    product_emoji:   productEmoji || '📦',
    quantity_kg:     quantityKg   || 0,
    created_at:      new Date().toISOString(),
  };
  list.push(room);
  save(ROOMS_F, list);
  return room;
}

function getUserRooms(userId) { return read(ROOMS_F).filter(r => r.user_id === userId); }
function getRoomById(id)      { return read(ROOMS_F).find(r => r.id       === id)  || null; }
function getRoomByKey(key)    { return read(ROOMS_F).find(r => r.room_key === key) || null; }
function allRooms()           { return read(ROOMS_F); }

function deleteRoom(roomId, userId) {
  let list = read(ROOMS_F);
  list = list.filter(r => !(r.id === roomId && r.user_id === userId));
  save(ROOMS_F, list);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
function insertAlert(key, room_id, message, severity) {
  const alerts = read(ALERTS_F);
  if (alerts.find(a => a.alert_key === key)) return;
  alerts.unshift({ id: Date.now(), alert_key: key, room_id, message, severity, resolved: 0, created_at: new Date().toISOString() });
  if (alerts.length > 1000) alerts.length = 1000;
  save(ALERTS_F, alerts);
}

function getUserAlerts(userId, limit = 200) {
  const keys = new Set(read(ROOMS_F).filter(r => r.user_id === userId).map(r => r.room_key));
  return read(ALERTS_F).filter(a => keys.has(a.room_id)).slice(0, limit);
}

function getAlerts(limit = 200) { return read(ALERTS_F).slice(0, limit); }

// ─── Readings ─────────────────────────────────────────────────────────────────
function insertReading(room_id, temperature, humidity, co2, door_open, spoilage_risk) {
  const rows = read(READS_F);
  rows.unshift({ id: Date.now(), room_id, temperature, humidity, co2, door_open, spoilage_risk, created_at: new Date().toISOString() });
  if (rows.length > 5000) rows.length = 5000;
  save(READS_F, rows);
}

function getReadings(room_id, limit = 200) {
  return read(READS_F).filter(r => r.room_id === room_id).slice(0, limit);
}

module.exports = {
  findByEmail, findById, createUser, allUsers, safeUser,
  createColdStorage, getUserColdStorages,
  createRoom, getUserRooms, getRoomById, getRoomByKey, allRooms, deleteRoom,
  insertAlert, getAlerts, getUserAlerts,
  insertReading, getReadings,
};
