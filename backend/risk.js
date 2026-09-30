// Pure, dependency-free risk scoring + predictive forecasting math.
// Kept separate from server.js (no Express/Socket.io/DB imports) so it can be
// unit tested in isolation — see risk.test.js.

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

// ─── Predictive spoilage forecasting ───────────────────────────────────────────
// Fits a least-squares trend line per metric over the recent window and
// extrapolates forward, so drift can be caught before a threshold is crossed
// instead of only reacting once it already has been.
const FORECAST_WINDOW  = 20;   // readings (~60s at the 3s simulator interval)
const FORECAST_HORIZON = 900;  // don't predict further than 15 min out
const MIN_R2           = 0.35; // require a reasonably clean trend, not noise

function linreg(xs, ys) {
  const n = xs.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; sumXY += xs[i] * ys[i]; sumXX += xs[i] * xs[i]; }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, r2: 0 };
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) { const pred = slope * xs[i] + intercept; ssRes += (ys[i] - pred) ** 2; ssTot += (ys[i] - meanY) ** 2; }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, r2 };
}

function computeForecast(history, category) {
  const t = CATEGORY_THRESHOLDS[category] || CATEGORY_THRESHOLDS.fruits;
  const window = history.slice(0, FORECAST_WINDOW);
  if (window.length < 8) return null;

  const chrono = [...window].reverse(); // oldest -> newest
  const xs     = chrono.map((_, i) => i * 3);
  const latest = chrono[chrono.length - 1];
  const metrics = ['temperature', 'humidity', 'co2'];
  const result  = { horizonSec: FORECAST_HORIZON, metrics: {} };

  metrics.forEach(m => {
    const ys = chrono.map(p => p[m]);
    const { slope, r2 } = linreg(xs, ys);
    const current = latest[m];
    const bounds  = m === 'co2' ? { max: t.co2.max } : t[m];
    let breachInSec = null, breachType = null;

    if (r2 >= MIN_R2 && Math.abs(slope) > 1e-4) {
      if (bounds.max != null && slope > 0 && current < bounds.max) {
        const secs = (bounds.max - current) / slope;
        if (secs > 0 && secs <= FORECAST_HORIZON) { breachInSec = secs; breachType = 'max'; }
      } else if (bounds.min != null && slope < 0 && current > bounds.min) {
        const secs = (bounds.min - current) / slope;
        if (secs > 0 && secs <= FORECAST_HORIZON) { breachInSec = secs; breachType = 'min'; }
      }
    }
    result.metrics[m] = { slopePerMin: slope * 60, r2, breachInSec, breachType };
  });

  const projectAt = (secs) => {
    const proj = {};
    metrics.forEach(m => { proj[m] = latest[m] + (result.metrics[m].slopePerMin / 60) * secs; });
    return calcRisk(proj.temperature, proj.humidity, proj.co2, category);
  };
  result.projectedRisk5min  = Math.round(projectAt(300));
  result.projectedRisk15min = Math.round(projectAt(900));
  return result;
}

module.exports = {
  CATEGORY_BASES, CATEGORY_THRESHOLDS,
  FORECAST_WINDOW, FORECAST_HORIZON, MIN_R2,
  calcRisk, linreg, computeForecast,
};
