// Runs against an isolated in-memory SQLite DB (see db.js) — never touches
// backend/data/coldchain.db, so this is safe to run against real data.
process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'test-secret';

const test    = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const app     = require('./server');

const email = `test-${Date.now()}@example.com`;
let token;

test('rejects registration with missing fields', async () => {
  const res = await request(app).post('/api/auth/register').send({ email });
  assert.equal(res.status, 400);
});

test('registers a new user and returns a token', async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'secret123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, email);
  assert.equal(res.body.user.password, undefined); // never leak the hash
  token = res.body.token;
});

test('rejects a second registration with the same email', async () => {
  const res = await request(app).post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'secret123' });
  assert.equal(res.status, 409);
});

test('rejects login with the wrong password', async () => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
  assert.equal(res.status, 401);
});

test('logs in with the correct password', async () => {
  const res = await request(app).post('/api/auth/login').send({ email, password: 'secret123' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
});

test('rejects protected routes with no token', async () => {
  const res = await request(app).get('/api/rooms');
  assert.equal(res.status, 401);
});

test('rejects protected routes with a garbage token', async () => {
  const res = await request(app).get('/api/rooms').set('Authorization', 'Bearer not-a-real-token');
  assert.equal(res.status, 401);
});

test('creates a cold storage and a room scoped to the authenticated user', async () => {
  const csRes = await request(app).post('/api/cold-storages')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Test Warehouse' });
  assert.equal(csRes.status, 200);
  assert.ok(csRes.body.id);

  const roomRes = await request(app).post('/api/rooms')
    .set('Authorization', `Bearer ${token}`)
    .send({ cold_storage_id: csRes.body.id, name: 'Room X', category: 'fruits', quantity_kg: 120 });
  assert.equal(roomRes.status, 200);
  assert.ok(roomRes.body.room_key);

  const listRes = await request(app).get('/api/rooms').set('Authorization', `Bearer ${token}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.rooms.length, 1);
  assert.equal(listRes.body.rooms[0].name, 'Room X');
});

test('a second user cannot see the first user\'s rooms', async () => {
  const otherEmail = `other-${Date.now()}@example.com`;
  const regRes = await request(app).post('/api/auth/register')
    .send({ name: 'Other User', email: otherEmail, password: 'secret123' });
  const otherToken = regRes.body.token;

  const listRes = await request(app).get('/api/rooms').set('Authorization', `Bearer ${otherToken}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.rooms.length, 0);
});
