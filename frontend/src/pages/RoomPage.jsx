import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API, ROOMS, CROPS, getUser, analyzeCrop, risk_color, risk_label, fmt, fmtDate } from '../shared';
import Layout from '../Layout';

const ROOM_COLORS = { 'Room-A': '#a07040', 'Room-B': '#608050', 'Room-C': '#507080' };

export default function RoomPage() {
  const { roomId }   = useParams();
  const navigate     = useNavigate();
  const user         = getUser();
  const room         = ROOMS[roomId];
  const color        = ROOM_COLORS[roomId] || '#888';

  const [current,  setCurrent]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [dbAlerts, setDbAlerts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!room) return;
    Promise.all([
      fetch(`${API}/api/current`).then(r => r.json()),
      fetch(`${API}/api/db/history/${roomId}`).then(r => r.json()),
      fetch(`${API}/api/db/alerts`).then(r => r.json()),
    ]).then(([curr, hist, alts]) => {
      setCurrent(curr[roomId] || null);
      setHistory(hist.reverse());
      setDbAlerts(alts.filter(a => a.room_id === roomId));
      setLoading(false);
    }).catch(() => setLoading(false));

    const iv = setInterval(() => {
      fetch(`${API}/api/current`).then(r => r.json()).then(c => setCurrent(c[roomId] || null)).catch(() => {});
    }, 3000);
    return () => clearInterval(iv);
  }, [roomId]);

  if (!room) return (
    <Layout><div style={{ textAlign: 'center', padding: 60, color: '#888', fontSize: 16 }}>Room not found. <span onClick={() => navigate('/dashboard')} style={{ color: '#c8a870', cursor: 'pointer' }}>Go back</span></div></Layout>
  );

  const risk       = current?.spoilageRisk ?? 0;
  const cropKey    = Object.keys(CROPS).find(k => CROPS[k].label === user?.crop);
  const cropIssues = analyzeCrop(cropKey, current);
  const crop       = cropKey ? CROPS[cropKey] : null;

  const chartData = history.slice(-40).map(d => ({
    t:    fmt(d.created_at),
    temp: +d.temperature?.toFixed(1),
    hum:  +d.humidity?.toFixed(1),
    co2:  +d.co2?.toFixed(0),
    risk: +d.spoilage_risk?.toFixed(1),
  }));

  function MetricCard({ label, value, unit, warn }) {
    return (
      <div style={{ background: warn ? '#1a0a0a' : '#0d0d0d', border: `1px solid ${warn ? '#5a1a1a' : '#222'}`, borderRadius: 10, padding: '20px 18px' }}>
        <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 36, fontWeight: 800, color: warn ? '#f87171' : '#fff', lineHeight: 1 }}>
          {value ?? '—'}
          <span style={{ fontSize: 16, fontWeight: 400, color: '#555', marginLeft: 6 }}>{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 24px' }}>

        {/* Back */}
        <button onClick={() => navigate('/dashboard')} style={{
          fontSize: 13, color: '#888', background: 'transparent', border: 'none',
          cursor: 'pointer', marginBottom: 24, padding: 0, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ← Back to Dashboard
        </button>

        {/* Room header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: 14, background: '#0d0d0d', border: `2px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
              {room.emoji}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{roomId}</h1>
              <div style={{ fontSize: 15, color: '#888', marginTop: 4 }}>{room.name}</div>
              {current && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} />
                  <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>Receiving live data</span>
                </div>
              )}
            </div>
          </div>

          <div style={{
            textAlign: 'right', background: '#0d0d0d', border: '1px solid #222', borderRadius: 12, padding: '16px 22px',
          }}>
            <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Spoilage Risk</div>
            <div style={{ fontSize: 38, fontWeight: 800, color: risk_color(risk), lineHeight: 1 }}>{risk.toFixed(0)}%</div>
            <div style={{ fontSize: 13, color: risk_color(risk), marginTop: 6, fontWeight: 600 }}>{risk_label(risk)}</div>
            <div style={{ height: 5, background: '#1a1a1a', borderRadius: 3, marginTop: 10, overflow: 'hidden', width: 120 }}>
              <div style={{ height: '100%', width: `${risk}%`, background: risk_color(risk), borderRadius: 3, transition: 'width 0.7s' }} />
            </div>
          </div>
        </div>

        {/* Door open banner */}
        {current?.doorOpen && (
          <div style={{ padding: '12px 18px', borderRadius: 8, marginBottom: 24, background: '#1a1400', border: '1px solid #5a4000', fontSize: 14, color: '#fbbf24', fontWeight: 600 }}>
            🚪 Door is currently open — temperature may be rising
          </div>
        )}

        {/* Live metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 32 }}>
          <MetricCard label="Temperature" value={current?.temperature?.toFixed(1)} unit="°C"  warn={current?.temperature > 8 || current?.temperature < 1} />
          <MetricCard label="Humidity"    value={current?.humidity?.toFixed(1)}    unit="%"   warn={current?.humidity > 95 || current?.humidity < 80} />
          <MetricCard label="CO₂ Level"   value={current?.co2?.toFixed(0)}         unit="ppm" warn={current?.co2 > 1000} />
        </div>

        {/* Crop analysis */}
        {crop && (
          <div style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderTop: `2px solid ${color}`, borderRadius: 12, padding: '22px 24px', marginBottom: 28 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>
              {crop.emoji} Crop Analysis — {crop.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: cropIssues.length > 0 ? 16 : 0 }}>
              {[
                { label: 'Optimal Temp', val: `${crop.temp[0]} – ${crop.temp[1]} °C`, ok: current && current.temperature >= crop.temp[0] && current.temperature <= crop.temp[1] },
                { label: 'Optimal Humidity', val: `${crop.humidity[0]} – ${crop.humidity[1]}%`, ok: current && current.humidity >= crop.humidity[0] && current.humidity <= crop.humidity[1] },
                { label: 'Max CO₂', val: `${crop.co2} ppm`, ok: current && current.co2 <= crop.co2 },
              ].map(s => (
                <div key={s.label} style={{ background: '#111', borderRadius: 8, padding: '12px 14px', border: `1px solid ${s.ok === false ? '#4a1a1a' : s.ok === true ? '#1a3a1a' : '#1a1a1a'}` }}>
                  <div style={{ fontSize: 11, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: s.ok === false ? '#f87171' : s.ok === true ? '#4ade80' : '#c8a870' }}>
                    {s.ok === true ? '✓ ' : s.ok === false ? '✗ ' : ''}{s.val}
                  </div>
                </div>
              ))}
            </div>
            {cropIssues.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Active crop-specific issues:</div>
                {cropIssues.map((issue, i) => (
                  <div key={i} style={{
                    fontSize: 13, padding: '8px 14px', borderRadius: 6, marginBottom: 6,
                    background: issue.type === 'critical' ? '#1a0808' : '#1a1400',
                    border: `1px solid ${issue.type === 'critical' ? '#4a1010' : '#4a3800'}`,
                    color: issue.type === 'critical' ? '#f87171' : '#fbbf24',
                  }}>⚠ {issue.msg}</div>
                ))}
              </div>
            )}
            {cropIssues.length === 0 && current && (
              <div style={{ fontSize: 13, color: '#4ade80', background: '#0a1a0a', border: '1px solid #1a4a1a', borderRadius: 6, padding: '8px 14px' }}>
                ✓ Conditions are optimal for {crop.label} storage
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        {chartData.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
            {[
              { key: 'temp', label: 'Temperature (°C)', stroke: color },
              { key: 'hum',  label: 'Humidity (%)',      stroke: '#6080a0' },
              { key: 'co2',  label: 'CO₂ (ppm)',         stroke: '#806060' },
              { key: 'risk', label: 'Spoilage Risk (%)', stroke: '#c87050' },
            ].map(ch => (
              <div key={ch.key} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ fontSize: 13, color: '#888', marginBottom: 14, fontWeight: 600 }}>{ch.label}</div>
                <ResponsiveContainer width="100%" height={100}>
                  <AreaChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -16 }}>
                    <defs>
                      <linearGradient id={`fill-${ch.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={ch.stroke} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={ch.stroke} stopOpacity={0}    />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#555' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#555' }} domain={['auto','auto']} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 6, fontSize: 12, color: '#fff' }} />
                    <Area type="monotone" dataKey={ch.key} stroke={ch.stroke} fill={`url(#fill-${ch.key})`} strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        {/* Alert history for this room */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Alert History — {roomId}</span>
            <span style={{ fontSize: 12, color: '#555' }}>{dbAlerts.length} events</span>
          </div>
          <div style={{ padding: dbAlerts.length === 0 ? '48px 0' : '8px 0' }}>
            {dbAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 13 }}>No alerts recorded for this room.</div>
            ) : dbAlerts.slice(0, 20).map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 22px', borderBottom: '1px solid #111',
                borderLeft: `3px solid ${a.severity === 'critical' ? '#f87171' : '#fbbf24'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.severity === 'critical' ? '#f87171' : '#fbbf24' }} />
                  <span style={{ fontSize: 13, color: '#ddd' }}>{a.message}</span>
                </div>
                <span style={{ fontSize: 11, color: '#444', flexShrink: 0, marginLeft: 16 }}>{fmtDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 12, color: '#444', textAlign: 'right', marginTop: 12 }}>
          Last reading: {current ? fmt(current.timestamp) : '—'}
        </div>
      </div>
    </Layout>
  );
}
