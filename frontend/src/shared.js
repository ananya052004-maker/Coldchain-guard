export const API = 'https://coldchain-guard-backend.onrender.com';

export const CROPS = {
  apple:       { label: 'Apple',       emoji: '🍎', temp: [0, 4],   humidity: [85, 92], co2: 3000, desc: 'Requires cold, dry conditions' },
  mango:       { label: 'Mango',       emoji: '🥭', temp: [10, 15], humidity: [85, 90], co2: 1000, desc: 'Tropical fruit, warm storage' },
  banana:      { label: 'Banana',      emoji: '🍌', temp: [13, 18], humidity: [85, 95], co2: 1000, desc: 'Sensitive to cold injury' },
  grapes:      { label: 'Grapes',      emoji: '🍇', temp: [-1, 1],  humidity: [90, 95], co2: 1000, desc: 'Near-freezing storage ideal' },
  strawberry:  { label: 'Strawberry',  emoji: '🍓', temp: [0, 2],   humidity: [90, 95], co2: 1000, desc: 'Short shelf life, keep cold' },
  pomegranate: { label: 'Pomegranate', emoji: '🍊', temp: [5, 8],   humidity: [85, 90], co2: 1000, desc: 'Medium temperature tolerance' },
  tomato:      { label: 'Tomato',      emoji: '🍅', temp: [10, 15], humidity: [85, 95], co2: 1000, desc: 'Chilling sensitive below 10°C' },
  potato:      { label: 'Potato',      emoji: '🥔', temp: [4, 8],   humidity: [85, 92], co2: 1000, desc: 'Cool and ventilated storage' },
  onion:       { label: 'Onion',       emoji: '🧅', temp: [0, 4],   humidity: [65, 70], co2: 1000, desc: 'Needs low humidity to prevent rot' },
  carrot:      { label: 'Carrot',      emoji: '🥕', temp: [0, 4],   humidity: [90, 95], co2: 1000, desc: 'High humidity, near freezing' },
  spinach:     { label: 'Spinach',     emoji: '🥬', temp: [0, 2],   humidity: [95, 100],co2: 1000, desc: 'Very cold and high humidity' },
  broccoli:    { label: 'Broccoli',    emoji: '🥦', temp: [0, 4],   humidity: [90, 98], co2: 1000, desc: 'Degrades fast above 5°C' },
  milk:        { label: 'Milk',        emoji: '🥛', temp: [2, 4],   humidity: [80, 90], co2: 1000, desc: 'Keep just above freezing' },
  cheese:      { label: 'Cheese',      emoji: '🧀', temp: [4, 8],   humidity: [80, 85], co2: 1000, desc: 'Controlled humidity essential' },
};

export const ROOMS = {
  'Room-A': { name: 'Fruits Storage',     emoji: '🍎' },
  'Room-B': { name: 'Vegetables Storage', emoji: '🥦' },
  'Room-C': { name: 'Dairy Storage',      emoji: '🧀' },
};

export function getToken() { return localStorage.getItem('ccg_token'); }
export function getUser()  { return JSON.parse(localStorage.getItem('ccg_user') || 'null'); }
export function setAuth(token, user) {
  localStorage.setItem('ccg_token', token);
  localStorage.setItem('ccg_user', JSON.stringify(user));
}
export function clearAuth() {
  localStorage.removeItem('ccg_token');
  localStorage.removeItem('ccg_user');
}

export function authHeaders() {
  return { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
}

export const risk_color = (r) => r < 30 ? '#4ade80' : r < 60 ? '#fbbf24' : '#f87171';
export const risk_label = (r) => r < 30 ? 'Safe'    : r < 60 ? 'Warning'  : 'Critical';

export function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function analyzeCrop(crop, reading) {
  if (!crop || !reading) return [];
  const c = CROPS[crop];
  if (!c) return [];
  const issues = [];
  if (reading.temperature < c.temp[0])
    issues.push({ msg: `Too cold for ${c.label} (min ${c.temp[0]}°C)`, type: 'critical' });
  if (reading.temperature > c.temp[1])
    issues.push({ msg: `Too warm for ${c.label} (max ${c.temp[1]}°C)`, type: 'critical' });
  if (reading.humidity < c.humidity[0])
    issues.push({ msg: `Humidity too low for ${c.label} (min ${c.humidity[0]}%)`, type: 'warning' });
  if (reading.humidity > c.humidity[1])
    issues.push({ msg: `Humidity too high for ${c.label} (max ${c.humidity[1]}%)`, type: 'warning' });
  if (reading.co2 > c.co2)
    issues.push({ msg: `CO₂ too high for ${c.label} (max ${c.co2} ppm)`, type: 'warning' });
  return issues;
}
