// OvertimeManagement — admin/HOD view for approving overtime requests
// and employee view for submitting and tracking own requests.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

// ─── Types ────────────────────────────────────────────────────────────────────
interface OvertimeRequest {
  id: string;
  user_id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  hours: number;
  reason: string;
  work_done: string | null;
  overtime_type: 'weekday' | 'weekend' | 'public_holiday' | 'night';
  hod_status: 'pending' | 'approved' | 'rejected';
  hod_comment: string | null;
  hr_status: 'pending' | 'approved' | 'rejected';
  hr_comment: string | null;
  status: 'pending' | 'hod_approved' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  // joined
  staff_name?: string;
  department_name?: string;
}

const OT_TYPE_LABELS: Record<string, string> = {
  weekday: 'Weekday OT',
  weekend: 'Weekend OT',
  public_holiday: 'Public Holiday OT',
  night: 'Night Shift OT',
};

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  pending:      { label: 'Pending',      bg: '#fef3c7', color: '#92400e' },
  hod_approved: { label: 'HOD Approved', bg: '#e0f2fe', color: '#0369a1' },
  approved:     { label: 'Approved',     bg: '#dcfce7', color: '#166534' },
  rejected:     { label: 'Rejected',     bg: '#fee2e2', color: '#991b1b' },
  cancelled:    { label: 'Cancelled',    bg: '#f3f4f6', color: '#6b7280' },
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  btnPrimary: {
    background: 'var(--primary-600)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    background: '#fff',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)',
    borderRadius: 8,
    padding: '8px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    background: '#fff',
    color: 'var(--danger-600, #dc2626)',
    border: '1px solid var(--danger-300, #fca5a5)',
    borderRadius: 8,
    padding: '8px 18px',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSmall: {
    padding: '5px 12px',
    fontSize: 13,
    borderRadius: 6,
  } as React.CSSProperties,
  input: {
    width: '100%',
    border: '1px solid var(--gray-300)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 14,
    color: 'var(--gray-900)',
    background: '#fff',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--gray-700)',
    marginBottom: 4,
  } as React.CSSProperties,
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '24px 16px',
  },
  modal: (maxWidth = 520): React.CSSProperties => ({
    background: '#fff',
    borderRadius: 14,
    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
    width: '100%',
    maxWidth,
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  }),
};

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: '#f3f4f6', color: '#374151' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function OvertimeManagement() {
  const { profile } = useAuth();
  const isAdmin = ['super_admin', 'hr_admin', 'ceo'].includes(profile?.role ?? '');
  const isHod = profile?.role === 'hod';
  const canApprove = isAdmin || isHod;

  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [selectedReq, setSelectedReq] = useState<OvertimeRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  const emptyForm = { date: '', start_time: '', end_time: '', overtime_type: 'weekday' as const, reason: '', work_done: '' };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('v_overtime_summary')
        .select('*')
        .order('date', { ascending: false });

      if (!canApprove) {
        query = query.eq('employee_id', profile?.employee_id ?? '');
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setRequests(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load overtime requests');
    } finally {
      setLoading(false);
    }
  }, [canApprove, profile?.employee_id]);

  useEffect(() => { load(); }, [load]);

  // ── Submit new request ────────────────────────────────────────────────────
  const submitRequest = async () => {
    if (!form.date || !form.start_time || !form.end_time || !form.reason.trim())
      return setError('Date, times, and reason are required');
    if (form.end_time <= form.start_time)
      return setError('End time must be after start time');

    setSubmitting(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: err } = await supabase.from('overtime_requests').insert({
        user_id: user.id,
        employee_id: profile?.employee_id,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        overtime_type: form.overtime_type,
        reason: form.reason.trim(),
        work_done: form.work_done.trim() || null,
      });
      if (err) throw err;
      setSuccess('Overtime request submitted successfully');
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const handleApproval = async (action: 'approve' | 'reject') => {
    if (!selectedReq) return;
    setError('');
    const isHR = isAdmin;
    const updates: Record<string, any> = {};

    if (isHR) {
      updates.hr_status = action === 'approve' ? 'approved' : 'rejected';
      updates.hr_comment = approvalComment || null;
      updates.hr_approved_by = (await supabase.auth.getUser()).data.user?.id;
      updates.hr_approved_at = new Date().toISOString();
    } else if (isHod) {
      updates.hod_status = action === 'approve' ? 'approved' : 'rejected';
      updates.hod_comment = approvalComment || null;
      updates.hod_approved_by = (await supabase.auth.getUser()).data.user?.id;
      updates.hod_approved_at = new Date().toISOString();
    }

    const { error: err } = await supabase.from('overtime_requests').update(updates).eq('id', selectedReq.id);
    if (err) return setError(err.message);
    setSuccess(`Request ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
    setShowApprovalModal(false);
    setApprovalComment('');
    setSelectedReq(null);
    await load();
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const filtered = requests.filter(r => statusFilter === 'all' || r.status === statusFilter);

  const pendingCount = requests.filter(r =>
    canApprove
      ? (isHod ? r.hod_status === 'pending' : r.hr_status === 'pending' && r.hod_status === 'approved')
      : r.status === 'pending'
  ).length;

  const totalApprovedHours = requests
    .filter(r => r.status === 'approved')
    .reduce((sum, r) => sum + Number(r.hours), 0);

  const calcDuration = () => {
    if (!form.start_time || !form.end_time || form.end_time <= form.start_time) return null;
    return ((new Date(`2000-01-01T${form.end_time}`).getTime() - new Date(`2000-01-01T${form.start_time}`).getTime()) / 3600000).toFixed(1);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div style={{
          background: '#fff',
          borderBottom: '1px solid var(--gray-200)',
          padding: '16px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              Overtime {canApprove ? 'Management' : 'Requests'}
            </h1>
            <p style={{ margin: '3px 0 0', color: 'var(--gray-500)', fontSize: 13 }}>
              {canApprove
                ? 'Review and approve overtime requests from your team'
                : 'Submit and track your overtime requests'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {!canApprove && (
              <button style={S.btnPrimary} onClick={() => setShowForm(true)}>
                + Request Overtime
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

        {/* ── Content area ────────────────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px', maxWidth: 1100 }}>

          {/* Banners */}
          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error}</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 16 }} onClick={() => setError('')}>✕</button>
            </div>
          )}
          {success && (
            <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{success}</span>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#166534', fontSize: 16 }} onClick={() => setSuccess('')}>✕</button>
            </div>
          )}

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
            <div style={{ background: '#fef3c7', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#92400e' }}>{pendingCount}</div>
              <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600, marginTop: 2 }}>Awaiting Approval</div>
            </div>
            <div style={{ background: '#dcfce7', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#166534' }}>{totalApprovedHours.toFixed(1)}h</div>
              <div style={{ fontSize: 12, color: '#166534', fontWeight: 600, marginTop: 2 }}>Approved Hours</div>
            </div>
            <div style={{ background: 'var(--gray-50)', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gray-900)' }}>{requests.length}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', fontWeight: 600, marginTop: 2 }}>Total Requests</div>
            </div>
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            {['all', 'pending', 'hod_approved', 'approved', 'rejected'].map(s => (
              <button key={s}
                style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
                  background: statusFilter === s ? 'var(--primary-600)' : 'var(--gray-100)',
                  color: statusFilter === s ? '#fff' : 'var(--gray-700)',
                }}
                onClick={() => setStatusFilter(s)}>
                {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
                {s !== 'all' && (
                  <span style={{ marginLeft: 6, opacity: 0.75 }}>
                    ({requests.filter(r => r.status === s).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Table / Empty state */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--gray-400)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--gray-400)' }}>
              <div style={{ fontSize: 52, marginBottom: 14 }}>⏰</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No overtime requests</div>
              {!canApprove && (
                <button style={{ ...S.btnPrimary, marginTop: 12 }} onClick={() => setShowForm(true)}>
                  Submit First Request
                </button>
              )}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                    {canApprove && <Th>Staff</Th>}
                    <Th>Date</Th>
                    <Th>Time</Th>
                    <Th>Hours</Th>
                    <Th>Type</Th>
                    <Th>Reason</Th>
                    <Th>Status</Th>
                    {canApprove && <Th>Action</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((req, i) => {
                    const needsReview =
                      (isHod && req.hod_status === 'pending') ||
                      (isAdmin && req.hod_status === 'approved' && req.hr_status === 'pending') ||
                      (isAdmin && req.status === 'pending');
                    return (
                      <tr key={req.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                        {canApprove && (
                          <Td>
                            <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{req.staff_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{req.department_name}</div>
                          </Td>
                        )}
                        <Td>{new Date(req.date).toLocaleDateString()}</Td>
                        <Td>{req.start_time?.slice(0, 5)} – {req.end_time?.slice(0, 5)}</Td>
                        <Td><span style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{Number(req.hours).toFixed(1)}h</span></Td>
                        <Td><span style={{ fontSize: 13 }}>{OT_TYPE_LABELS[req.overtime_type]}</span></Td>
                        <Td>
                          <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                            {req.reason}
                          </div>
                        </Td>
                        <Td><Badge status={req.status} /></Td>
                        {canApprove && (
                          <Td>
                            {needsReview ? (
                              <button
                                style={{ ...S.btnPrimary, ...S.btnSmall }}
                                onClick={() => { setSelectedReq(req); setApprovalComment(''); setShowApprovalModal(true); }}>
                                Review
                              </button>
                            ) : (
                              <span style={{ fontSize: 15 }}>
                                {req.status === 'approved' ? '✅' : req.status === 'rejected' ? '❌' : '—'}
                              </span>
                            )}
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── REQUEST FORM MODAL ──────────────────────────────────────────────────── */}
      {showForm && (
        <div style={S.overlay} onClick={() => setShowForm(false)}>
          <div style={S.modal(540)} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>Request Overtime</h2>
              <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }} onClick={() => setShowForm(false)}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Date *</label>
                  <input type="date" style={S.input} value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>Start Time *</label>
                  <input type="time" style={S.input} value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={S.label}>End Time *</label>
                  <input type="time" style={S.input} value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
                </div>
                {calcDuration() && (
                  <div style={{ gridColumn: '1 / -1', background: '#ede9fe', borderRadius: 8, padding: '9px 14px', fontSize: 14, color: '#5b21b6', fontWeight: 600 }}>
                    ⏱ Duration: {calcDuration()} hours
                  </div>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Overtime Type</label>
                  <select style={S.input} value={form.overtime_type} onChange={e => setForm(p => ({ ...p, overtime_type: e.target.value as any }))}>
                    {Object.entries(OT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={S.label}>Reason for Overtime *</label>
                <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Why is this overtime required?" />
              </div>
              <div>
                <label style={S.label}>Work Performed (optional)</label>
                <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={form.work_done} onChange={e => setForm(p => ({ ...p, work_done: e.target.value }))} placeholder="Describe what work was / will be done during this overtime…" />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={S.btnSecondary} onClick={() => setShowForm(false)}>Cancel</button>
              <button style={{ ...S.btnPrimary, opacity: submitting ? 0.7 : 1 }} disabled={submitting} onClick={submitRequest}>
                {submitting ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── APPROVAL MODAL ──────────────────────────────────────────────────────── */}
      {showApprovalModal && selectedReq && (
        <div style={S.overlay} onClick={() => setShowApprovalModal(false)}>
          <div style={S.modal(500)} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>Review Overtime Request</h2>
              <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--gray-500)', lineHeight: 1 }} onClick={() => setShowApprovalModal(false)}>✕</button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 18, border: '1px solid var(--gray-200)' }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--gray-900)' }}>{selectedReq.staff_name}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>{selectedReq.department_name}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  {[
                    { label: 'Date', value: new Date(selectedReq.date).toLocaleDateString() },
                    { label: 'Hours', value: <span style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{Number(selectedReq.hours).toFixed(1)}h</span> },
                    { label: 'Time', value: `${selectedReq.start_time?.slice(0, 5)} – ${selectedReq.end_time?.slice(0, 5)}` },
                    { label: 'Type', value: OT_TYPE_LABELS[selectedReq.overtime_type] },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Reason</div>
                  <div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{selectedReq.reason}</div>
                </div>
                {selectedReq.work_done && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Work Done</div>
                    <div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{selectedReq.work_done}</div>
                  </div>
                )}
              </div>

              <div>
                <label style={S.label}>Comment (optional)</label>
                <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={approvalComment} onChange={e => setApprovalComment(e.target.value)} placeholder="Add a comment for the employee…" />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray-200)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={S.btnDanger} onClick={() => handleApproval('reject')}>✕ Reject</button>
              <button style={S.btnPrimary} onClick={() => handleApproval('approve')}>✓ Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table helpers ────────────────────────────────────────────────────────────
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--gray-500)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: '11px 14px', fontSize: 14, color: 'var(--gray-800)' }}>
      {children}
    </td>
  );
}

export default OvertimeManagement;
