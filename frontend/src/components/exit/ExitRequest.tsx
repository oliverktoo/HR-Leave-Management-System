import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getMyExitRequest,
  submitExitRequest,
  type ExitRequest as ExitRequestType,
} from '../../services/exitService';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXIT_TYPES = [
  { value: 'resignation', label: 'Resignation' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'contract_end', label: 'Contract End' },
  { value: 'mutual_agreement', label: 'Mutual Agreement' },
] as const;

type SelfServiceExitType = 'resignation' | 'retirement' | 'contract_end' | 'mutual_agreement';

const STATUS_LABELS: Record<ExitRequestType['status'], string> = {
  pending: 'Pending Review',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  clearance: 'Clearance Phase',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<ExitRequestType['status'], string> = {
  pending: 'var(--gray-500)',
  acknowledged: 'var(--primary-600)',
  in_progress: 'var(--warning-500)',
  clearance: '#f97316',
  completed: 'var(--success-500)',
  cancelled: 'var(--danger-500)',
};

const STATUS_BG: Record<ExitRequestType['status'], string> = {
  pending: 'var(--gray-100)',
  acknowledged: '#dbeafe',
  in_progress: '#fef3c7',
  clearance: '#ffedd5',
  completed: '#dcfce7',
  cancelled: '#fee2e2',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Return the ISO date string that is `days` days after `from` (YYYY-MM-DD) */
const addDays = (from: string, days: number): string => {
  if (!from) return '';
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
};

/** Today's date as YYYY-MM-DD */
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

// ─── Sub-component: Status View ───────────────────────────────────────────────

const ExistingRequestView = ({ request }: { request: ExitRequestType }) => {
  const clearanceItems = Array.isArray(request.clearance_items) ? request.clearance_items : [];
  const cleared = clearanceItems.filter(i => i.cleared).length;
  const total = clearanceItems.length;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* Status card */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid var(--gray-200)',
          padding: '24px 28px',
          marginBottom: 20,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
              Your Exit Request
            </h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)' }}>
              Submitted {fmt(request.created_at)}
            </p>
          </div>
          <span
            style={{
              display: 'inline-block',
              padding: '5px 14px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              background: STATUS_BG[request.status],
              color: STATUS_COLORS[request.status],
            }}
          >
            {STATUS_LABELS[request.status]}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '10px 24px',
            fontSize: 14,
          }}
        >
          {[
            {
              label: 'Exit Type',
              value: EXIT_TYPES.find(t => t.value === request.exit_type)?.label || request.exit_type,
            },
            { label: 'Notice Date', value: fmt(request.notice_date) },
            { label: 'Last Working Day', value: fmt(request.last_working_date) },
          ].map(row => (
            <div key={row.label}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                {row.label}
              </div>
              <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{row.value}</div>
            </div>
          ))}
        </div>

        {request.reason && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Reason
            </div>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-700)' }}>{request.reason}</p>
          </div>
        )}
      </div>

      {/* Clearance checklist (read-only) */}
      {total > 0 && (
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            border: '1px solid var(--gray-200)',
            padding: '20px 24px',
            marginBottom: 20,
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--gray-800)' }}>
              Clearance Progress
            </h3>
            <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
              {cleared} of {total} cleared
            </span>
          </div>

          {/* Progress bar */}
          <div
            style={{
              height: 6,
              background: 'var(--gray-200)',
              borderRadius: 3,
              marginBottom: 14,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: total > 0 ? `${(cleared / total) * 100}%` : '0%',
                background: cleared === total ? 'var(--success-500)' : 'var(--primary-600)',
                borderRadius: 3,
                transition: 'width 0.3s',
              }}
            />
          </div>

          <div style={{ border: '1px solid var(--gray-200)', borderRadius: 8, overflow: 'hidden' }}>
            {clearanceItems.map((item, idx) => (
              <div
                key={item.key}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '9px 14px',
                  borderBottom: idx < clearanceItems.length - 1 ? '1px solid var(--gray-100)' : 'none',
                  background: item.cleared ? '#f0fdf4' : '#fff',
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    border: item.cleared ? 'none' : '2px solid var(--gray-300)',
                    background: item.cleared ? 'var(--success-500)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  {item.cleared && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: item.cleared ? 'var(--success-500)' : 'var(--gray-700)',
                    }}
                  >
                    {item.label}
                  </div>
                  {item.cleared && item.cleared_by_name && (
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>
                      Cleared by {item.cleared_by_name}
                      {item.cleared_at ? ` · ${fmt(item.cleared_at)}` : ''}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: item.cleared ? 'var(--success-500)' : 'var(--gray-400)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                  }}
                >
                  {item.cleared ? 'Cleared' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact HR note */}
      <div
        style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 10,
          padding: '14px 18px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: 18 }}>ℹ️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary-700)', marginBottom: 2 }}>
            Need help or have questions?
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--primary-600)' }}>
            Contact HR directly if you need to make changes to your exit request, have questions about your clearance items, or need support during your offboarding process.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const ExitRequest = () => {
  const [existingRequest, setExistingRequest] = useState<ExitRequestType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Form state
  const [exitType, setExitType] = useState<SelfServiceExitType>('resignation');
  const [noticeDate, setNoticeDate] = useState('');
  const [lastWorkingDate, setLastWorkingDate] = useState('');
  const [reason, setReason] = useState('');

  // ── Load existing request ──────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error: err } = await getMyExitRequest();
        if (err) throw new Error(err.message || 'Failed to load your exit request');
        setExistingRequest(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Notice date → auto-suggest last working date ───────────────────────────

  useEffect(() => {
    if (noticeDate && !lastWorkingDate) {
      setLastWorkingDate(addDays(noticeDate, 30));
    }
  }, [noticeDate]);

  // ── Validation ─────────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!noticeDate) return 'Notice date is required';
    if (noticeDate < today()) return 'Notice date cannot be in the past';
    if (!lastWorkingDate) return 'Last working date is required';
    const minLast = addDays(noticeDate, 30);
    if (lastWorkingDate < minLast) return 'Last working date must be at least 30 days after notice date';
    return null;
  };

  const handleSubmitClick = () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const { data, error: err } = await submitExitRequest({
        exit_type: exitType,
        notice_date: noticeDate,
        last_working_date: lastWorkingDate,
        reason: reason.trim() || undefined,
      });
      if (err) throw new Error(err.message || 'Failed to submit exit request');
      setExistingRequest(data);
      setSuccess('Your exit request has been submitted. HR will review it shortly.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid var(--gray-300)',
    borderRadius: 7,
    fontSize: 14,
    outline: 'none',
    background: '#fff',
    boxSizing: 'border-box',
    color: 'var(--gray-800)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--gray-700)',
    marginBottom: 5,
  };

  const helpText: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--gray-400)',
    marginTop: 4,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '10px 24px',
    background: 'var(--primary-600)',
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '10px 20px',
    background: 'var(--gray-100)',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)',
    borderRadius: 7,
    fontSize: 14,
    cursor: 'pointer',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--gray-50)' }}>
      <AdminSidebar />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid var(--gray-200)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
              🚪 Exit Request
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)' }}>
              Submit your resignation or exit notice
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Alerts */}
        {error && (
          <div
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: 'var(--danger-500)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 14,
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--danger-500)' }}
            >
              ×
            </button>
          </div>
        )}
        {success && (
          <div
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              background: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: 8,
              color: 'var(--success-500)',
              fontSize: 14,
            }}
          >
            {success}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-400)' }}>
              Loading...
            </div>
          ) : existingRequest ? (
            <ExistingRequestView request={existingRequest} />
          ) : (
            /* ── Submission Form ── */
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              {/* Info banner */}
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 10,
                  padding: '14px 18px',
                  marginBottom: 24,
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 18 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#92400e', marginBottom: 3 }}>
                    Please read before submitting
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
                    Submitting an exit request will notify HR immediately. A minimum notice period of 30 days is required.
                    Once submitted, contact HR to make any changes.
                  </p>
                </div>
              </div>

              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid var(--gray-200)',
                  padding: '28px 32px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                }}
              >
                <h2 style={{ margin: '0 0 22px', fontSize: 17, fontWeight: 700, color: 'var(--gray-900)' }}>
                  Submit Exit Notice
                </h2>

                {/* Exit type */}
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Exit Type *</label>
                  <select
                    style={inputStyle}
                    value={exitType}
                    onChange={e => setExitType(e.target.value as SelfServiceExitType)}
                  >
                    {EXIT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Notice date */}
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Notice Date *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={noticeDate}
                    min={today()}
                    onChange={e => {
                      setNoticeDate(e.target.value);
                      // Reset last working date so auto-suggest fires
                      setLastWorkingDate('');
                    }}
                  />
                  <p style={helpText}>The date you are formally giving notice</p>
                </div>

                {/* Last working date */}
                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Last Working Date *</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={lastWorkingDate}
                    min={noticeDate ? addDays(noticeDate, 30) : today()}
                    onChange={e => setLastWorkingDate(e.target.value)}
                  />
                  <p style={helpText}>Must be at least 30 days from your notice date</p>
                </div>

                {/* Reason */}
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Reason (optional)</label>
                  <textarea
                    style={{ ...inputStyle, height: 88, resize: 'vertical' }}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Brief reason for leaving (optional — this is shared with HR)..."
                    maxLength={1000}
                  />
                  <p style={{ ...helpText, textAlign: 'right' }}>{reason.length}/1000</p>
                </div>

                <button
                  style={{ ...btnPrimary, width: '100%', opacity: submitting ? 0.7 : 1 }}
                  onClick={handleSubmitClick}
                  disabled={submitting || !noticeDate || !lastWorkingDate}
                >
                  {submitting ? 'Submitting...' : 'Submit Exit Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirmation Modal ────────────────────────────────────────────── */}
      {showConfirm && (
        <div style={overlayStyle}>
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '28px 32px',
              width: '100%',
              maxWidth: 440,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🚪</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
                Confirm Exit Request
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6 }}>
                You are submitting an exit request for{' '}
                <strong>{EXIT_TYPES.find(t => t.value === exitType)?.label}</strong>.
                <br />
                Notice date: <strong>{fmt(noticeDate)}</strong>
                <br />
                Last working day: <strong>{fmt(lastWorkingDate)}</strong>
              </p>
            </div>
            <div
              style={{
                background: '#fee2e2',
                borderRadius: 8,
                padding: '10px 14px',
                marginBottom: 20,
                fontSize: 13,
                color: 'var(--danger-500)',
                textAlign: 'center',
              }}
            >
              This action will immediately notify HR. Are you sure?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button style={btnSecondary} onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                style={{ ...btnPrimary, background: 'var(--danger-500)' }}
                onClick={handleConfirmSubmit}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Yes, Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
