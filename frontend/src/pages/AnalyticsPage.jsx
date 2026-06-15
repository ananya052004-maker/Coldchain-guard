import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts';
import { API, ROOMS, risk_color, risk_label, fmtDate } from '../shared';
import Layout from '../Layout';

function avg(arr, key)  { return arr.length ? arr.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0) / arr.length : 0; }
function minV(arr, key) { return arr.length ? Math.min(...arr.map(r => parseFloat(r[key]) || 0)) : 0; }
function maxV(arr, key) { return arr.length ? Math.max(...arr.map(r => parseFloat(r[key]) || 0)) : 0; }

const TT = { contentStyle: { background: '#111', border: '1px solid #222', borderRadius: 6, fontSize: 12, color: '#fff' } };

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || '#fff', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderTop: '2px solid #a78060', borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#555', marginBottom: 16 }}>{sub}</div>
      {children}
    </div>
  );
}

function SectionLabel({ text }) {
  return (
    <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 600, marginBottom: 14, marginTop: 8 }}>{text}</div>
  );
}

export default function AnalyticsPage() {
  const [history, setHistory] = useState({ 'Room-A': [], 'Room-B': [], 'Room-C': [] });
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [rA, rB, rC, al] = await Promise.all([
          fetch(`${API}/api/db/history/Room-A`).then(r => r.json()),
          fetch(`${API}/api/db/history/Room-B`).then(r => r.json()),
          fetch(`${API}/api/db/history/Room-C`).then(r => r.json()),
          fetch(`${API}/api/db/alerts`).then(r => r.json()),
        ]);
        setHistory({ 'Room-A': rA, 'Room-B': rB, 'Room-C': rC });
        setAlerts(al);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const all = [...history['Room-A'], ...history['Room-B'], ...history['Room-C']];

  function chartData(roomId) {
    return [...history[roomId]].reverse().slice(-60).map(r => ({
      t:           fmtDate(r.created_at),
      temperature: +parseFloat(r.temperature).toFixed(1),
      humidity:    +parseFloat(r.humidity).toFixed(1),
      co2:         +parseFloat(r.co2).toFixed(0),
      risk:        +parseFloat(r.spoilage_risk).toFixed(1),
    }));
  }

  const alertBreakdown = Object.keys(ROOMS).map(id => ({
    room:     id,
    critical: alerts.filter(a => a.room_id === id && a.severity === 'critical').length,
    warning:  alerts.filter(a => a.room_id === id && a.severity === 'warning').length,
    total:    alerts.filter(a => a.room_id === id).length,
  }));

  if (loading) return (
    <Layout>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#555', fontSize: 14 }}>
        Loading analytics…
      </div>
    </Layout>
  );

  const globalRisk = avg(all, 'spoilage_risk');

  return (
    <Layout>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Analytics</h1>
          <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>Historical sensor data and alert breakdown across all rooms</div>
        </div>

        {/* Global stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          <StatCard label="Avg Temperature"  value={`${avg(all,'temperature').toFixed(1)}°C`}  sub="Across all rooms" />
          <StatCard label="Avg Humidity"     value={`${avg(all,'humidity').toFixed(1)}%`}       sub="Across all rooms" />
          <StatCard label="Total Alerts"     value={alerts.length}                              sub="Stored in database" color="#f87171" />
          <StatCard label="Avg Spoilage Risk" value={`${globalRisk.toFixed(1)}%`}              sub={risk_label(globalRisk)} color={risk_color(globalRisk)} />
        </div>

        {/* Room summary table */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: '20px 24px', marginBottom: 32, overflowX: 'auto' }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Room-by-Room Summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Room', 'Readings', 'Avg Temp', 'Min / Max Temp', 'Avg Humidity', 'Avg CO₂', 'Avg Risk'].map(h => (
                  <th key={h} style={{ textAlign: 'left', color: '#555', fontWeight: 600, padding: '8px 12px', borderBottom: '1px solid #1a1a1a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(ROOMS).map(([id, room]) => {
                const rows = history[id];
                const avgR = avg(rows, 'spoilage_risk');
                return (
                  <tr key={id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{room.emoji}</span>
                        <div>
                          <div style={{ color: '#fff', fontWeight: 600 }}>{id}</div>
                          <div style={{ color: '#555', fontSize: 11 }}>{room.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111', color: '#aaa' }}>{rows.length}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111', color: '#c8a870', fontWeight: 600 }}>{avg(rows,'temperature').toFixed(1)}°C</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111', color: '#777' }}>{minV(rows,'temperature').toFixed(1)} / {maxV(rows,'temperature').toFixed(1)}°C</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111', color: '#aaa' }}>{avg(rows,'humidity').toFixed(1)}%</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111', color: '#aaa' }}>{avg(rows,'co2').toFixed(0)} ppm</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #111' }}>
                      <span style={{ color: risk_color(avgR), fontWeight: 600 }}>{avgR.toFixed(1)}%</span>
                      <span style={{ color: '#555', fontSize: 11, marginLeft: 6 }}>{risk_label(avgR)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Temperature trends */}
        <SectionLabel text="Temperature Trends (°C)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {Object.entries(ROOMS).map(([id, room]) => {
            const data = chartData(id);
            return (
              <ChartCard key={id} title={`${room.emoji} ${id}`} sub={`${room.name} — last ${data.length} readings`}>
                {data.length > 1 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <defs>
                        <linearGradient id={`temp-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#c8a870" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#c8a870" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#444' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={['auto','auto']} axisLine={false} tickLine={false} />
                      <Tooltip {...TT} formatter={v => [`${v}°C`, 'Temp']} />
                      <Area type="monotone" dataKey="temperature" stroke="#c8a870" fill={`url(#temp-${id})`} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', color: '#444', padding: 30, fontSize: 13 }}>Collecting data…</div>}
              </ChartCard>
            );
          })}
        </div>

        {/* Humidity trends */}
        <SectionLabel text="Humidity Trends (%)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {Object.entries(ROOMS).map(([id, room]) => {
            const data = chartData(id);
            return (
              <ChartCard key={id} title={`${room.emoji} ${id}`} sub={`${room.name} — last ${data.length} readings`}>
                {data.length > 1 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <defs>
                        <linearGradient id={`hum-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#60a5fa" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#444' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={['auto','auto']} axisLine={false} tickLine={false} />
                      <Tooltip {...TT} formatter={v => [`${v}%`, 'Humidity']} />
                      <Area type="monotone" dataKey="humidity" stroke="#60a5fa" fill={`url(#hum-${id})`} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', color: '#444', padding: 30, fontSize: 13 }}>Collecting data…</div>}
              </ChartCard>
            );
          })}
        </div>

        {/* Spoilage risk trends */}
        <SectionLabel text="Spoilage Risk Trends (%)" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
          {Object.entries(ROOMS).map(([id, room]) => {
            const data = chartData(id);
            return (
              <ChartCard key={id} title={`${room.emoji} ${id}`} sub={`${room.name} — last ${data.length} readings`}>
                {data.length > 1 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <defs>
                        <linearGradient id={`risk-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#f87171" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                      <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#444' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: '#444' }} domain={[0, 100]} axisLine={false} tickLine={false} />
                      <Tooltip {...TT} formatter={v => [`${v}%`, 'Risk']} />
                      <Area type="monotone" dataKey="risk" stroke="#f87171" fill={`url(#risk-${id})`} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <div style={{ textAlign: 'center', color: '#444', padding: 30, fontSize: 13 }}>Collecting data…</div>}
              </ChartCard>
            );
          })}
        </div>

        {/* Alert breakdown */}
        <SectionLabel text="Alert Breakdown" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
          <ChartCard title="Alerts by Room" sub="Critical vs Warning count per storage room">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={alertBreakdown} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="room" tick={{ fontSize: 11, fill: '#666' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#444' }} axisLine={false} tickLine={false} />
                <Tooltip {...TT} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#888' }} />
                <Bar dataKey="critical" fill="#f87171" name="Critical" radius={[3,3,0,0]} />
                <Bar dataKey="warning"  fill="#fbbf24" name="Warning"  radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderTop: '2px solid #a78060', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Alert Summary</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Room', 'Critical', 'Warning', 'Total'].map(h => (
                    <th key={h} style={{ textAlign: 'left', color: '#555', fontWeight: 600, padding: '8px 0', borderBottom: '1px solid #1a1a1a', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alertBreakdown.map(row => (
                  <tr key={row.room}>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #111', color: '#fff', fontWeight: 600 }}>{row.room}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #111', color: '#f87171', fontWeight: 600 }}>{row.critical}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #111', color: '#fbbf24' }}>{row.warning}</td>
                    <td style={{ padding: '12px 0', borderBottom: '1px solid #111', color: '#aaa' }}>{row.total}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '12px 0', color: '#555', fontWeight: 600, fontSize: 12 }}>TOTAL</td>
                  <td style={{ padding: '12px 0', color: '#f87171', fontWeight: 700 }}>{alertBreakdown.reduce((s,r) => s + r.critical, 0)}</td>
                  <td style={{ padding: '12px 0', color: '#fbbf24', fontWeight: 700 }}>{alertBreakdown.reduce((s,r) => s + r.warning, 0)}</td>
                  <td style={{ padding: '12px 0', color: '#fff', fontWeight: 700 }}>{alerts.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </Layout>
  );
}
