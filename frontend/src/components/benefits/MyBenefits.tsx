import { errorMessage } from '../../utils/errorMessage';
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyBenefits,
  formatKES,
  isExpiringSoon,
  isExpired,
  EmployeeBenefit,
  BenefitType,
  BENEFIT_TYPE_LABELS,
} from '../../services/benefitsService';

// ─── Benefit type icons ───────────────────────────────────────────────────────

const TYPE_ICONS: Record<BenefitType, string> = {
  health_insurance:  '🏥',
  nssf_tier2:        '🏦',
  helb:              '🎓',
  group_life:        '🛡️',
  personal_accident: '⚕️',
  pension:           '💰',
  other:             '📋',
};

const TYPE_COLORS: Record<BenefitType, { bg: string; border: string; accent: string }> = {
  health_insurance:  { bg: '#eff6ff', border: '#bfdbfe', accent: '#1d4ed8' },
  nssf_tier2:        { bg: '#faf5ff', border: '#ddd6fe', accent: '#6d28d9' },
  helb:              { bg: '#fffbeb', border: '#fde68a', accent: '#b45309' },
  group_life:        { bg: '#f0fdf4', border: '#bbf7d0', accent: '#15803d' },
  personal_accident: { bg: '#fef2f2', border: '#fecaca', accent: '#b91c1c' },
  pension:           { bg: '#ecfeff', border: '#a5f3fc', accent: '#0e7490' },
  other:             { bg: '#f9fafb', border: '#e5e7eb', accent: '#374151' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function MyBenefits() {
  const navigate = useNavigate();

  const [benefits, setBenefits] = useState<EmployeeBenefit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  useEffect(() => {
    getMyBenefits()
      .then(data => setBenefits(data.filter(b => b.is_active)))
      .catch(e  => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // Group active benefits by type
  const grouped = useMemo(() => {
    const groups: Partial<Record<BenefitType, EmployeeBenefit[]>> = {};
    for (const b of benefits) {
      if (!groups[b.benefit_type]) groups[b.benefit_type] = [];
      groups[b.benefit_type]!.push(b);
    }
    return groups;
  }, [benefits]);

  const orderedTypes = (Object.keys(grouped) as BenefitType[]).sort();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-50)' }}>
      {/* Top bar */}
      <div style={topBarStyle}>
        <button
          onClick={() => navigate(-1)}
          style={backBtnStyle}
          aria-label="Go back"
        >
          ← Back
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: 'var(--gray-900)' }}>
            My Benefits
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--gray-500)' }}>
            Your active benefit entitlements
          </p>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
        {loading && (
          <div style={centeredMsgStyle}>
            <span style={{ fontSize: '1.5rem' }}>⏳</span>
            <span>Loading your benefits…</span>
          </div>
        )}

        {!loading && error && (
          <div style={errorBoxStyle}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {!loading && !error && benefits.length === 0 && (
          <div style={emptyStateStyle}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <h2 style={{ color: 'var(--gray-700)', marginBottom: '0.5rem' }}>No benefits on record</h2>
            <p style={{ color: 'var(--gray-500)' }}>Contact HR to have your benefits registered.</p>
          </div>
        )}

        {!loading && !error && orderedTypes.map(type => (
          <section key={type} style={{ marginBottom: '2rem' }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '1.4rem' }}>{TYPE_ICONS[type]}</span>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--gray-800)' }}>
                {BENEFIT_TYPE_LABELS[type]}
              </h2>
              <span style={countBadgeStyle}>{grouped[type]!.length}</span>
            </div>

            {/* Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {grouped[type]!.map(b => (
                <BenefitCard key={b.id} benefit={b} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

// ─── Benefit Card ─────────────────────────────────────────────────────────────

function BenefitCard({ benefit: b }: { benefit: EmployeeBenefit }) {
  const type    = b.benefit_type;
  const palette = TYPE_COLORS[type];
  const expired  = isExpired(b.expiry_date);
  const expiring = isExpiringSoon(b.expiry_date);

  // Pre-compute rows that access b.details (Record<string, unknown>) so TypeScript
  // doesn't collapse `boolean && unknown` to `unknown` inside JSX expressions.
  let helbLoanRow: React.ReactNode = null;
  let helbBalanceRow: React.ReactNode = null;
  let pensionEmpRow: React.ReactNode = null;
  let pensionEmplrRow: React.ReactNode = null;
  let healthFamilyRow: React.ReactNode = null;

  if (type === 'helb') {
    const loanRef = b.details?.loan_ref;
    if (loanRef != null && loanRef !== '') {
      helbLoanRow = <DetailRow label="Loan Reference" value={String(loanRef)} mono />;
    }
    const helbBal = b.details?.helb_balance;
    if (helbBal != null) {
      helbBalanceRow = <DetailRow label="Balance" value={`KES ${Number(helbBal).toLocaleString('en-KE')}`} />;
    }
  }

  if (type === 'pension') {
    const pd = b.details as { employee_pct?: number | null; employer_pct?: number | null } | undefined;
    if (pd?.employee_pct != null) {
      pensionEmpRow = <DetailRow label="Your Rate" value={`${pd.employee_pct}%`} />;
    }
    if (pd?.employer_pct != null) {
      pensionEmplrRow = <DetailRow label="Employer Rate" value={`${pd.employer_pct}%`} />;
    }
  }

  if (type === 'health_insurance') {
    const fam = b.details?.family_members_covered;
    if (fam != null && fam !== '') {
      healthFamilyRow = <DetailRow label="Family Cover" value={String(fam)} />;
    }
  }

  return (
    <div style={{
      background: 'white',
      border: `1px solid ${palette.border}`,
      borderTop: `3px solid ${palette.accent}`,
      borderRadius: '10px',
      padding: '1.25rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--gray-900)', fontSize: '0.95rem' }}>
            {b.scheme_name || BENEFIT_TYPE_LABELS[type]}
          </div>
          {b.provider && (
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: '0.15rem' }}>{b.provider}</div>
          )}
        </div>
        <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{TYPE_ICONS[type]}</span>
      </div>

      {/* Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
        {b.cover_level && (
          <DetailRow label="Cover Level" value={b.cover_level} />
        )}
        {b.policy_number && (
          <DetailRow label="Policy No." value={b.policy_number} mono />
        )}
        {b.employee_contribution != null && (
          <DetailRow label="Your Contribution" value={`${formatKES(b.employee_contribution)} / month`} />
        )}
        {b.employer_contribution != null && (
          <DetailRow label="Employer Contribution" value={`${formatKES(b.employer_contribution)} / month`} />
        )}
        {b.effective_date && (
          <DetailRow label="Effective" value={b.effective_date} />
        )}
        {helbLoanRow}
        {helbBalanceRow}
        {pensionEmpRow}
        {pensionEmplrRow}
        {healthFamilyRow}
      </div>

      {/* Expiry badge */}
      {b.expiry_date && (
        <div style={{ marginTop: '0.9rem' }}>
          {expired ? (
            <span style={badgeStyle('danger')}>
              Expired {b.expiry_date}
            </span>
          ) : expiring ? (
            <span style={badgeStyle('warning')}>
              ⚠ Expires {b.expiry_date}
            </span>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>
              Expires {b.expiry_date}
            </span>
          )}
        </div>
      )}

      {/* Notes */}
      {b.notes && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--gray-500)', borderTop: '1px solid var(--gray-100)', paddingTop: '0.6rem' }}>
          {b.notes}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
      <span style={{ color: 'var(--gray-500)', flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--gray-800)', fontWeight: 500, fontFamily: mono ? 'monospace' : undefined, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const topBarStyle: React.CSSProperties = {
  background: 'white',
  borderBottom: '1px solid var(--gray-200)',
  padding: '1rem 1.5rem',
  display: 'flex',
  alignItems: 'center',
  gap: '1.25rem',
  position: 'sticky',
  top: 0,
  zIndex: 10,
};

const backBtnStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid var(--gray-300)',
  borderRadius: '6px',
  padding: '0.4rem 0.85rem',
  cursor: 'pointer',
  color: 'var(--gray-600)',
  fontWeight: 500,
  fontSize: '0.875rem',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  whiteSpace: 'nowrap',
};

const centeredMsgStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '4rem',
  color: 'var(--gray-500)',
};

const errorBoxStyle: React.CSSProperties = {
  background: 'var(--danger-50)',
  border: '1px solid var(--danger-200)',
  color: 'var(--danger-700)',
  borderRadius: '8px',
  padding: '1rem 1.25rem',
};

const emptyStateStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '5rem 2rem',
  background: 'white',
  borderRadius: '12px',
  border: '2px dashed var(--gray-200)',
};

const countBadgeStyle: React.CSSProperties = {
  background: 'var(--gray-100)',
  color: 'var(--gray-500)',
  borderRadius: '999px',
  padding: '0.1rem 0.55rem',
  fontSize: '0.78rem',
  fontWeight: 600,
};

function badgeStyle(variant: 'warning' | 'danger'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    background: variant === 'warning' ? 'var(--warning-100)' : 'var(--danger-100)',
    color:      variant === 'warning' ? 'var(--warning-700)' : 'var(--danger-700)',
    border:     `1px solid ${variant === 'warning' ? 'var(--warning-200)' : 'var(--danger-200)'}`,
  };
}
