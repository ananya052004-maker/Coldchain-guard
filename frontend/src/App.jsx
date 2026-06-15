import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

import { API, ROOMS, getUser, getToken, risk_color, risk_label, fmt } from './shared';
import Layout from './Layout';
import LoginPage    from './pages/LoginPage';
import CropPage     from './pages/CropPage';
import LiveAlertsPage from './pages/LiveAlertsPage';
import RoomPage       from './pages/RoomPage';
import AnalyticsPage  from './pages/AnalyticsPage';

// ─── Route guard ─────────────────────────────────────────────────────────────
function Protected({ children }) {
  return getToken() ? children : <Navigate to="/" replace />;
}

// ─── Metric block ─────────────────────────────────────────────────────────────
function Metric({ label, value, unit, warn }) {
  return (
    <div style={{ flex: 1, padding: '16px 14px', background: warn ? '#1a0a0a' : '#111', border: `1px solid ${warn ? '#5a1a1a' : '#2a2a2a'}`, borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: warn ? '#f87171' : '#fff', lineHeight: 1 }}>
        {value ?? '—'}
        <span style={{ fontSize: 14, fontWeight: 400, color: '#666', marginLeft: 5 }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Room card ────────────────────────────────────────────────────────────────
function RoomCard({ roomId, data, history, onClick }) {
  const room   = ROOMS[roomId];
  const risk   = data?.spoilageRisk ?? 0;
  const wT     = data?.temperature > 8 || data?.temperature < 1;
  const wH     = data?.humidity > 95 || data?.humidity < 80;
  const wC     = data?.co2 > 1000;
  const warn   = wT || wH || wC || data?.doorOpen;

  const chart = [...(history || [])].reverse().slice(-20).map(d => ({
    t: fmt(d.timestamp), v: +d.temperature?.toFixed(1),
  }));

  return (
    <div onClick={onClick} style={{
      background: '#0a0a0a', border: `1px solid ${warn ? '#4a1a1a' : '#1e1e1e'}`,
      borderTop: `2px solid ${warn ? '#f87171' : '#333'}`,
      borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
      transition: 'border-color 0.2s',
    }}>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 30 }}>{room.emoji}</span>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>{roomId}</div>
              <div style={{ fontSize: 13, color: '#aaa', marginTop: 2 }}>{room.name}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {data && <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end', marginBottom: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 11, color: '#4ade80' }}>Live</span>
            </div>}
            <div style={{ fontSize: 13, fontWeight: 600, color: risk_color(risk) }}>{risk_label(risk)} · {risk.toFixed(0)}%</div>
          </div>
        </div>

        {data?.doorOpen && (
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 14, background: '#1a1400', border: '1px solid #4a3800', fontSize: 13, color: '#fbbf24' }}>
            🚪 Door is open
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Metric label="Temp"     value={data?.temperature?.toFixed(1)} unit="°C"  warn={wT} />
          <Metric label="Humidity" value={data?.humidity?.toFixed(1)}    unit="%"   warn={wH} />
          <Metric label="CO₂"      value={data?.co2?.toFixed(0)}         unit="ppm" warn={wC} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Spoilage Risk</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: risk_color(risk) }}>{risk.toFixed(1)}%</span>
          </div>
          <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${risk}%`, background: risk_color(risk), borderRadius: 3, transition: 'width 0.7s' }} />
          </div>
        </div>

        {chart.length > 1 ? (
          <>
            <div style={{ fontSize: 11, color: '#444', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Temperature trend</div>
            <ResponsiveContainer width="100%" height={75}>
              <AreaChart data={chart} margin={{ top: 2, right: 0, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id={`fill-${roomId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78060" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78060" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#444' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#444' }} domain={['auto','auto']} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 6, fontSize: 12, color: '#fff' }} formatter={v => [`${v}°C`, 'Temp']} />
                <Area type="monotone" dataKey="v" stroke="#a78060" fill={`url(#fill-${roomId})`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#333', fontSize: 13, padding: '16px 0', border: '1px dashed #1a1a1a', borderRadius: 6 }}>
            Waiting for data…
          </div>
        )}

        <div style={{ fontSize: 11, color: '#333', textAlign: 'right', marginTop: 10 }}>
          Updated {data ? fmt(data.timestamp) : '—'} · Click for details →
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardPage() {
  const navigate    = useNavigate();
  const user        = getUser();
  const [connected, setConnected] = useState(false);
  const [current,   setCurrent]   = useState({});
  const [history,   setHistory]   = useState({ 'Room-A': [], 'Room-B': [], 'Room-C': [] });
  const [alerts,    setAlerts]    = useState([]);
  const [tab,       setTab]       = useState('dashboard');
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(API, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('initialData', ({ current: c, alerts: a, history: h }) => {
      setCurrent(c || {}); setAlerts(a || []);
      setHistory(h || { 'Room-A': [], 'Room-B': [], 'Room-C': [] });
    });
    socket.on('sensorUpdate', ({ roomId, data }) => {
      setCurrent(p => ({ ...p, [roomId]: data }));
      setHistory(p => ({ ...p, [roomId]: [data, ...(p[roomId] || [])].slice(0, 50) }));
    });
    socket.on('alert', a => setAlerts(p => [a, ...p].slice(0, 100)));
    return () => socket.disconnect();
  }, []);

  const rooms        = Object.keys(ROOMS);
  const liveRooms    = rooms.filter(r => current[r]).length;
  const overallRisk  = rooms.reduce((s, r) => s + (current[r]?.spoilageRisk || 0), 0) / 3;
  const recentAlerts = alerts.filter(a => Date.now() - new Date(a.timestamp) < 60_000);

  return (
    <Layout>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        {/* Connection + crop banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Dashboard</h1>
            <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Real-time cold storage overview</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {user?.crop && (
              <div style={{ fontSize: 13, color: '#c8a870', background: '#161610', border: '1px solid #3a3020', borderRadius: 8, padding: '6px 14px' }}>
                {user.crop_emoji} Monitoring for {user.crop} · {user.quantity_kg || 0} kg
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#4ade80' : '#f87171' }} />
              <span style={{ fontSize: 14, color: connected ? '#4ade80' : '#f87171', fontWeight: 600 }}>{connected ? 'Live' : 'Disconnected'}</span>
            </div>
            <button onClick={() => navigate('/live-alerts')} style={{
              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
              background: '#1a0a0a', border: '1px solid #4a1a1a', color: '#f87171', fontWeight: 600,
            }}>
              🔔 {recentAlerts.length > 0 ? `${recentAlerts.length} Live Alerts` : 'Live Alerts'}
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid #1a1a1a', paddingBottom: 0 }}>
          {['dashboard', 'alerts', 'analytics'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 20px', borderRadius: '6px 6px 0 0', cursor: 'pointer',
              background: tab === t ? '#0a0a0a' : 'transparent',
              color: tab === t ? '#fff' : '#666', fontWeight: tab === t ? 600 : 400,
              fontSize: 14, border: tab === t ? '1px solid #2a2a2a' : '1px solid transparent',
              borderBottom: tab === t ? '1px solid #0a0a0a' : 'none',
              marginBottom: tab === t ? -1 : 0, textTransform: 'capitalize',
            }}>
              {t}
              {t === 'alerts' && alerts.length > 0 && (
                <span style={{ marginLeft: 7, background: '#f87171', color: '#000', borderRadius: 20, fontSize: 10, padding: '1px 6px', fontWeight: 700 }}>{alerts.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Dashboard tab ── */}
        {tab === 'dashboard' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
              {[
                { label: 'Overall Risk',  val: `${overallRisk.toFixed(0)}%`, sub: risk_label(overallRisk), color: risk_color(overallRisk) },
                { label: 'Active Rooms',  val: `${liveRooms}/3`,             sub: 'Online',                 color: '#c8a870' },
                { label: 'Total Alerts',  val: alerts.length,               sub: 'This session',           color: '#c8a870' },
                { label: 'Live Alerts',   val: recentAlerts.length,         sub: 'Last 60s',               color: recentAlerts.length > 0 ? '#f87171' : '#4ade80' },
              ].map((s, i) => (
                <div key={i} style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: 10, padding: '20px 22px' }}>
                  <div style={{ fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{s.label}</div>
                  <div style={{ fontSize: 34, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 13, color: '#555', marginTop: 10 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#aaa' }}>Storage Rooms</span>
              <div style={{ flex: 1, height: 1, background: '#1a1a1a' }} />
              <span style={{ fontSize: 12, color: '#444' }}>Click a room for detailed view</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {rooms.map(id => (
                <RoomCard key={id} roomId={id} data={current[id]} history={history[id] || []} onClick={() => navigate(`/room/${id}`)} />
              ))}
            </div>
          </>
        )}

        {/* ── Alerts tab ── */}
        {tab === 'alerts' && (
          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>Alert Log</div>
                <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{alerts.length} alerts this session</div>
              </div>
              <button onClick={() => navigate('/live-alerts')} style={{ fontSize: 13, color: '#c8a870', background: 'transparent', border: '1px solid #3a3020', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                View full history →
              </button>
            </div>
            <div style={{ padding: '14px 20px' }}>
              {alerts.length === 0
                ? <div style={{ textAlign: 'center', color: '#555', padding: '48px 0', fontSize: 14 }}>No alerts — all systems normal</div>
                : alerts.slice(0, 15).map(a => {
                    const crit = a.severity === 'critical';
                    const color = crit ? '#f87171' : '#fbbf24';
                    return (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', marginBottom: 6, borderRadius: 8, background: '#0d0d0d', border: '1px solid #1e1e1e', borderLeft: `3px solid ${color}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
                          <span style={{ fontSize: 14, color: '#ddd' }}>{a.message}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: '#666', background: '#111', padding: '2px 8px', borderRadius: 4 }}>{a.room}</span>
                          <span style={{ fontSize: 12, color: '#444' }}>{fmt(a.timestamp)}</span>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        )}

        {/* ── Analytics tab ── */}
        {tab === 'analytics' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {rooms.map(id => {
              const room = ROOMS[id];
              const data = [...(history[id] || [])].reverse().slice(-30).map(d => ({
                t: fmt(d.timestamp), humidity: +d.humidity?.toFixed(1), risk: +d.spoilageRisk?.toFixed(1),
              }));
              return (
                <div key={id} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderTop: '2px solid #a78060', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{room.emoji}</span>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{id}</span>
                    <span style={{ fontSize: 12, color: '#666' }}>— {room.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#444', marginBottom: 14 }}>Humidity & Risk over time</div>
                  {data.length > 1 ? (
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                        <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#555' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#555' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 6, fontSize: 12, color: '#fff' }} />
                        <Line type="monotone" dataKey="humidity" stroke="#a78060" strokeWidth={1.5} dot={false} name="Humidity %" />
                        <Line type="monotone" dataKey="risk"     stroke="#f87171" strokeWidth={1.5} dot={false} name="Risk %"     />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#444', padding: 30, fontSize: 13 }}>Collecting data…</div>
                  )}
                </div>
              );
            })}
            <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Safe Thresholds</div>
              {[
                { icon: '🌡', label: 'Temperature', val: '1 – 8 °C' },
                { icon: '💧', label: 'Humidity',    val: '80 – 95%' },
                { icon: '🌫', label: 'CO₂',         val: '< 1000 ppm' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid #1a1a1a' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{r.icon}</span>
                    <span style={{ fontSize: 14, color: '#aaa' }}>{r.label}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#c8a870' }}>{r.val}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

// ─── Router root ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      <Route path="/"            element={<LoginPage />} />
      <Route path="/setup"       element={<Protected><CropPage /></Protected>} />
      <Route path="/dashboard"   element={<Protected><DashboardPage /></Protected>} />
      <Route path="/analytics"   element={<Protected><AnalyticsPage /></Protected>} />
      <Route path="/live-alerts" element={<Protected><LiveAlertsPage /></Protected>} />
      <Route path="/room/:roomId"element={<Protected><RoomPage /></Protected>} />
      <Route path="*"            element={<Navigate to="/" replace />} />
    </Routes>
  );
}
