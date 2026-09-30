const net    = require('net');
const { Aedes } = require('aedes');
const mqtt   = require('mqtt');

const MQTT_PORT = parseInt(process.env.MQTT_PORT || '1883', 10);
const MQTT_HOST = process.env.MQTT_HOST || 'localhost';

const TOPIC_PREFIX = 'coldchain';
const topicFor  = (roomKey) => `${TOPIC_PREFIX}/${roomKey}/telemetry`;
const TOPIC_ALL = `${TOPIC_PREFIX}/+/telemetry`;

// Starts a real MQTT broker (Aedes speaks the actual MQTT wire protocol over
// plain TCP — the same protocol a real ESP32/Raspberry Pi would use) on
// MQTT_PORT. Embedding it in this process means the deployed app needs no
// separate broker installed (e.g. Mosquitto) to demo end-to-end, at the cost
// of only being reachable from whatever can already reach this process — see
// the MQTT section in prep.md for what that trade-off means for a real device.
async function startBroker() {
  const aedes  = await Aedes.createBroker();
  const server = net.createServer(aedes.handle);
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(MQTT_PORT, resolve);
  });
  console.log(`MQTT broker listening on :${MQTT_PORT}`);
  return { aedes, server };
}

function connectClient(clientId) {
  return mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`, { clientId, reconnectPeriod: 2000 });
}

module.exports = { startBroker, connectClient, topicFor, TOPIC_ALL, MQTT_PORT, MQTT_HOST };
