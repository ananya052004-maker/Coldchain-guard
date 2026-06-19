import { useEffect, useRef, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { API, CATEGORIES, PRODUCTS, getToken, authHeaders, risk_color, risk_label, fmt } from './shared';
import Layout from './Layout';
import LoginPage      from './pages/LoginPage';
import SetupWizard    from './pages/SetupWizard';
import LiveAlertsPage from './pages/LiveAlertsPage';
import RoomPage       from './pages/RoomPage';
import AnalyticsPage  from './pages/AnalyticsPage';

function Protected({ children }) {
  return getToken() ? children : <Navigate to="/" replace />;
}

// ─── Metric ───────────────────────────────────────────────────────────────────
function Metric({ label, value, unit, warn }) {
  return (
    <div style={{ flex: 1, padding: '14px 12px', background: warn ? '#1a0a0a' : '#111', border: `1px solid ${warn ? '#5a1a1a' : '#2a2a2a'}`, borderRadius: 8 }}>
      <div style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: warn ? '#f87171' : '#fff', lineHeight: 1 }}>
        {value ?? '—'}<span style={{ fontSize: 13, fontWeight: 400, color: '#666', marginLeft: 4 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Room Card ────────────────────────────────────────────────────────────────
function RoomCard({ room, data, history, onClick }) {
  const cat   = CATEGORIES[room.category] || {};
  const risk  = data?.spoilageRisk ?? 0;
  const t     = cat.temp     || [1, 8];
  const h     = cat.humidity || [80, 95];
  const wT    = data?.temperature > t[1] || data?.temperature < t[0];
  const wH    = data?.humidity > h[1] || data?.humidity < h[0];
  const wC    = data?.co2 > (cat.co2 || 1000);
  const warn  = wT || wH || wC || data?.doorOpen;

  const chart = [...(history || [])].reverse().slice(-20).map(d => ({
    t: fmt(d.timestamp), v: +d.temperature?.toFixed(1),
  }));

  return (
    <div onClick={onClick} style={{
      background: '#0a0a0a', border: `1px solid ${warn ? '#4a1a1a' : '#1e1e1e'}`,
      borderTop: `2px solid ${warn ? '#f87171' : '#333'}`,
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s',
    }}>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26 }}>{room.product_emoji || cat.emoji}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{room.name}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 2 }}>{room.product || cat.label} · {room.quantity_kg} kg</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {data && <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 10, color: '#4ade80' }}>Live</span>
            </div>}
            <div style={{ fontSize: 12, fontWeight: 600, color: risk_color(risk) }}>{risk_label(risk)} · {risk.toFixed(0)}%</div>
          </div>
        </div>

        {data?.doorOpen && (
          <div style={{ padding: '7px 10px', borderRadius: 6, marginBottom: 12, background: '#1a1400', border: '1px solid #4a3800', fontSize: 12, color: '#fbbf24' }}>
            🚪 Door is open
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Metric label="Temp"     value={data?.temperature?.toFixed(1)} unit="°C"  warn={wT} />
          <Metric label="Humidity" value={data?.humidity?.toFixed(1)}    unit="%"   warn={wH} />
          <Metric label="CO₂"      value={data?.co2?.toFixed(0)}         unit="ppm" warn={wC} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#555' }}>Spoilage Risk</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: risk_color(risk) }}>{risk.toFixed(1)}%</span>
          </div>
          <div style={{ height: 4, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${risk}%`, background: risk_color(risk), borderRadius: 3, transition: 'width 0.7s' }} />
          </div>
        </div>

        {chart.length > 1 ? (
          <ResponsiveContainer width="100%" height={65}>
            <AreaChart data={chart} margin={{ top: 2, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id={`fill-${room.room_key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a78060" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#a78060" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis hide domain={['auto','auto']} />
              <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 6, fontSize: 11, color: '#fff' }} formatter={v => [`${v}°C`, 'Temp']} />
              <Area type="monotone" dataKey="v" stroke="#a78060" fill={`url(#fill-${room.room_key})`} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', color: '#333', fontSize: 12, padding: '12px 0', border: '1px dashed #1a1a1a', borderRadius: 6 }}>Waiting for data…</div>
        )}

        <div style={{ fontSize: 11, color: '#333', textAlign: 'right', marginTop: 8 }}>
          {room.cold_storage_name && <span style={{ color: '#444', marginRight: 6 }}>{room.cold_storage_name}</span>}
          Updated {data ? fmt(data.timestamp) : '—'} · Click for details →
        </div>
      </div>
    </div>
  );
}

// ─── Add Room Modal ───────────────────────────────────────────────────────────
function AddRoomModal({ coldStorages, onClose, onAdded }) {
  const [csId,     setCsId]     = useState(coldStorages[0]?.id || '');
  const [name,     setName]     = useState('');
  const [category, setCategory] = useState('');
  const [product,  setProduct]  = useState('');
  const [proEmoji, setProEmoji] = useState('');
  const [qty,      setQty]      = useState('');
  const [saving,   setSaving]   = useState(false);

  async function save() {
    if (!name || !category || !csId) return;
    setSaving(true);
    const res = await fetch(`${API}/api/rooms`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ cold_storage_id: csId, name, category, product: product || category, product_emoji: proEmoji || CATEGORIES[category]?.emoji, quantity_kg: parseFloat(qty) || 0 }),
    });
    const room = await res.json();
    onAdded(room);
    onClose();
  }

  const inp = { width: '100%', padding: '10px 12px', background: '#111', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 13, boxSizing: 'border-box' };
  const catBtn = (k) => ({
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
    background: category === k ? '#c8a870' : '#111', color: category === k ? '#000' : '#666',
    border: `1px solid ${category === k ? '#c8a870' : '#2a2a2a'}`,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: 14, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Add New Room</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>COLD STORAGE</div>
          <select value={csId} onChange={e => setCsId(parseInt(e.target.value))}
            style={{ ...inp, appearance: 'none' }}>
            {coldStorages.map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>ROOM NAME</div>
          <input style={inp} placeholder="e.g. Cold Bay 1, Room 3" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>CATEGORY</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(CATEGORIES).map(([k, c]) => (
              <button key={k} onClick={() => { setCategory(k); setProduct(''); setProEmoji(''); }} style={catBtn(k)}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {category && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>PRODUCT</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(PRODUCTS[category] || []).map(p => (
                <button key={p.value} onClick={() => { setProduct(p.label); setProEmoji(p.emoji); }}
                  style={{ ...catBtn(p.label === product ? category : ''), background: product === p.label ? '#c8a870' : '#111', color: product === p.label ? '#000' : '#666' }}>
                  {p.emoji} {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>QUANTITY (kg)</div>
          <input style={inp} type="number" placeholder="e.g. 500" value={qty} onChange={e => setQty(e.target.value)} />
        </div>

        <button onClick={save} disabled={saving || !name || !category}
          style={{ width: '100%', padding: '12px', background: (!name || !category) ? '#1a1a1a' : '#c8a870', color: (!name || !category) ? '#444' : '#000', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Adding…' : 'Add Room'}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardPage() {
  const navigate = useNavigate();
  const [rooms,        setRooms]        = useState([]);
  const [coldStorages, setColdStorages] = useState([]);
  const [activeKeys,   setActiveKeys]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ccg_active_rooms') || '[]')); }
    catch { return new Set(); }
  });
  const [current,  setCurrent]  = useState({});
  const [history,  setHistory]  = useState({});
  const [alerts,   setAlerts]   = useState([]);
  const [connected,setConnected]= useState(false);
  const [loading,  setLoading]  = useState(true);
  const [showModal,setShowModal]= useState(false);
  const socketRef = useRef(null);

  const loadRooms = useCallback(async () => {
    const res  = await fetch(`${API}/api/rooms`, { headers: authHeaders() });
    const data = await res.json();
    setRooms(data.rooms || []);
    setColdStorages(data.coldStorages || []);
    if (data.rooms?.length === 0) { navigate('/setup'); return; }
    setActiveKeys(prev => {
      const keys = new Set(prev);
      if (keys.size === 0) data.rooms.forEach(r => keys.add(r.room_key));
      return keys;
    });
    setLoading(false);
  }, [navigate]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  useEffect(() => {
    if (!activeKeys.size) return;
    localStorage.setItem('ccg_active_rooms', JSON.stringify([...activeKeys]));
  }, [activeKeys]);

  useEffect(() => {
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('sensorUpdate', ({ roomKey, data }) => {
      setCurrent(p => ({ ...p, [roomKey]: data }));
      setHistory(p => ({ ...p, [roomKey]: [data, ...(p[roomKey] || [])].slice(0, 50) }));
    });
    socket.on('alert', a => setAlerts(p => [a, ...p].slice(0, 100)));
    return () => socket.disconnect();
  }, []);

  function toggleRoom(key) {
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleRoomAdded(room) {
    setRooms(prev => [...prev, room]);
    setActiveKeys(prev => new Set([...prev, room.room_key]));
  }

  async function deleteRoom(room) {
    if (!confirm(`Remove "${room.name}" from monitoring?`)) return;
    await fetch(`${API}/api/rooms/${room.id}`, { method: 'DELETE', headers: authHeaders() });
    setRooms(prev => prev.filter(r => r.id !== room.id));
    setActiveKeys(prev => { const n = new Set(prev); n.delete(room.room_key); return n; });
  }

  const activeRooms   = rooms.filter(r => activeKeys.has(r.room_key));
  const overallRisk   = activeRooms.length
    ? activeRooms.reduce((s, r) => s + (current[r.room_key]?.spoilageRisk || 0), 0) / activeRooms.length
    : 0;
  const liveRooms     = activeRooms.filter(r => current[r.room_key]).length;
  const recentAlerts  = alerts.filter(a => activeKeys.has(a.room) && Date.now() - new Date(a.timestamp) < 60_000);

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#555', fontSize: 14 }}>
        Loading your rooms…
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '28px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Dashboard</h1>
            <div style={{ fontSize: 13, color: '#555', marginTop: 3 }}>Real-time cold storage overview</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, color: connected ? '#4ade80' : '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#4ade80' : '#f87171' }} />
              {connected ? 'Live' : 'Disconnected'}
            </div>
            <button onClick={() => setShowModal(true)} style={{
              padding: '8px 16px', background: '#c8a870', color: '#000', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>+ Add Room</button>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Overall Risk',   value: `${overallRisk.toFixed(0)}%`,      sub: risk_label(overallRisk), color: risk_color(overallRisk) },
            { label: 'Active Rooms',   value: `${liveRooms}/${activeRooms.length}`, sub: 'Online' },
            { label: 'Your Rooms',     value: rooms.length,                       sub: 'Total configured' },
            { label: 'Live Alerts',    value: recentAlerts.length,               sub: 'Last 60s', color: recentAlerts.length ? '#f87171' : '#4ade80' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: s.color || '#fff', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#444', marginTop: 6 }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Room selector */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#555', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>SELECT ROOMS TO MONITOR</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setActiveKeys(new Set(rooms.map(r => r.room_key)))}
                style={{ fontSize: 11, color: '#888', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>All</button>
              <button onClick={() => setActiveKeys(new Set())}
                style={{ fontSize: 11, color: '#888', background: 'transparent', border: '1px solid #2a2a2a', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>None</button>
            </div>
          </div>

          {coldStorages.map(cs => {
            const csRooms = rooms.filter(r => r.cold_storage_id === cs.id);
            return (
              <div key={cs.id} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#c8a870', marginBottom: 6 }}>{cs.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {csRooms.map(room => {
                    const active = activeKeys.has(room.room_key);
                    const live   = !!current[room.room_key];
                    return (
                      <div key={room.room_key} style={{ display: 'flex', alignItems: 'center', gap: 0, background: active ? '#161610' : '#0d0d0d', border: `1px solid ${active ? '#c8a870' : '#222'}`, borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => toggleRoom(room.room_key)} style={{
                          padding: '7px 14px', background: 'transparent', border: 'none',
                          color: active ? '#c8a870' : '#555', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <span>{room.product_emoji}</span>
                          <span>{room.name}</span>
                          {live && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />}
                        </button>
                        <button onClick={() => deleteRoom(room)} title="Remove room"
                          style={{ padding: '7px 10px', background: 'transparent', border: 'none', borderLeft: '1px solid #1a1a1a', color: '#333', cursor: 'pointer', fontSize: 14 }}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {rooms.length === 0 && (
            <div style={{ color: '#444', fontSize: 13 }}>No rooms yet. Click "+ Add Room" to get started.</div>
          )}
        </div>

        {/* Room cards */}
        {activeRooms.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {activeRooms.map(room => (
              <RoomCard key={room.room_key} room={{ ...room, cold_storage_name: coldStorages.find(c => c.id === room.cold_storage_id)?.name }}
                data={current[room.room_key]} history={history[room.room_key]}
                onClick={() => navigate(`/room/${room.room_key}`)} />
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#333', fontSize: 14 }}>
            No rooms selected. Toggle rooms above to see live data.
          </div>
        )}
      </div>

      {showModal && (
        <AddRoomModal coldStorages={coldStorages} onClose={() => setShowModal(false)} onAdded={handleRoomAdded} />
      )}
    </Layout>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      <Route path="/"            element={<LoginPage />} />
      <Route path="/setup"       element={<Protected><SetupWizard /></Protected>} />
      <Route path="/dashboard"   element={<Protected><DashboardPage /></Protected>} />
      <Route path="/analytics"   element={<Protected><AnalyticsPage /></Protected>} />
      <Route path="/live-alerts" element={<Protected><LiveAlertsPage /></Protected>} />
      <Route path="/room/:roomKey" element={<Protected><RoomPage /></Protected>} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
