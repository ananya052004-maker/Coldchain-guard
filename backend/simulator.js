// Sensor simulator — publishes fake telemetry over MQTT instead of calling
// backend functions directly. This is what a real ESP32 + DHT22/BME280 sensor
// would do in its place: connect to the broker and publish JSON to
// `coldchain/<room_key>/telemetry` every few seconds. Swapping this file out
// for real hardware requires no protocol-level change on the backend side —
// see "Swapping in real hardware" in prep.md.
//
// Runs automatically in-process alongside the backend (see server.js) so a
// single `node server.js` still gives a fully working demo with zero extra
// steps. It can also run as its own OS process — `node simulator.js` — to
// demonstrate the simulator and backend as genuinely separate MQTT clients.
const db   = require('./db');
const { connectClient, topicFor } = require('./mqtt');
const { CATEGORY_BASES } = require('./risk');

const anomalySteps = {};
let simStep = 0;

function gauss(std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * std;
}

function generateReading(room) {
  const key        = room.room_key;
  const cfg        = CATEGORY_BASES[room.category] || CATEGORY_BASES.fruits;
  const naturalVar = Math.sin(simStep * 0.08) * 0.4;

  let isAnomaly = false;
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

  return {
    temperature: parseFloat(temperature.toFixed(2)),
    humidity:    parseFloat(Math.min(100, Math.max(0, humidity)).toFixed(2)),
    co2:         parseFloat(Math.max(300, co2).toFixed(1)),
    doorOpen,
  };
}

function start({ intervalMs = 3000 } = {}) {
  const client = connectClient('coldchain-simulator');

  client.on('connect', () => console.log('Simulator: connected to MQTT broker'));
  client.on('error', (err) => console.error('Simulator MQTT error:', err.message));

  const timer = setInterval(() => {
    db.allRooms().forEach(room => {
      if (!(room.room_key in anomalySteps)) anomalySteps[room.room_key] = 0;
      const reading = generateReading(room);
      client.publish(topicFor(room.room_key), JSON.stringify(reading), { qos: 0 });
    });
    simStep++;
  }, intervalMs);

  return { client, stop: () => { clearInterval(timer); client.end(); } };
}

if (require.main === module) start();

module.exports = { start, generateReading };
