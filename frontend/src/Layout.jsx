import { useNavigate, useLocation } from 'react-router-dom';
import { ROOMS, clearAuth, getUser } from './shared';

export default function Layout({ children, socket }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const user      = getUser();
  const isAuth    = !!user;
  const path      = location.pathname;

  function logout() {
    clearAuth();
    navigate('/');
  }

  const navLink = (to, label) => (
    <button onClick={() => navigate(to)} style={{
      padding: '8px 18px', borderRadius: 6, cursor: 'pointer',
      background: path === to ? '#1a1a1a' : 'transparent',
      color: path === to ? '#fff' : '#888',
      fontWeight: path === to ? 600 : 400,
      fontSize: 14,
      border: path === to ? '1px solid #2a2a2a' : '1px solid transparent',
      transition: 'all 0.15s',
    }}>
      {label}
    </button>
  );

  const hiddenRoutes = ['/', '/setup'];
  const showNav = !hiddenRoutes.includes(path);

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <nav style={{
        height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', position: 'sticky', top: 0, zIndex: 50,
        background: '#0a0a0a', borderBottom: '2px solid #c8a870',
        boxShadow: '0 2px 20px rgba(200,168,112,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate(isAuth ? '/dashboard' : '/')}>
          <span style={{ fontSize: 22 }}>🧊</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>ColdChain Guard</span>
          <span style={{ fontSize: 11, color: '#888', padding: '2px 9px', background: '#161616', borderRadius: 4, border: '1px solid #2a2a2a', marginLeft: 4 }}>
            IoT Dashboard
          </span>
        </div>

        {showNav && (
          <div style={{ display: 'flex', gap: 2 }}>
            {navLink('/dashboard',   'Dashboard')}
            {navLink('/live-alerts', 'Live Alerts')}
            {navLink('/analytics',   'Analytics')}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isAuth && showNav && (
            <>
              {user.crop && (
                <span style={{ fontSize: 13, color: '#c8a870' }}>
                  {user.crop_emoji} {user.crop}
                </span>
              )}
              <span style={{ fontSize: 13, color: '#888' }}>Hi, {user.name}</span>
              <button onClick={logout} style={{
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
                fontSize: 13, transition: 'all 0.15s',
              }}>
                Logout
              </button>
            </>
          )}
        </div>
      </nav>

      {/* ── Page content ── */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* ── Footer ── */}
      <footer style={{ background: '#0a0a0a', borderTop: '1px solid #2a2a2a', marginTop: 80 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px 32px 36px', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40 }}>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>🧊</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>ColdChain Guard</span>
            </div>
            <p style={{ fontSize: 14, color: '#888', lineHeight: 1.8, margin: '0 0 18px', maxWidth: 270 }}>
              Real-time IoT monitoring for cold storage. Tracks temperature, humidity and CO₂ with live spoilage risk analysis.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['Node.js', 'React', 'Socket.io', 'Python', 'SQLite'].map(t => (
                <span key={t} style={{ fontSize: 11, color: '#c8a870', background: '#161610', padding: '3px 10px', borderRadius: 4, border: '1px solid #3a3020' }}>{t}</span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#c8a870', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, fontWeight: 600 }}>Navigation</div>
            {[['/', 'Home'], ['/dashboard', 'Dashboard'], ['/live-alerts', 'Live Alerts'], ['/analytics', 'Analytics']].map(([to, label]) => (
              <div key={to} onClick={() => navigate(to)} style={{ fontSize: 14, color: '#aaa', marginBottom: 10, cursor: 'pointer' }}
                onMouseEnter={e => e.target.style.color = '#fff'}
                onMouseLeave={e => e.target.style.color = '#aaa'}>
                {label}
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#c8a870', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, fontWeight: 600 }}>Rooms</div>
            {Object.entries(ROOMS).map(([id, r]) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}
                onClick={() => navigate(`/room/${id}`)}>
                <span style={{ fontSize: 14 }}>{r.emoji}</span>
                <div>
                  <div style={{ fontSize: 13, color: '#ccc' }}>{id}</div>
                  <div style={{ fontSize: 11, color: '#555' }}>{r.name}</div>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#c8a870', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16, fontWeight: 600 }}>Safe Ranges</div>
            {[
              { icon: '🌡', label: 'Temperature', val: '1 – 8 °C' },
              { icon: '💧', label: 'Humidity',    val: '80 – 95%' },
              { icon: '🌫', label: 'CO₂',         val: '< 1000 ppm' },
            ].map(t => (
              <div key={t.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>{t.icon} {t.label}</div>
                <div style={{ fontSize: 13, color: '#bbb', fontWeight: 600 }}>{t.val}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1a1a1a' }}>
          <div style={{ maxWidth: 1280, margin: '0 auto', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#555' }}>© 2025 ColdChain Guard · Built for IoT cold storage monitoring</span>
            <span style={{ fontSize: 13, color: '#444' }}>v2.0.0</span>
          </div>
        </div>
      </footer>

      <style>{`* { box-sizing: border-box; } button { font-family: inherit; }`}</style>
    </div>
  );
}
