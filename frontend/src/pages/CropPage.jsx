import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CROPS, API, authHeaders, setAuth, getUser } from '../shared';

export default function CropPage() {
  const navigate   = useNavigate();
  const user       = getUser();
  const [selected, setSelected] = useState('');
  const [qty,      setQty]      = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function save() {
    if (!selected) { setError('Please select a crop.'); return; }
    setError(''); setLoading(true);
    try {
      const crop = CROPS[selected];
      const res  = await fetch(`${API}/api/auth/crop`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ crop: crop.label, crop_emoji: crop.emoji, quantity_kg: Number(qty) || 0 }),
      });
      const updated = await res.json();
      setAuth(localStorage.getItem('ccg_token'), updated);
      navigate('/dashboard');
    } catch {
      setError('Could not save. Try again.');
      setLoading(false);
    }
  }

  const crop = selected ? CROPS[selected] : null;

  return (
    <div style={{
      minHeight: '100vh', background: '#000', color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif', padding: '48px 24px',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🌿</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>
            Welcome, {user?.name}!
          </div>
          <div style={{ fontSize: 15, color: '#888', maxWidth: 420, margin: '0 auto' }}>
            Tell us what you're storing. We'll use crop-specific thresholds to monitor quality and send targeted alerts.
          </div>
        </div>

        {/* Crop grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 32 }}>
          {Object.entries(CROPS).map(([key, c]) => (
            <button key={key} onClick={() => setSelected(key)} style={{
              padding: '18px 8px', borderRadius: 10, cursor: 'pointer',
              background: selected === key ? '#161610' : '#0a0a0a',
              border: `2px solid ${selected === key ? '#c8a870' : '#1e1e1e'}`,
              color: selected === key ? '#c8a870' : '#aaa',
              textAlign: 'center', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>{c.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 3 }}>{c.temp[0]}–{c.temp[1]}°C</div>
            </button>
          ))}
        </div>

        {/* Crop detail + quantity */}
        {crop && (
          <div style={{
            background: '#0a0a0a', border: '1px solid #2a2a2a', borderTop: '2px solid #c8a870',
            borderRadius: 12, padding: '24px 28px', marginBottom: 28,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
          }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{crop.emoji} {crop.label}</div>
              <div style={{ fontSize: 13, color: '#888', lineHeight: 1.7, marginBottom: 16 }}>{crop.desc}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Temp Range', val: `${crop.temp[0]} – ${crop.temp[1]} °C` },
                  { label: 'Humidity',   val: `${crop.humidity[0]} – ${crop.humidity[1]}%` },
                  { label: 'Max CO₂',    val: `${crop.co2} ppm` },
                ].map(s => (
                  <div key={s.label} style={{ background: '#111', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#c8a870' }}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Quantity in storage</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <input
                  type="number" min="0" placeholder="e.g. 500" value={qty}
                  onChange={e => setQty(e.target.value)}
                  style={{
                    flex: 1, padding: '11px 14px', borderRadius: 8, fontSize: 15,
                    background: '#111', border: '1px solid #2a2a2a', color: '#fff', outline: 'none',
                  }}
                />
                <span style={{ fontSize: 14, color: '#888' }}>kg</span>
              </div>
              <div style={{ fontSize: 12, color: '#555' }}>Used to estimate potential loss value during risk events.</div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ fontSize: 13, color: '#f87171', background: '#1a0808', border: '1px solid #4a1010', borderRadius: 8, padding: '10px 16px', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => navigate('/dashboard')} style={{
            padding: '12px 28px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', color: '#888', border: '1px solid #2a2a2a', fontSize: 14,
          }}>
            Skip for now
          </button>
          <button onClick={save} disabled={loading || !selected} style={{
            padding: '12px 36px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
            background: selected ? '#c8a870' : '#333', color: '#000',
            fontWeight: 700, fontSize: 15, border: 'none',
          }}>
            {loading ? 'Saving…' : 'Save & Go to Dashboard'}
          </button>
        </div>
      </div>
    </div>
  );
}
