import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabaseUrl, supabaseAnonKey } from '../../lib/supabaseClient';

interface VerifyResult {
  found: boolean;
  first_name: string;
  last_name: string;
  employee_id: string;
  job_title: string | null;
  role: string;
  department: string | null;
  profile_photo_url: string | null;
  is_active: boolean;
  card_valid: boolean;
  generation_mismatch: boolean;
  invalidated: boolean;
}

const ROLE_TITLE: Record<string, string> = {
  super_admin:   'System Administrator',
  hr_admin:      'HR Administrator',
  ceo:           'Chief Executive Officer',
  finance:       'Finance Officer',
  hod:           'Head of Department',
  fleet_manager: 'Fleet Manager',
  driver:        'Driver',
  auditor:       'Auditor',
  employee:      'Staff',
};

function statusInfo(r: VerifyResult): { label: string; sub: string; color: string; bg: string } {
  if (r.card_valid) return { label: 'VERIFIED',  sub: 'This is a valid Football Kenya Federation staff card', color: '#15803d', bg: '#dcfce7' };
  return                   { label: 'NOT VALID', sub: 'This card could not be verified',                      color: '#b91c1c', bg: '#fee2e2' };
}

export function CardVerify() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const generation = parseInt(searchParams.get('v') ?? '1', 10);

  const [loading, setLoading]   = useState(true);
  const [result,  setResult]    = useState<VerifyResult | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [verifiedAt]            = useState(new Date());

  useEffect(() => { verify(); }, [employeeId]);

  async function verify() {
    setLoading(true);
    setRpcError(null);

    const notFound: VerifyResult = {
      found: false, first_name: '', last_name: '', employee_id: employeeId ?? '',
      job_title: null, role: '', department: null, profile_photo_url: null,
      is_active: false, card_valid: false, generation_mismatch: false, invalidated: false,
    };

    const timer = setTimeout(() => {
      setRpcError('Request timed out — please try again');
      setLoading(false);
      setResult(notFound);
    }, 12000);

    try {
      // Use a raw fetch with the anon key so no session state interferes
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/rpc/verify_staff_card`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            p_employee_id: employeeId ?? '',
            p_generation:  generation,
          }),
        }
      );

      if (!resp.ok) {
        const errText = await resp.text().catch(() => resp.statusText);
        let msg = errText;
        try { msg = JSON.parse(errText).message ?? errText; } catch { /* keep raw */ }
        setRpcError(`${resp.status}: ${msg}`);
        setResult(notFound);
        return;
      }

      const data: VerifyResult = await resp.json();
      setResult(data);
    } catch (e) {
      setRpcError(e instanceof Error ? e.message : 'Network error');
      setResult(notFound);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  const status   = result ? statusInfo(result) : null;
  const isValid  = result?.card_valid ?? false;

  const pageBg = loading
    ? 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)'
    : isValid
      ? 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)'
      : 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)';

  const cardShadow = loading
    ? '0 4px 24px rgba(0,0,0,0.08)'
    : isValid
      ? '0 4px 40px rgba(34,197,94,0.2), 0 0 0 1px rgba(34,197,94,0.15)'
      : '0 4px 40px rgba(239,68,68,0.2), 0 0 0 1px rgba(239,68,68,0.15)';

  return (
    <div style={{
      minHeight: '100vh', background: pageBg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem', fontFamily: "'Segoe UI', Arial, sans-serif",
      transition: 'background 0.5s ease',
    }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e3a5f', letterSpacing: '2px', marginBottom: '0.25rem' }}>
          FOOTBALL KENYA FEDERATION
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', letterSpacing: '1px' }}>
          STAFF IDENTIFICATION VERIFICATION
        </div>
      </div>

      {/* Main card */}
      <div style={{
        background: '#fff', borderRadius: 20, padding: '2rem',
        maxWidth: 420, width: '100%',
        boxShadow: cardShadow, transition: 'box-shadow 0.5s ease',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              border: '4px solid #e2e8f0', borderTopColor: '#1d4ed8',
              margin: '0 auto 1rem', animation: 'spin 1s linear infinite',
            }} />
            <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Verifying card…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : result && status ? (
          <>
            {/* Status icon + label */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div style={{
                width: 96, height: 96, borderRadius: '50%',
                background: status.bg,
                border: `4px solid ${status.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 48, marginBottom: '0.875rem',
                boxShadow: `0 0 0 8px ${status.color}20`,
              }}>
                {isValid ? '✓' : '✗'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: status.color, letterSpacing: '0.5px' }}>
                {status.label}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem', textAlign: 'center' }}>
                {status.sub}
              </div>
              {rpcError && (
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem', textAlign: 'center',
                  background: '#f8fafc', borderRadius: 6, padding: '4px 10px', fontFamily: 'monospace' }}>
                  {rpcError}
                </div>
              )}
            </div>

            {/* Employee details */}
            {result.found && (
              <div style={{
                background: '#f8fafc', borderRadius: 12, padding: '1rem',
                display: 'flex', gap: '1rem', alignItems: 'center',
                marginBottom: '1.25rem',
                border: `1px solid ${isValid ? '#bbf7d0' : '#fecaca'}`,
              }}>
                {/* Photo */}
                <div style={{
                  width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                  overflow: 'hidden', background: status.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 700, color: status.color,
                  border: `2px solid ${status.color}`,
                }}>
                  {result.profile_photo_url
                    ? <img src={result.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : `${result.first_name.charAt(0)}${result.last_name.charAt(0)}`}
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                    {result.first_name} {result.last_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                    {result.job_title || ROLE_TITLE[result.role] || 'Staff'}
                  </div>
                  {result.department && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1 }}>
                      {result.department}
                    </div>
                  )}
                  <div style={{
                    marginTop: 4, display: 'inline-block',
                    background: status.bg, color: status.color,
                    borderRadius: 4, padding: '1px 8px',
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px', fontFamily: 'monospace',
                  }}>
                    {result.employee_id}
                  </div>
                </div>
              </div>
            )}

            {/* Timestamp */}
            <div style={{
              textAlign: 'center', fontSize: '0.72rem', color: '#94a3b8',
              borderTop: '1px solid #f1f5f9', paddingTop: '0.875rem',
            }}>
              Verified on {verifiedAt.toLocaleDateString('en-KE', {
                timeZone: 'Africa/Nairobi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
              })} at {verifiedAt.toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
              <br />
              <span style={{ color: '#cbd5e1' }}>Reference: {result.employee_id || employeeId}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Property notice */}
      <div style={{
        marginTop: '1.75rem', maxWidth: 420, width: '100%',
        background: 'rgba(255,255,255,0.7)', borderRadius: 12,
        padding: '0.875rem 1rem', border: '1px solid rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontSize: '0.7rem', color: '#475569', lineHeight: 1.6, textAlign: 'center' }}>
          <strong style={{ color: '#1e3a5f', display: 'block', marginBottom: '0.25rem' }}>
            ⚠ PROPERTY NOTICE
          </strong>
          This card is the property of <strong>Football Kenya Federation</strong>.
          If found, please return it to:<br />
          <strong>FKF Head Quarters, Kandanda House, Nairobi</strong><br />
          Tel: +254 759910866 · www.footballkenya.org
        </div>
      </div>

      {/* Contact footer */}
      <div style={{
        marginTop: '1rem', maxWidth: 420, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
      }}>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center' }}>
          Tel: +254 759910866 &nbsp;·&nbsp; Email: hr@footballkenya.org &nbsp;·&nbsp; Website: www.footballkenya.org
        </div>
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center' }}>
          © {new Date().getFullYear()} Football Kenya Federation · FKF HR System
        </div>
      </div>
    </div>
  );
}
