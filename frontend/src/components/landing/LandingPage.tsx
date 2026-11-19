import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const FKF = {
  black:      '#000000',
  blackSoft:  '#0D0D0D',
  blackMid:   '#1A1A1A',
  red:        '#CE1126',
  redDark:    '#A50E1F',
  green:      '#006B3F',
  greenDark:  '#004D2C',
  greenLight: '#008A50',
  white:      '#FFFFFF',
  offWhite:   '#F7F8F8',
  grayLight:  '#F3F4F6',
  grayBorder: '#E5E7EB',
  grayMid:    '#9CA3AF',
  grayText:   '#4B5563',
};

const stats = [
  { value: '500+', label: 'Staff Members' },
  { value: '18',   label: 'Departments' },
  { value: '47',   label: 'Counties Reached' },
  { value: '40+',  label: 'Active Leagues' },
];

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

export function LandingPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: FKF.white, minHeight: '100vh', overflowX: 'hidden' }}>

      {/* ── STICKY NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled || menuOpen ? 'rgba(0,0,0,0.96)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
        transition: 'all 0.3s ease',
        padding: isMobile ? '0 16px' : '0 40px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: isMobile ? 60 : 72,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/fkf-logo.png" alt="FKF Logo"
              style={{ width: isMobile ? 46 : 70, height: isMobile ? 46 : 70, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} />
            {!isMobile && (
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: FKF.white, letterSpacing: '0.01em' }}>
                  Football Kenya Federation
                </div>
                <div style={{ fontSize: 11, color: FKF.red, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Human Resource Portal
                </div>
              </div>
            )}
            {isMobile && (
              <div style={{ fontWeight: 800, fontSize: 13, color: FKF.white }}>FKF HR Portal</div>
            )}
          </div>

          {/* Desktop nav actions */}
          {!isMobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 6 }}>
                About
              </button>
              <button onClick={() => navigate('/careers')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: 500, padding: '8px 14px', borderRadius: 6 }}>
                Careers
              </button>
              <button onClick={() => navigate('/login')}
                style={{ padding: '9px 22px', borderRadius: 8, background: FKF.green, color: FKF.white, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Staff Sign In →
              </button>
            </div>
          )}

          {/* Mobile hamburger */}
          {isMobile && (
            <button onClick={() => setMenuOpen(o => !o)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}>
              <div style={{ width: 22, height: 2, background: FKF.white, marginBottom: 5, transition: 'all 0.2s', transform: menuOpen ? 'rotate(45deg) translate(5px,5px)' : 'none' }} />
              <div style={{ width: 22, height: 2, background: FKF.white, marginBottom: 5, opacity: menuOpen ? 0 : 1, transition: 'all 0.2s' }} />
              <div style={{ width: 22, height: 2, background: FKF.white, transition: 'all 0.2s', transform: menuOpen ? 'rotate(-45deg) translate(5px,-5px)' : 'none' }} />
            </button>
          )}
        </div>

        {/* Mobile dropdown menu */}
        {isMobile && menuOpen && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: '16px 0 20px' }}>
            <button onClick={() => { document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); setMenuOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 500, padding: '12px 4px' }}>
              About
            </button>
            <button onClick={() => { navigate('/careers'); setMenuOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.8)', fontSize: 15, fontWeight: 500, padding: '12px 4px' }}>
              Careers
            </button>
            <button onClick={() => navigate('/login')}
              style={{ display: 'block', width: '100%', marginTop: 8, padding: '13px', borderRadius: 8, background: FKF.green, color: FKF.white, border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Staff Sign In →
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(160deg, #1a1a1a 0%, #1f1f1f 55%, #142010 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: isMobile ? '100px 20px 80px' : '120px 24px 80px',
        position: 'relative', overflow: 'hidden',
      }}>
        <FieldLines />

        <img src="/fkf-logo.png" alt=""
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '110%', maxWidth: 960, objectFit: 'contain', opacity: 0.13, pointerEvents: 'none', userSelect: 'none' }} />

        {/* Tricolour top stripe */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: 5 }}>
          <div style={{ flex: 1, background: FKF.black }} /><div style={{ flex: 1, background: FKF.red }} />
          <div style={{ flex: 1, background: FKF.white }} /><div style={{ flex: 1, background: FKF.green }} />
        </div>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(206,17,38,0.12)', border: `1px solid rgba(206,17,38,0.3)`, borderRadius: 30, padding: '6px 18px', marginBottom: 28 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: FKF.red, display: 'inline-block' }} />
          <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 700, color: '#ff4d65', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Official HR Management System
          </span>
        </div>

        <h1 style={{ margin: 0, fontSize: isMobile ? 30 : 'clamp(32px, 5.5vw, 62px)', fontWeight: 900, color: FKF.white, lineHeight: 1.15, letterSpacing: '-0.5px', maxWidth: 780 }}>
          Managing the People Behind{' '}
          <span style={{ color: FKF.red }}>Kenya's Football</span>
        </h1>

        <p style={{ margin: '18px auto 0', fontSize: isMobile ? 15 : 18, color: 'rgba(255,255,255,0.62)', maxWidth: 520, lineHeight: 1.75, padding: isMobile ? '0 4px' : 0 }}>
          The Football Kenya Federation HR Portal — streamlining staff management,
          recruitment, and operations across all 47 counties.
        </p>

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, marginTop: 40, width: isMobile ? '100%' : 'auto', maxWidth: isMobile ? 320 : 'none' }}>
          <button onClick={() => navigate('/careers')} style={{ padding: isMobile ? '15px' : '16px 36px', borderRadius: 10, background: FKF.green, color: FKF.white, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,107,63,0.45)' }}>
            View Careers
          </button>
          <button onClick={() => navigate('/login')} style={{ padding: isMobile ? '15px' : '16px 36px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: FKF.white, border: '1px solid rgba(255,255,255,0.2)', fontSize: 16, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
            Staff Sign In
          </button>
        </div>

        {!isMobile && (
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.28)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Scroll</span>
            <span style={{ animation: 'bounce 1.6s infinite' }}>↓</span>
          </div>
        )}
      </div>

      {/* ── TRICOLOUR BAND ── */}
      <div style={{ display: 'flex', height: 5 }}>
        <div style={{ flex: 1, background: FKF.black }} /><div style={{ flex: 1, background: FKF.red }} />
        <div style={{ flex: 1, background: FKF.white }} /><div style={{ flex: 1, background: FKF.green }} />
      </div>

      {/* ── STATS BAND ── */}
      <div style={{ background: FKF.green, padding: isMobile ? '32px 20px' : '40px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 24 : 32, textAlign: 'center' }}>
          {stats.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: isMobile ? 32 : 40, fontWeight: 900, color: FKF.white, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ABOUT SECTION ── */}
      <div id="about" style={{ background: FKF.offWhite, padding: isMobile ? '56px 20px' : '80px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 40 : 64, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: FKF.green, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
              About FKF HR
            </div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 26 : 34, fontWeight: 800, color: FKF.black, lineHeight: 1.2 }}>
              Built for the People Who Run{' '}
              <span style={{ color: FKF.red }}>Kenyan Football</span>
            </h2>
            <p style={{ marginTop: 18, fontSize: isMobile ? 15 : 16, color: FKF.grayText, lineHeight: 1.8 }}>
              From county-level administrators to national team technical staff, our HR portal
              serves the entire FKF workforce — managing leave, attendance, payroll, and
              career opportunities in one unified system.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 24 }}>
              {[
                'Digital leave and attendance tracking',
                'Transparent recruitment pipeline',
                'Payroll & statutory compliance (PAYE, NSSF, NHIF)',
                'Fleet and asset management',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: FKF.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 15, color: FKF.grayText }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dark feature card */}
          <div style={{ background: FKF.black, borderRadius: 20, padding: isMobile ? 24 : 40, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 22, border: `1px solid rgba(255,255,255,0.06)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <img src="/fkf-logo.png" alt="FKF" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              <div style={{ fontWeight: 700, color: FKF.white, fontSize: 14 }}>Football Kenya Federation</div>
            </div>
            {[
              { col: FKF.red,   title: 'Football First',   desc: "Supporting Kenya's football ecosystem from grassroots to elite." },
              { col: FKF.green, title: 'High Performance', desc: 'World-class HR tools enabling FKF to attract and retain top talent.' },
              { col: FKF.white, title: 'Proudly Kenyan',   desc: "Built for Kenya's regulatory environment — KRA, NSSF, NHIF compliant." },
            ].map(card => (
              <div key={card.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 3, height: 36, borderRadius: 2, background: card.col, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: FKF.white }}>{card.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3, lineHeight: 1.6 }}>{card.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CAREERS CTA ── */}
      <div style={{ background: FKF.white, padding: isMobile ? '56px 20px' : '80px 40px', textAlign: 'center', borderTop: `4px solid ${FKF.red}` }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <img src="/fkf-logo.png" alt="FKF" style={{ width: isMobile ? 56 : 72, height: isMobile ? 56 : 72, objectFit: 'contain', marginBottom: 18 }} />
          <h2 style={{ margin: 0, fontSize: isMobile ? 24 : 32, fontWeight: 800, color: FKF.black }}>
            Ready to Join the Team?
          </h2>
          <p style={{ marginTop: 14, fontSize: isMobile ? 14 : 16, color: FKF.grayText, lineHeight: 1.7 }}>
            Explore open positions across football administration, coaching, technical support,
            finance, and more across Kenya.
          </p>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 14, justifyContent: 'center', marginTop: 28 }}>
            <button onClick={() => navigate('/careers')} style={{ padding: '14px 34px', borderRadius: 10, background: FKF.green, color: FKF.white, border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,107,63,0.3)' }}>
              View Open Positions
            </button>
            <button onClick={() => navigate('/login')} style={{ padding: '14px 34px', borderRadius: 10, background: FKF.white, color: FKF.grayText, border: `1px solid ${FKF.grayBorder}`, fontSize: 16, fontWeight: 600, cursor: 'pointer' }}>
              Staff Login
            </button>
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{ background: FKF.black, color: 'rgba(255,255,255,0.4)', padding: isMobile ? '24px 20px' : '32px 40px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 16, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/fkf-logo.png" alt="FKF" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span>© {new Date().getFullYear()} Football Kenya Federation. All rights reserved.</span>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <span style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }} onClick={() => navigate('/careers')}>Careers</span>
          <span style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }} onClick={() => navigate('/login')}>Staff Portal</span>
        </div>
      </footer>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
      `}</style>
    </div>
  );
}

function FieldLines() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.04, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 360, height: 360, borderRadius: '50%', border: '2px solid #fff' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#fff' }} />
      <div style={{ position: 'absolute', top: '15%', left: '-80px', width: 220, height: 220, borderRadius: '50%', border: '2px solid #fff' }} />
      <div style={{ position: 'absolute', bottom: '15%', right: '-80px', width: 220, height: 220, borderRadius: '50%', border: '2px solid #fff' }} />
    </div>
  );
}

export default LandingPage;
