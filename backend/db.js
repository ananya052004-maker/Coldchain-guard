const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

// Tests use an isolated in-memory DB so they never touch real data on disk.
const DB_PATH  = process.env.NODE_ENV === 'test' ? ':memory:' : path.join(DIR, 'coldchain.db');
const isNewDb  = DB_PATH !== ':memory:' && !fs.existsSync(DB_PATH);
const db       = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cold_storages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    room_key        TEXT NOT NULL UNIQUE,
    user_id         INTEGER NOT NULL,
    cold_storage_id INTEGER NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,
    product         TEXT,
    product_emoji   TEXT,
    quantity_kg     REAL DEFAULT 0,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_key  TEXT NOT NULL UNIQUE,
    room_id    TEXT NOT NULL,
    message    TEXT NOT NULL,
    severity   TEXT NOT NULL,
    resolved   INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_alerts_room ON alerts(room_id);

  CREATE TABLE IF NOT EXISTS readings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id       TEXT NOT NULL,
    temperature   REAL,
    humidity      REAL,
    co2           REAL,
    door_open     INTEGER,
    spoilage_risk REAL,
    created_at    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_readings_room ON readings(room_id);

  CREATE TABLE IF NOT EXISTS insights (
    id              TEXT PRIMARY KEY,
    room_id         TEXT NOT NULL,
    room_name       TEXT,
    root_cause      TEXT,
    recommendation  TEXT,
    urgency         TEXT,
    trigger_reasons TEXT,
    created_at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_insights_room ON insights(room_id);
`);

// One-time import of the old flat-JSON data store, so switching to SQLite
// doesn't lose whatever users/rooms/history already existed on disk.
if (isNewDb) migrateFromJson();

function migrateFromJson() {
  const OLD = {
    users:        path.join(DIR, 'users.json'),
    coldStorages: path.join(DIR, 'cold_storages.json'),
    rooms:        path.join(DIR, 'rooms.json'),
    alerts:       path.join(DIR, 'alerts.json'),
    readings:     path.join(DIR, 'readings.json'),
    insights:     path.join(DIR, 'insights.json'),
  };
  const readJson = (f) => {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return []; }
  };
  let migrated = false;

  if (fs.existsSync(OLD.users)) {
    const rows = readJson(OLD.users);
    const stmt = db.prepare('INSERT INTO users (id, name, email, password, created_at) VALUES (?,?,?,?,?)');
    db.transaction(rs => rs.forEach(u => stmt.run(u.id, u.name, u.email, u.password, u.created_at)))(rows);
    migrated = migrated || rows.length > 0;
  }
  if (fs.existsSync(OLD.coldStorages)) {
    const rows = readJson(OLD.coldStorages);
    const stmt = db.prepare('INSERT INTO cold_storages (id, user_id, name, created_at) VALUES (?,?,?,?)');
    db.transaction(rs => rs.forEach(c => stmt.run(c.id, c.user_id, c.name, c.created_at)))(rows);
    migrated = migrated || rows.length > 0;
  }
  if (fs.existsSync(OLD.rooms)) {
    const rows = readJson(OLD.rooms);
    const stmt = db.prepare(`INSERT INTO rooms
      (id, room_key, user_id, cold_storage_id, name, category, product, product_emoji, quantity_kg, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(rs => rs.forEach(r => stmt.run(
      r.id, r.room_key, r.user_id, r.cold_storage_id, r.name, r.category,
      r.product || null, r.product_emoji || null, r.quantity_kg || 0, r.created_at,
    )))(rows);
    migrated = migrated || rows.length > 0;
  }
  if (fs.existsSync(OLD.alerts)) {
    const rows = readJson(OLD.alerts);
    const stmt = db.prepare(`INSERT OR IGNORE INTO alerts
      (alert_key, room_id, message, severity, resolved, created_at) VALUES (?,?,?,?,?,?)`);
    db.transaction(rs => rs.forEach(a => stmt.run(
      String(a.alert_key), a.room_id, a.message, a.severity, a.resolved ? 1 : 0, a.created_at,
    )))(rows);
    migrated = migrated || rows.length > 0;
  }
  if (fs.existsSync(OLD.readings)) {
    const rows = readJson(OLD.readings);
    const stmt = db.prepare(`INSERT INTO readings
      (room_id, temperature, humidity, co2, door_open, spoilage_risk, created_at) VALUES (?,?,?,?,?,?,?)`);
    db.transaction(rs => rs.forEach(r => stmt.run(
      r.room_id, r.temperature, r.humidity, r.co2, r.door_open ? 1 : 0, r.spoilage_risk, r.created_at,
    )))(rows);
    migrated = migrated || rows.length > 0;
  }
  if (fs.existsSync(OLD.insights)) {
    const rows = readJson(OLD.insights);
    const stmt = db.prepare(`INSERT OR IGNORE INTO insights
      (id, room_id, room_name, root_cause, recommendation, urgency, trigger_reasons, created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    db.transaction(rs => rs.forEach(i => stmt.run(
      String(i.id), i.room, i.roomName, i.rootCause, i.recommendation, i.urgency,
      JSON.stringify(i.triggerReasons || []), i.timestamp,
    )))(rows);
    migrated = migrated || rows.length > 0;
  }

  if (migrated) console.log('Migrated existing JSON data into SQLite (backend/data/coldchain.db).');
}

// ─── Users ────────────────────────────────────────────────────────────────────
function findByEmail(email) { return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null; }
function findById(id)       { return db.prepare('SELECT * FROM users WHERE id = ?').get(id)       || null; }

function createUser(name, email, password) {
  const created_at = new Date().toISOString();
  const info = db.prepare('INSERT INTO users (name, email, password, created_at) VALUES (?,?,?,?)')
    .run(name, email, password, created_at);
  return { id: info.lastInsertRowid, name, email, password, created_at };
}

function allUsers() {
  return db.prepare('SELECT id, name, email, created_at FROM users ORDER BY id DESC').all();
}

function safeUser(u) {
  if (!u) return null;
  const { password: _, ...safe } = u;
  return safe;
}

// ─── Cold Storages ────────────────────────────────────────────────────────────
function createColdStorage(userId, name) {
  const created_at = new Date().toISOString();
  const info = db.prepare('INSERT INTO cold_storages (user_id, name, created_at) VALUES (?,?,?)')
    .run(userId, name, created_at);
  return { id: info.lastInsertRowid, user_id: userId, name, created_at };
}

function getUserColdStorages(userId) {
  return db.prepare('SELECT * FROM cold_storages WHERE user_id = ?').all(userId);
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
function createRoom(userId, coldStorageId, name, category, product, productEmoji, quantityKg) {
  const created_at = new Date().toISOString();
  const info = db.prepare(`INSERT INTO rooms
    (room_key, user_id, cold_storage_id, name, category, product, product_emoji, quantity_kg, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('pending', userId, coldStorageId, name, category, product || null, productEmoji || '📦', quantityKg || 0, created_at);
  const id       = info.lastInsertRowid;
  const room_key = `room_${id}`;
  db.prepare('UPDATE rooms SET room_key = ? WHERE id = ?').run(room_key, id);
  return {
    id, room_key, user_id: userId, cold_storage_id: coldStorageId, name, category,
    product: product || null, product_emoji: productEmoji || '📦', quantity_kg: quantityKg || 0, created_at,
  };
}

function getUserRooms(userId) { return db.prepare('SELECT * FROM rooms WHERE user_id = ?').all(userId); }
function getRoomById(id)      { return db.prepare('SELECT * FROM rooms WHERE id = ?').get(id)       || null; }
function getRoomByKey(key)    { return db.prepare('SELECT * FROM rooms WHERE room_key = ?').get(key) || null; }
function allRooms()           { return db.prepare('SELECT * FROM rooms').all(); }

function deleteRoom(roomId, userId) {
  db.prepare('DELETE FROM rooms WHERE id = ? AND user_id = ?').run(roomId, userId);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────
function insertAlert(key, room_id, message, severity) {
  const exists = db.prepare('SELECT 1 FROM alerts WHERE alert_key = ?').get(key);
  if (exists) return;
  db.prepare(`INSERT INTO alerts (alert_key, room_id, message, severity, resolved, created_at)
    VALUES (?,?,?,?,0,?)`).run(key, room_id, message, severity, new Date().toISOString());
  db.prepare(`DELETE FROM alerts WHERE id NOT IN (SELECT id FROM alerts ORDER BY id DESC LIMIT 1000)`).run();
}

function getUserAlerts(userId, limit = 200) {
  return db.prepare(`
    SELECT a.* FROM alerts a
    JOIN rooms r ON r.room_key = a.room_id
    WHERE r.user_id = ?
    ORDER BY a.id DESC LIMIT ?
  `).all(userId, limit);
}

function getAlerts(limit = 200) {
  return db.prepare('SELECT * FROM alerts ORDER BY id DESC LIMIT ?').all(limit);
}

// ─── Readings ─────────────────────────────────────────────────────────────────
function insertReading(room_id, temperature, humidity, co2, door_open, spoilage_risk) {
  db.prepare(`INSERT INTO readings (room_id, temperature, humidity, co2, door_open, spoilage_risk, created_at)
    VALUES (?,?,?,?,?,?,?)`)
    .run(room_id, temperature, humidity, co2, door_open, spoilage_risk, new Date().toISOString());
}

function getReadings(room_id, limit = 200) {
  return db.prepare('SELECT * FROM readings WHERE room_id = ? ORDER BY id DESC LIMIT ?').all(room_id, limit);
}

// ─── AI Insights ──────────────────────────────────────────────────────────────
function insertInsight(insight) {
  db.prepare(`INSERT INTO insights
    (id, room_id, room_name, root_cause, recommendation, urgency, trigger_reasons, created_at)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(
      String(insight.id), insight.room, insight.roomName, insight.rootCause, insight.recommendation,
      insight.urgency, JSON.stringify(insight.triggerReasons || []), insight.timestamp,
    );
}

function getUserInsights(userId, limit = 100) {
  const rows = db.prepare(`
    SELECT i.* FROM insights i
    JOIN rooms r ON r.room_key = i.room_id
    WHERE r.user_id = ?
    ORDER BY i.created_at DESC LIMIT ?
  `).all(userId, limit);
  return rows.map(r => ({
    id: r.id, room: r.room_id, roomName: r.room_name, rootCause: r.root_cause,
    recommendation: r.recommendation, urgency: r.urgency,
    triggerReasons: JSON.parse(r.trigger_reasons || '[]'), timestamp: r.created_at,
  }));
}

module.exports = {
  findByEmail, findById, createUser, allUsers, safeUser,
  createColdStorage, getUserColdStorages,
  createRoom, getUserRooms, getRoomById, getRoomByKey, allRooms, deleteRoom,
  insertAlert, getAlerts, getUserAlerts,
  insertReading, getReadings,
  insertInsight, getUserInsights,
};
