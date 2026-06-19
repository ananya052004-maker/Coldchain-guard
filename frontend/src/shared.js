export const API = 'https://coldchain-guard-backend.onrender.com';

export const CATEGORIES = {
  fruits:     { label: 'Fruits',     emoji: '🍎', temp: [1,  8],  humidity: [80, 95], co2: 1000, desc: 'Fresh fruits requiring cold storage' },
  vegetables: { label: 'Vegetables', emoji: '🥦', temp: [0,  8],  humidity: [85, 98], co2: 1000, desc: 'Fresh vegetables and leafy greens' },
  dairy:      { label: 'Dairy',      emoji: '🧀', temp: [2,  4],  humidity: [80, 90], co2: 1000, desc: 'Milk, cheese, butter, yogurt' },
  medicines:  { label: 'Medicines',  emoji: '💊', temp: [2,  8],  humidity: [35, 60], co2: 600,  desc: 'Pharmaceutical products requiring refrigeration' },
  vaccines:   { label: 'Vaccines',   emoji: '💉', temp: [2,  8],  humidity: [35, 55], co2: 600,  desc: 'Vaccines — strict cold chain required' },
  grains:     { label: 'Grains',     emoji: '🌾', temp: [10, 20], humidity: [50, 70], co2: 800,  desc: 'Grains, cereals and pulses' },
  meat:       { label: 'Meat',       emoji: '🥩', temp: [0,  4],  humidity: [85, 95], co2: 1000, desc: 'Fresh meat and poultry' },
};

export const PRODUCTS = {
  fruits:     [
    { value: 'apple',       label: 'Apple',       emoji: '🍎' },
    { value: 'mango',       label: 'Mango',       emoji: '🥭' },
    { value: 'banana',      label: 'Banana',      emoji: '🍌' },
    { value: 'grapes',      label: 'Grapes',      emoji: '🍇' },
    { value: 'strawberry',  label: 'Strawberry',  emoji: '🍓' },
    { value: 'pomegranate', label: 'Pomegranate', emoji: '🍊' },
    { value: 'orange',      label: 'Orange',      emoji: '🍊' },
    { value: 'kiwi',        label: 'Kiwi',        emoji: '🥝' },
  ],
  vegetables: [
    { value: 'tomato',   label: 'Tomato',   emoji: '🍅' },
    { value: 'potato',   label: 'Potato',   emoji: '🥔' },
    { value: 'onion',    label: 'Onion',    emoji: '🧅' },
    { value: 'carrot',   label: 'Carrot',   emoji: '🥕' },
    { value: 'spinach',  label: 'Spinach',  emoji: '🥬' },
    { value: 'broccoli', label: 'Broccoli', emoji: '🥦' },
    { value: 'cabbage',  label: 'Cabbage',  emoji: '🥬' },
    { value: 'pepper',   label: 'Pepper',   emoji: '🫑' },
  ],
  dairy: [
    { value: 'milk',    label: 'Milk',    emoji: '🥛' },
    { value: 'cheese',  label: 'Cheese',  emoji: '🧀' },
    { value: 'butter',  label: 'Butter',  emoji: '🧈' },
    { value: 'yogurt',  label: 'Yogurt',  emoji: '🥛' },
    { value: 'cream',   label: 'Cream',   emoji: '🥛' },
    { value: 'paneer',  label: 'Paneer',  emoji: '🧀' },
  ],
  medicines: [
    { value: 'tablets',    label: 'Tablets',    emoji: '💊' },
    { value: 'capsules',   label: 'Capsules',   emoji: '💊' },
    { value: 'injections', label: 'Injections', emoji: '💉' },
    { value: 'syrup',      label: 'Syrup',      emoji: '🧪' },
    { value: 'insulin',    label: 'Insulin',    emoji: '💉' },
    { value: 'drops',      label: 'Eye/Ear Drops', emoji: '💧' },
  ],
  vaccines: [
    { value: 'covid',     label: 'COVID-19',   emoji: '💉' },
    { value: 'flu',       label: 'Influenza',  emoji: '💉' },
    { value: 'hepatitis', label: 'Hepatitis',  emoji: '💉' },
    { value: 'polio',     label: 'Polio',      emoji: '💉' },
    { value: 'typhoid',   label: 'Typhoid',    emoji: '💉' },
    { value: 'general',   label: 'General',    emoji: '💉' },
  ],
  grains: [
    { value: 'rice',   label: 'Rice',   emoji: '🍚' },
    { value: 'wheat',  label: 'Wheat',  emoji: '🌾' },
    { value: 'corn',   label: 'Corn',   emoji: '🌽' },
    { value: 'oats',   label: 'Oats',   emoji: '🌾' },
    { value: 'barley', label: 'Barley', emoji: '🌾' },
    { value: 'dal',    label: 'Dal/Pulses', emoji: '🫘' },
  ],
  meat: [
    { value: 'chicken', label: 'Chicken', emoji: '🍗' },
    { value: 'beef',    label: 'Beef',    emoji: '🥩' },
    { value: 'fish',    label: 'Fish',    emoji: '🐟' },
    { value: 'pork',    label: 'Pork',    emoji: '🥩' },
    { value: 'mutton',  label: 'Mutton',  emoji: '🥩' },
    { value: 'prawns',  label: 'Prawns',  emoji: '🍤' },
  ],
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
  localStorage.removeItem('ccg_active_rooms');
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

export function analyzeRoom(category, product, reading) {
  if (!category || !reading) return [];
  const c = CATEGORIES[category];
  if (!c) return [];
  const issues = [];
  if (reading.temperature < c.temp[0])
    issues.push({ msg: `Too cold for ${product || c.label} (min ${c.temp[0]}°C)`, type: 'critical' });
  if (reading.temperature > c.temp[1])
    issues.push({ msg: `Too warm for ${product || c.label} (max ${c.temp[1]}°C)`, type: 'critical' });
  if (reading.humidity < c.humidity[0])
    issues.push({ msg: `Humidity too low (min ${c.humidity[0]}%)`, type: 'warning' });
  if (reading.humidity > c.humidity[1])
    issues.push({ msg: `Humidity too high (max ${c.humidity[1]}%)`, type: 'warning' });
  if (reading.co2 > c.co2)
    issues.push({ msg: `CO₂ too high (max ${c.co2} ppm)`, type: 'warning' });
  return issues;
}
