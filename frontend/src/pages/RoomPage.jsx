import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { API, CATEGORIES, authHeaders, risk_color, risk_label, severity_color, urgency_color, trendArrow, fmt, fmtDate } from '../shared';
import Layout from '../Layout';

export default function RoomPage() {
  const { roomKey } = useParams();
  const navigate     = useNavigate();

  const [room,     setRoom]     = useState(null);
  const [current,  setCurrent]  = useState(null);
  const [history,  setHistory]  = useState([]);
  const [dbAlerts, setDbAlerts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { rooms } = await fetch(`${API}/api/rooms`, { headers: authHeaders() }).then(r => r.json());
        const r = (rooms || []).find(x => x.room_key === roomKey);
        if (cancelled) return;
        setRoom(r || null);
        if (!r) { setLoading(false); return; }

        const [curr, hist, alts, ins] = await Promise.all([
          fetch(`${API}/api/current`,               { headers: authHeaders() }).then(x => x.json()),
          fetch(`${API}/api/db/history/${roomKey}`,  { headers: authHeaders() }).then(x => x.json()),
          fetch(`${API}/api/db/alerts`,              { headers: authHeaders() }).then(x => x.json()),
          fetch(`${API}/api/insights`,               { headers: authHeaders() }).then(x => x.json()),
        ]);
        if (cancelled) return;
        setCurrent(curr[roomKey] || null);
        setHistory((hist || []).slice().reverse());
        setDbAlerts((alts || []).filter(a => a.room_id === roomKey));
        setInsights((ins || []).filter(i => i.room === roomKey));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    const iv = setInterval(() => {
      fetch(`${API}/api/current`, { headers: authHeaders() }).then(r => r.json()).then(c => { if (!cancelled) setCurrent(c[roomKey] || null); }).catch(() => {});
    }, 3000);
    const iv2 = setInterval(() => {
      fetch(`${API}/api/insights`, { headers: authHeaders() }).then(r => r.json()).then(ins => { if (!cancelled) setInsights((ins || []).filter(i => i.room === roomKey)); }).catch(() => {});
    }, 6000);
    return () => { cancelled = true; clearInterval(iv); clearInterval(iv2); };
  }, [roomKey]);

  if (loading) return (
    <Layout><div style={{ textAlign: 'center', padding: 60, color: '#555', fontSize: 14 }}>Loading room…</div></Layout>
  );

  if (!room) return (
    <Layout><div style={{ textAlign: 'center', padding: 60, color: '#888', fontSize: 16 }}>Room not found. <span onClick={() => navigate('/dashboard')} style={{ color: '#c8a870', cursor: 'pointer' }}>Go back</span></div></Layout>
  );

  const cat        = CATEGORIES[room.category] || {};
  const color      = '#a78060';
  const risk       = current?.spoilageRisk ?? 0;
  const forecast   = current?.forecast || null;

  const chartData = history.slice(-40).map(d => ({
    t:    fmt(d.created_at),
    temp: +d.temperature?.toFixed(1),
    hum:  +d.humidity?.toFixed(1),
    co2:  +d.co2?.toFixed(0),
    risk: +d.spoilage_risk?.toFixed(1),
  }));

  function MetricCard({ label, value, unit, warn, metricKey }) {
    const f = forecast?.metrics?.[metricKey];
    return (
      <div style={{ background: warn ? '#1a0a0a' : '#0d0d0d', border: `1px solid ${warn ? '#5a1a1a' : '#222'}`, borderRadius: 10, padding: '20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
          {f && <div style={{ fontSize: 14, color: '#666' }}>{trendArrow(f.slopePerMin)}</div>}
        </div>
        <div style={{ fontSize: 36, fontWeight: 800, color: warn ? '#f87171' : '#fff', lineHeight: 1 }}>
          {value ?? '—'}
          <span style={{ fontSize: 16, fontWeight: 400, color: '#555', marginLeft: 6 }}>{unit}</span>
        </div>
        {f?.breachInSec != null && (
          <div style={{ fontSize: 11, color: '#a78bfa', marginTop: 10, fontWeight: 600 }}>
            ⟡ Predicted to {f.breachType === 'max' ? 'exceed max' : 'drop below min'} in ~{Math.max(1, Math.round(f.breachInSec / 60))} min
          </div>
        )}
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
              {room.product_emoji || cat.emoji}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{room.name}</h1>
              <div style={{ fontSize: 15, color: '#888', marginTop: 4 }}>{room.product || cat.label} · {room.quantity_kg} kg</div>
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
            {forecast && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 10 }}>
                In 15 min: <span style={{ color: risk_color(forecast.projectedRisk15min), fontWeight: 700 }}>{forecast.projectedRisk15min}%</span>
              </div>
            )}
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
          <MetricCard label="Temperature" metricKey="temperature" value={current?.temperature?.toFixed(1)} unit="°C"  warn={current?.temperature > (cat.temp?.[1] ?? 8) || current?.temperature < (cat.temp?.[0] ?? 1)} />
          <MetricCard label="Humidity"    metricKey="humidity"    value={current?.humidity?.toFixed(1)}    unit="%"   warn={current?.humidity > (cat.humidity?.[1] ?? 95) || current?.humidity < (cat.humidity?.[0] ?? 80)} />
          <MetricCard label="CO₂ Level"   metricKey="co2"         value={current?.co2?.toFixed(0)}         unit="ppm" warn={current?.co2 > (cat.co2 ?? 1000)} />
        </div>

        {/* AI Insights */}
        <div style={{ background: '#0a0a0a', border: '1px solid #2a2450', borderTop: '2px solid #a78bfa', borderRadius: 12, padding: '22px 24px', marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✨</span> AI Incident Diagnosis
          </div>
          {insights.length === 0 ? (
            <div style={{ fontSize: 13, color: '#555' }}>No AI diagnosis yet — the agent engages automatically when a critical or predicted issue is detected in this room.</div>
          ) : insights.slice(0, 5).map(i => (
            <div key={i.id} style={{ padding: '14px 16px', borderRadius: 8, marginBottom: 10, background: '#0d0d16', border: '1px solid #24204a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: urgency_color(i.urgency), background: `${urgency_color(i.urgency)}15`, padding: '2px 8px', borderRadius: 4,
                }}>{i.urgency} urgency</span>
                <span style={{ fontSize: 11, color: '#555' }}>{fmtDate(i.timestamp)}</span>
              </div>
              <div style={{ fontSize: 13, color: '#ddd', marginBottom: 6 }}><strong style={{ color: '#c9b8ff' }}>Root cause:</strong> {i.rootCause}</div>
              <div style={{ fontSize: 13, color: '#ddd' }}><strong style={{ color: '#c9b8ff' }}>Recommendation:</strong> {i.recommendation}</div>
            </div>
          ))}
        </div>

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
            <span style={{ fontSize: 14, fontWeight: 600 }}>Alert History — {room.name}</span>
            <span style={{ fontSize: 12, color: '#555' }}>{dbAlerts.length} events</span>
          </div>
          <div style={{ padding: dbAlerts.length === 0 ? '48px 0' : '8px 0' }}>
            {dbAlerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#555', fontSize: 13 }}>No alerts recorded for this room.</div>
            ) : dbAlerts.slice(0, 20).map(a => (
              <div key={a.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 22px', borderBottom: '1px solid #111',
                borderLeft: `3px solid ${severity_color(a.severity)}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: severity_color(a.severity) }} />
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
