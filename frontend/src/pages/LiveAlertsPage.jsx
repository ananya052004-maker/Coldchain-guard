import { useState, useEffect } from 'react';
import { API, authHeaders, fmtDate } from '../shared';
import Layout from '../Layout';

export default function LiveAlertsPage() {
  const [alerts,   setAlerts]   = useState([]);
  const [rooms,    setRooms]    = useState([]);
  const [filter,   setFilter]   = useState('all');
  const [room,     setRoom]     = useState('all');
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    fetch(`${API}/api/rooms`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setRooms(d.rooms || [])).catch(() => {});

    fetch(`${API}/api/db/alerts`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch(`${API}/api/db/alerts`, { headers: authHeaders() })
        .then(r => r.json()).then(setAlerts).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const now = Date.now();
  const filtered = alerts.filter(a => {
    if (filter !== 'all' && a.severity !== filter) return false;
    if (room !== 'all' && a.room_id !== room) return false;
    return true;
  });

  const liveAlerts   = alerts.filter(a => now - new Date(a.created_at) < 60_000);
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  function timeAgo(iso) {
    const diff = Math.floor((now - new Date(iso)) / 1000);
    if (diff < 60)  return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 24px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>🔔</span>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Live Alerts</h1>
            {liveAlerts.length > 0 && (
              <span style={{ fontSize: 12, background: '#f87171', color: '#000', borderRadius: 20, padding: '2px 10px', fontWeight: 700 }}>
                {liveAlerts.length} active
              </span>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 14, color: '#888' }}>
            All alerts sorted by time. Refreshes every 5 seconds from the database.
          </p>
        </div>

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Total Alerts',   val: alerts.length,        color: '#fff'    },
            { label: 'Critical',       val: criticalCount,         color: '#f87171' },
            { label: 'Warnings',       val: alerts.length - criticalCount, color: '#fbbf24' },
            { label: 'Last 60s',       val: liveAlerts.length,    color: liveAlerts.length > 0 ? '#f87171' : '#4ade80' },
          ].map(s => (
            <div key={s.label} style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#555', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#666' }}>Filter:</span>
          {['all', 'critical', 'warning'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              background: filter === f ? '#1a1a1a' : 'transparent',
              color: filter === f ? '#fff' : '#666',
              border: filter === f ? '1px solid #333' : '1px solid #1e1e1e',
              textTransform: 'capitalize',
            }}>{f}</button>
          ))}
          <span style={{ fontSize: 13, color: '#666', marginLeft: 8 }}>Room:</span>
          {['all', ...rooms.map(r => r.room_key)].map(r => (
            <button key={r} onClick={() => setRoom(r)} style={{
              padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              background: room === r ? '#1a1a1a' : 'transparent',
              color: room === r ? '#fff' : '#666',
              border: room === r ? '1px solid #333' : '1px solid #1e1e1e',
            }}>
              {r === 'all' ? 'all' : (rooms.find(x => x.room_key === r)?.name || r)}
            </button>
          ))}
        </div>

        {/* Alert timeline */}
        <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>Alert Timeline</span>
            <span style={{ fontSize: 12, color: '#555' }}>{filtered.length} events</span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', color: '#555', padding: '60px 0', fontSize: 14 }}>Loading alerts…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', padding: '60px 0', fontSize: 14 }}>No alerts match the current filter.</div>
          ) : (
            <div style={{ padding: '8px 0' }}>
              {filtered.map((a, i) => {
                const crit  = a.severity === 'critical';
                const color = crit ? '#f87171' : '#fbbf24';
                const isNew = now - new Date(a.created_at) < 60_000;
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 16,
                    padding: '14px 22px',
                    borderBottom: i < filtered.length - 1 ? '1px solid #141414' : 'none',
                    background: isNew ? '#0f0e0a' : 'transparent',
                  }}>
                    {/* Timeline dot + line */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 3 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: isNew ? `0 0 8px ${color}` : 'none' }} />
                      {i < filtered.length - 1 && <div style={{ width: 1, background: '#1e1e1e', flex: 1, marginTop: 5, minHeight: 20 }} />}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{
                            fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            letterSpacing: '0.08em', color,
                            background: `${color}15`, padding: '2px 8px', borderRadius: 4, marginRight: 8,
                          }}>{a.severity}</span>
                          <span style={{ fontSize: 11, color: '#555', background: '#111', padding: '2px 8px', borderRadius: 4, border: '1px solid #1e1e1e' }}>
                            {a.room_id}
                          </span>
                          {isNew && <span style={{ fontSize: 10, color: '#4ade80', marginLeft: 8, fontWeight: 600 }}>● LIVE</span>}
                        </div>
                        <span style={{ fontSize: 12, color: '#444', flexShrink: 0, marginLeft: 12 }}>{timeAgo(a.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 14, color: '#ddd', marginTop: 6 }}>{a.message}</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 4 }}>{fmtDate(a.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
