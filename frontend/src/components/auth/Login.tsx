import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn, getUserProfile } from '../../services/authService';

// ─── FKF Brand Palette ────────────────────────────────────────────────────────
const FKF = {
  black:      '#000000',
  blackSoft:  '#0D0D0D',
  red:        '#CE1126',
  redPale:    '#fde8eb',
  green:      '#006B3F',
  greenPale:  '#e6f4ee',
  white:      '#FFFFFF',
  offWhite:   '#F7F8F8',
  grayLight:  '#F3F4F6',
  grayBorder: '#E5E7EB',
  grayMid:    '#9CA3AF',
  grayText:   '#4B5563',
  grayDark:   '#1F2937',
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

type LoginType = 'staff' | 'admin';

export const Login = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loginType, setLoginType] = useState<LoginType>('staff');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error } = await signIn(formData.email, formData.password);

    if (error) {
      setError(error.message || 'Failed to sign in. Please check your credentials.');
      setLoading(false);
    } else if (data?.user) {
      const passwordChanged = data.user.user_metadata?.password_changed;
      if (!passwordChanged) { navigate('/change-password'); return; }

      const { data: profile, error: profileError } = await getUserProfile(data.user.id);
      if (profileError || !profile) {
        setError(profileError ? 'Failed to load user profile.' : 'User profile not found. Contact HR.');
        setLoading(false);
        return;
      }

      const adminRoles = ['hr_admin', 'super_admin', 'hod', 'fleet_manager', 'finance', 'ceo', 'auditor'];
      if (loginType === 'admin') {
        adminRoles.includes(profile.role) ? navigate('/admin/dashboard') : (() => {
          setError('Access denied. This login is for administrators only.');
          setLoading(false);
        })();
      } else {
        navigate(adminRoles.includes(profile.role) ? '/admin/dashboard' : '/dashboard');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* ── MOBILE: Compact header strip (replaces left panel) ── */}
      {isMobile && (
        <div style={{ background: '#1a1a1a', flexShrink: 0 }}>
          {/* Tricolour stripe */}
          <div style={{ display: 'flex', height: 4 }}>
            <div style={{ flex: 1, background: FKF.black }} />
            <div style={{ flex: 1, background: FKF.red }} />
            <div style={{ flex: 1, background: FKF.white }} />
            <div style={{ flex: 1, background: FKF.green }} />
          </div>
          {/* Logo + name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px' }}>
            <img src="/fkf-logo.png" alt="FKF Logo"
              style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: FKF.white, lineHeight: 1.2 }}>
                Football Kenya Federation
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: FKF.red, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>
                HR Portal
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DESKTOP: Left brand panel ── */}
      {!isMobile && (
        <div style={{
          width: '42%', minWidth: 320, flexShrink: 0,
          background: '#1a1a1a',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '48px 40px', position: 'relative', overflow: 'hidden',
        }}>
          {/* Football field line decorations */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.04, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 340, height: 340, borderRadius: '50%', border: '2px solid #fff' }} />
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#fff' }} />
          </div>

          {/* Watermark logo */}
          <img src="/fkf-logo.png" alt=""
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%', maxWidth: 360, objectFit: 'contain',
              opacity: 0.07, pointerEvents: 'none',
            }} />

          {/* Tricolour top accent */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: 4 }}>
            <div style={{ flex: 1, background: FKF.black }} />
            <div style={{ flex: 1, background: FKF.red }} />
            <div style={{ flex: 1, background: FKF.white }} />
            <div style={{ flex: 1, background: FKF.green }} />
          </div>

          {/* Brand content */}
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <img src="/fkf-logo.png" alt="FKF Logo"
              style={{ width: 180, height: 180, objectFit: 'contain', marginBottom: 28,
                filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5))' }} />

            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: FKF.white, letterSpacing: '-0.5px' }}>
              Football Kenya<br />Federation
            </h1>
            <div style={{
              margin: '10px auto 0', fontSize: 12, fontWeight: 700,
              color: FKF.red, textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              Human Resource Portal
            </div>

            <div style={{ width: 40, height: 2, background: FKF.red, margin: '24px auto', borderRadius: 2 }} />

            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, maxWidth: 240, margin: '0 auto' }}>
              Serving FKF staff across all 47 counties of Kenya
            </p>

            {/* Careers link */}
            <button onClick={() => navigate('/careers')}
              style={{
                marginTop: 36,
                padding: '10px 24px', borderRadius: 8,
                background: 'transparent', color: 'rgba(255,255,255,0.65)',
                border: '1px solid rgba(255,255,255,0.2)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'rgba(255,255,255,0.65)';
              }}>
              View Open Careers
            </button>
          </div>
        </div>
      )}

      {/* ── RIGHT — Login Form ── */}
      <div style={{
        flex: 1, background: FKF.offWhite,
        display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center',
        padding: isMobile ? '24px 16px 32px' : '48px 32px',
      }}>
        <div style={{ width: '100%', maxWidth: isMobile ? '100%' : 520 }}>

          {/* Header */}
          <div style={{ marginBottom: isMobile ? 20 : 28 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 22 : 26, fontWeight: 800, color: FKF.grayDark }}>
              Welcome back
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: isMobile ? 14 : 15, color: FKF.grayMid }}>
              Sign in to access your FKF HR account
            </p>
          </div>

          {/* Card */}
          <div style={{
            background: FKF.white,
            border: `1px solid ${FKF.grayBorder}`,
            borderRadius: isMobile ? 12 : 16,
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
            overflow: 'hidden',
          }}>

            {/* Login type tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${FKF.grayBorder}` }}>
              {([['staff', 'Staff Login'], ['admin', 'Admin Login']] as const).map(([type, label], i) => (
                <button key={type}
                  onClick={() => { setLoginType(type); setError(''); }}
                  style={{
                    flex: 1,
                    padding: isMobile ? '14px 0' : '16px 0',
                    border: 'none', cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: isMobile ? 13 : 14,
                    transition: 'all 0.15s',
                    borderRight: i === 0 ? `1px solid ${FKF.grayBorder}` : 'none',
                    background: loginType === type ? FKF.white : FKF.grayLight,
                    color: loginType === type ? FKF.green : FKF.grayMid,
                    borderBottom: loginType === type ? `3px solid ${FKF.green}` : '3px solid transparent',
                    marginBottom: loginType === type ? -1 : 0,
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Form body */}
            <div style={{ padding: isMobile ? '24px 16px 20px' : '36px 36px 28px' }}>

              {/* Error */}
              {error && (
                <div style={{
                  background: FKF.redPale, color: FKF.red, borderRadius: 10,
                  padding: '11px 14px', fontSize: 14, marginBottom: 20,
                  border: `1px solid rgba(206,17,38,0.2)`,
                }}>
                  {error}
                </div>
              )}

              {/* Form fields */}
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 14 : 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: FKF.grayDark, marginBottom: 6 }}>
                    Email Address
                  </label>
                  <input
                    id="email" name="email" type="email" required
                    autoComplete="email"
                    value={formData.email} onChange={handleChange}
                    placeholder="Enter your email address"
                    style={{
                      width: '100%', padding: isMobile ? '13px 14px' : '13px 16px', borderRadius: 10,
                      border: `1.5px solid ${FKF.grayBorder}`,
                      fontSize: 16, // 16px prevents iOS zoom
                      color: FKF.grayDark, background: FKF.offWhite,
                      outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                    onFocus={e => e.currentTarget.style.border = `1.5px solid ${FKF.green}`}
                    onBlur={e => e.currentTarget.style.border = `1.5px solid ${FKF.grayBorder}`}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: FKF.grayDark, marginBottom: 6 }}>
                    Password
                  </label>
                  <input
                    id="password" name="password" type="password" required
                    autoComplete="current-password"
                    value={formData.password} onChange={handleChange}
                    placeholder="Enter your password"
                    style={{
                      width: '100%', padding: isMobile ? '13px 14px' : '13px 16px', borderRadius: 10,
                      border: `1.5px solid ${FKF.grayBorder}`,
                      fontSize: 16, // 16px prevents iOS zoom
                      color: FKF.grayDark, background: FKF.offWhite,
                      outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                    onFocus={e => e.currentTarget.style.border = `1.5px solid ${FKF.green}`}
                    onBlur={e => e.currentTarget.style.border = `1.5px solid ${FKF.grayBorder}`}
                  />
                </div>

                <div style={{ fontSize: 12, color: FKF.grayMid, marginTop: -4 }}>
                  Forgot your password? Contact HR or your Admin to reset it.
                </div>

                <button
                  type="submit" disabled={loading}
                  style={{
                    width: '100%',
                    padding: isMobile ? '15px' : '14px',
                    borderRadius: 10, border: 'none',
                    background: loading ? FKF.grayMid : FKF.green,
                    color: FKF.white,
                    fontSize: isMobile ? 17 : 16,
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginTop: 4,
                    boxShadow: loading ? 'none' : '0 4px 14px rgba(0,107,63,0.35)',
                  }}>
                  {loading ? 'Signing in…' : loginType === 'admin' ? 'Sign In as Admin' : 'Sign In'}
                </button>

                <div style={{ textAlign: 'center', fontSize: 12, color: FKF.grayMid, lineHeight: 1.6, marginTop: 4 }}>
                  {loginType === 'admin'
                    ? <span style={{ color: FKF.red }}>Admin access only. Staff should use the Staff Login tab.</span>
                    : "Don't have an account? Contact your HR Administrator."
                  }
                </div>
              </form>
            </div>

            {/* Card footer */}
            <div style={{
              padding: isMobile ? '14px 16px' : '16px 36px',
              borderTop: `1px solid ${FKF.grayBorder}`,
              background: FKF.offWhite,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 13, color: FKF.grayMid }}>Looking for a job at FKF?&nbsp;</span>
              <button onClick={() => navigate('/careers')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700, color: FKF.green,
                  textDecoration: 'underline', padding: 0,
                }}>
                View open positions
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
