import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, CATEGORIES, PRODUCTS, authHeaders } from '../shared';

const inp = {
  width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #2a2a2a',
  borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const btn = (active) => ({
  padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600,
  background: active ? '#c8a870' : '#111', color: active ? '#000' : '#666',
  border: `1px solid ${active ? '#c8a870' : '#2a2a2a'}`, transition: 'all 0.15s',
});

function RoomForm({ index, room, onChange, onRemove, canRemove }) {
  const products = PRODUCTS[room.category] || [];
  return (
    <div style={{ background: '#0d0d0d', border: '1px solid #222', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#c8a870' }}>Room {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>ROOM NAME</div>
          <input style={inp} placeholder="e.g. Room 1, Cold Bay A" value={room.name}
            onChange={e => onChange({ ...room, name: e.target.value })} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>QUANTITY (kg)</div>
          <input style={inp} type="number" placeholder="e.g. 500" value={room.quantity_kg}
            onChange={e => onChange({ ...room, quantity_kg: e.target.value })} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>STORAGE CATEGORY</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button key={key} onClick={() => onChange({ ...room, category: key, product: '', product_emoji: '' })}
              style={{ ...btn(room.category === key), padding: '7px 14px', fontSize: 13 }}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {room.category && (
        <div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>SPECIFIC PRODUCT</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {products.map(p => (
              <button key={p.value} onClick={() => onChange({ ...room, product: p.label, product_emoji: p.emoji })}
                style={{ ...btn(room.product === p.label), padding: '7px 14px', fontSize: 13 }}>
                {p.emoji} {p.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StorageForm({ index, storage, onChange }) {
  function addRoom() {
    onChange({ ...storage, rooms: [...storage.rooms, { name: '', category: '', product: '', product_emoji: '', quantity_kg: '' }] });
  }
  function removeRoom(i) {
    onChange({ ...storage, rooms: storage.rooms.filter((_, j) => j !== i) });
  }
  function updateRoom(i, room) {
    const rooms = [...storage.rooms];
    rooms[i] = room;
    onChange({ ...storage, rooms });
  }

  return (
    <div style={{ background: '#0a0a0a', border: '1px solid #2a2a2a', borderTop: '2px solid #c8a870', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>COLD STORAGE {index + 1}</div>
      <input style={{ ...inp, marginBottom: 16 }} placeholder="Cold Storage name (e.g. Warehouse A, Unit 2)"
        value={storage.name} onChange={e => onChange({ ...storage, name: e.target.value })} />

      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Rooms in this storage</div>
      {storage.rooms.map((room, i) => (
        <RoomForm key={i} index={i} room={room} onChange={r => updateRoom(i, r)}
          onRemove={() => removeRoom(i)} canRemove={storage.rooms.length > 1} />
      ))}

      <button onClick={addRoom} style={{
        width: '100%', padding: '10px', background: 'transparent', border: '1px dashed #333',
        borderRadius: 8, color: '#555', cursor: 'pointer', fontSize: 13, marginTop: 4,
      }}>
        + Add another room
      </button>
    </div>
  );
}

export default function SetupWizard() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(0); // 0=intro, 1=setup, 2=submitting
  const [numStorages, setNum] = useState(1);
  const [storages, setStorages] = useState([
    { name: '', rooms: [{ name: '', category: '', product: '', product_emoji: '', quantity_kg: '' }] }
  ]);
  const [error, setError] = useState('');

  function handleNumChange(n) {
    setNum(n);
    setStorages(prev => {
      const next = [...prev];
      while (next.length < n) next.push({ name: '', rooms: [{ name: '', category: '', product: '', product_emoji: '', quantity_kg: '' }] });
      return next.slice(0, n);
    });
  }

  function updateStorage(i, s) {
    const next = [...storages];
    next[i] = s;
    setStorages(next);
  }

  function validate() {
    for (const s of storages) {
      if (!s.name.trim()) return 'Give each cold storage a name.';
      for (const r of s.rooms) {
        if (!r.name.trim())     return 'Give each room a name.';
        if (!r.category)        return 'Select a category for each room.';
      }
    }
    return '';
  }

  async function submit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setStep(2);

    try {
      for (const s of storages) {
        const csRes  = await fetch(`${API}/api/cold-storages`, {
          method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: s.name }),
        });
        const cs = await csRes.json();
        for (const r of s.rooms) {
          await fetch(`${API}/api/rooms`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
              cold_storage_id: cs.id,
              name:            r.name,
              category:        r.category,
              product:         r.product || r.category,
              product_emoji:   r.product_emoji || CATEGORIES[r.category]?.emoji || '📦',
              quantity_kg:     parseFloat(r.quantity_kg) || 0,
            }),
          });
        }
      }
      navigate('/dashboard');
    } catch (e) {
      setStep(1);
      setError('Something went wrong. Please try again.');
    }
  }

  // ── Intro step ──
  if (step === 0) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🧊</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: '0 0 12px' }}>Welcome to ColdChain Guard</h1>
        <p style={{ fontSize: 15, color: '#666', lineHeight: 1.7, margin: '0 0 32px' }}>
          Let's set up your cold storage monitoring. We'll ask you a few questions about your facility so we can start tracking the right rooms for you.
        </p>

        <div style={{ background: '#0a0a0a', border: '1px solid #1e1e1e', borderRadius: 12, padding: 24, marginBottom: 28, textAlign: 'left' }}>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>HOW MANY COLD STORAGES DO YOU MANAGE?</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => handleNumChange(n)} style={{ ...btn(numStorages === n), minWidth: 52 }}>{n}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#444', marginTop: 12 }}>
            Each cold storage can have multiple rooms with different products.
          </div>
        </div>

        <button onClick={() => setStep(1)} style={{
          width: '100%', padding: '14px', background: '#c8a870', color: '#000',
          border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}>
          Continue → Set Up Rooms
        </button>
      </div>
    </div>
  );

  // ── Submitting step ──
  if (step === 2) return (
    <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚙️</div>
        <div style={{ fontSize: 16, color: '#888' }}>Setting up your rooms…</div>
      </div>
    </div>
  );

  // ── Setup step ──
  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800 }}>Set Up Your Cold Storages</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#555' }}>
            Name each storage and add rooms. You can always add more rooms from the dashboard later.
          </p>
        </div>

        {storages.map((s, i) => (
          <StorageForm key={i} index={i} storage={s} onChange={st => updateStorage(i, st)} />
        ))}

        {error && (
          <div style={{ padding: '12px 16px', background: '#1a0808', border: '1px solid #5a1a1a', borderRadius: 8, color: '#f87171', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setStep(0)} style={{ ...btn(false), padding: '12px 24px' }}>← Back</button>
          <button onClick={submit} style={{
            flex: 1, padding: '12px', background: '#c8a870', color: '#000',
            border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            Start Monitoring →
          </button>
        </div>
      </div>
    </div>
  );
}
