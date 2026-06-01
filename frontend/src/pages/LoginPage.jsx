import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API, setAuth } from '../shared';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode,    setMode]    = useState('login'); // 'login' | 'register'
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [password,setPassword]= useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const body = mode === 'register' ? { name, email, password } : { email, password };
      const res  = await fetch(`${API}/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return; }
      setAuth(data.token, data.user);
      navigate(data.user.crop ? '/dashboard' : '/setup');
    } catch {
      setError('Cannot reach server. Is the backend running?');
      setLoading(false);
    }
  }

  const inp = (value, onChange, placeholder, type = 'text') => (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} required
      style={{
        width: '100%', padding: '12px 16px', borderRadius: 8, fontSize: 14,
        background: '#111', border: '1px solid #2a2a2a', color: '#fff',
        outline: 'none', marginBottom: 12,
      }}
    />
  );

  return (
    <div style={{
      minHeight: '100vh', background: '#000', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>

      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🧊</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>ColdChain Guard</div>
        <div style={{ fontSize: 14, color: '#666', marginTop: 6 }}>IoT Cold Storage Monitoring Platform</div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#0a0a0a', border: '1px solid #2a2a2a',
        borderTop: '2px solid #c8a870',
        borderRadius: 14, padding: '32px 32px 28px',
      }}>
        {/* Toggle */}
        <div style={{ display: 'flex', background: '#111', borderRadius: 8, padding: 4, marginBottom: 28 }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} style={{
              flex: 1, padding: '9px 0', borderRadius: 6, cursor: 'pointer', fontSize: 14,
              background: mode === m ? '#1e1e1e' : 'transparent',
              color: mode === m ? '#fff' : '#666',
              fontWeight: mode === m ? 600 : 400,
              border: mode === m ? '1px solid #333' : '1px solid transparent',
              textTransform: 'capitalize', transition: 'all 0.15s',
            }}>{m === 'login' ? 'Sign In' : 'Create Account'}</button>
          ))}
        </div>

        <form onSubmit={submit}>
          {mode === 'register' && inp(name, setName, 'Full name')}
          {inp(email,    setEmail,    'Email address',  'email')}
          {inp(password, setPassword, 'Password',       'password')}

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', background: '#1a0808', border: '1px solid #4a1010', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '13px', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
            background: loading ? '#333' : '#c8a870', color: '#000',
            fontWeight: 700, fontSize: 15, border: 'none',
            transition: 'background 0.2s',
          }}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#555' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            style={{ color: '#c8a870', cursor: 'pointer', fontWeight: 600 }}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: '#333' }}>
        © 2025 ColdChain Guard · IoT Monitoring Platform
      </div>
    </div>
  );
}
