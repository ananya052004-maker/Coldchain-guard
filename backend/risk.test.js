const test   = require('node:test');
const assert = require('node:assert/strict');
const { calcRisk, linreg, computeForecast } = require('./risk');

test('calcRisk is 0 when every reading is inside the safe range', () => {
  assert.equal(calcRisk(4, 88, 600, 'fruits'), 0);
});

test('calcRisk increases the further a reading drifts past the safe max', () => {
  const nearBreach = calcRisk(9, 88, 600, 'fruits');
  const farBreach  = calcRisk(14, 88, 600, 'fruits');
  assert.ok(nearBreach > 0);
  assert.ok(farBreach > nearBreach);
});

test('calcRisk is clamped to [0, 100]', () => {
  assert.equal(calcRisk(500, 500, 100000, 'fruits'), 100);
  assert.equal(calcRisk(4, 88, 600, 'fruits'), 0);
});

test('calcRisk falls back to fruits thresholds for an unknown category', () => {
  assert.equal(calcRisk(4, 88, 600, 'not-a-real-category'), 0);
});

test('linreg fits a perfect line with slope and r2 = 1', () => {
  const xs = [0, 3, 6, 9, 12];
  const ys = [1, 2, 3, 4, 5];
  const { slope, r2 } = linreg(xs, ys);
  assert.ok(Math.abs(slope - 1 / 3) < 1e-9);
  assert.ok(r2 > 0.999);
});

test('linreg reports a low r2 for noise around a flat line', () => {
  const xs = [0, 3, 6, 9, 12, 15, 18, 21];
  const ys = [5, 5.4, 4.6, 5.3, 4.7, 5.5, 4.5, 5.2];
  const { r2 } = linreg(xs, ys);
  assert.ok(r2 < 0.5);
});

test('computeForecast returns null when there is not enough history yet', () => {
  const history = [{ temperature: 4, humidity: 88, co2: 600 }];
  assert.equal(computeForecast(history, 'fruits'), null);
});

test('computeForecast predicts a breach for a clean upward temperature trend', () => {
  // history is newest-first (index 0 = latest reading), matching sensorHistory's convention.
  const history = [];
  for (let i = 0; i < 20; i++) {
    const chronoIndex = 19 - i; // 0 = oldest .. 19 = newest
    history.push({ temperature: 6.0 + chronoIndex * 0.05, humidity: 88, co2: 600 });
  }
  const forecast = computeForecast(history, 'fruits');
  assert.ok(forecast);
  assert.ok(forecast.metrics.temperature.breachInSec > 0);
  assert.equal(forecast.metrics.temperature.breachType, 'max');
  // Flat humidity/CO2 shouldn't falsely predict a breach.
  assert.equal(forecast.metrics.humidity.breachInSec, null);
  assert.equal(forecast.metrics.co2.breachInSec, null);
});

test('computeForecast does not predict a breach for stable, noisy-but-flat readings', () => {
  // Realistic "everything is fine" data: hovering around the middle of the safe
  // range with jitter, no clean directional trend for linreg to latch onto.
  const noisyTemps = [4.5, 4.8, 4.2, 4.6, 4.4, 4.7, 4.3, 4.5, 4.6, 4.4, 4.5, 4.7, 4.3, 4.6, 4.4, 4.5, 4.6, 4.4, 4.7, 4.3];
  const history = noisyTemps.map(temperature => ({ temperature, humidity: 88, co2: 600 }));
  const forecast = computeForecast(history, 'fruits');
  assert.ok(forecast);
  assert.equal(forecast.metrics.temperature.breachInSec, null);
});
