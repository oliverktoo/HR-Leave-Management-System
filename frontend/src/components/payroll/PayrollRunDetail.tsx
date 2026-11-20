import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPayrollRunById,
  getPayrollLines,
  computeAndSaveRun,
  advancePayrollRunStatus,
  getRemittances,
  markRemittanceDone,
  createRevision,
  saveVariablePayForLine,
  generateBankFile,
  setPayslipsReleased,
  downloadCSV,
  openPayslip,
  PayrollRun,
  PayrollLine,
  PayrollRemittance,
  VariablePayInput,
  formatKES,
  monthName,
  ApprovalAction,
} from '../../services/payrollService';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

// ─── Status flow ───────────────────────────────────────────────────────────────

const STATUS_FLOW: Record<string, { next: ApprovalAction; nextLabel: string; reject?: ApprovalAction; rejectLabel?: string } | null> = {
  draft:           { next: 'submit',          nextLabel: 'Submit for HR Review' },
  pending_hr:      { next: 'approve_hr',      nextLabel: 'Approve (HR)',      reject: 'reject_hr',      rejectLabel: 'Reject (HR)' },
  pending_finance: { next: 'approve_finance', nextLabel: 'Approve (Finance)', reject: 'reject_finance', rejectLabel: 'Reject (Finance)' },
  pending_ceo:     { next: 'approve_ceo',     nextLabel: 'Approve (CEO)',     reject: 'reject_ceo',     rejectLabel: 'Reject (CEO)' },
  approved:        { next: 'mark_paid',       nextLabel: 'Mark as Paid' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:           { label: 'Draft',           color: '#94a3b8' },
  pending_hr:      { label: 'Pending HR',      color: '#f59e0b' },
  pending_finance: { label: 'Pending Finance', color: '#3b82f6' },
  pending_ceo:     { label: 'Pending CEO',     color: '#8b5cf6' },
  approved:        { label: 'Approved',        color: '#10b981' },
  rejected:        { label: 'Rejected',        color: '#ef4444' },
  paid:            { label: 'Paid',            color: '#059669' },
  superseded:      { label: 'Superseded',      color: '#6b7280' },
};

const REMITTANCE_LABELS: Record<string, string> = {
  paye:         'PAYE (KRA iTax)',
  nssf:         'NSSF',
  shif:         'SHIF/SHA',
  housing_levy: 'Housing Levy',
};

// ─── Variable pay edit modal ───────────────────────────────────────────────────

interface VarPayModalProps {
  line: PayrollLine;
  onSave: (lineId: string, vp: Partial<VariablePayInput>) => Promise<void>;
  onClose: () => void;
}

function VariablePayModal({ line, onSave, onClose }: VarPayModalProps) {
  const [overtimeHours,  setOvertimeHours]  = useState(line.overtime_hours  || 0);
  const [overtimeAmount, setOvertimeAmount] = useState(line.overtime_amount || 0);
  const [bonus,          setBonus]          = useState(line.bonus_amount    || 0);
  const [acting,         setActing]         = useState(line.acting_allowance || 0);
  const [perDiem,        setPerDiem]        = useState(line.per_diem_amount || 0);
  const [bik,            setBik]            = useState(line.benefits_in_kind || 0);
  const [courtAmount,    setCourtAmount]    = useState(line.court_deduction_amount || 0);
  const [courtRef,       setCourtRef]       = useState(line.court_deduction_ref   || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const name = line.profile ? `${line.profile.first_name} ${line.profile.last_name}` : line.employee_id || '';

  async function handleSave() {
    setSaving(true);
    setErr('');
    try {
      await onSave(line.id, {
        overtime_hours:       overtimeHours,
        overtime_amount:      overtimeAmount,
        bonus_amount:         bonus,
        acting_allowance:     acting,
        per_diem_amount:      perDiem,
        benefits_in_kind:     bik,
        court_deduction_amount: courtAmount,
        court_deduction_ref:  courtRef,
      });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h3 className="modal-title">Variable Pay — {name}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
          SOP 6.2: Enter overtime, bonuses, allowances and court deductions for this period.
          These are applied on top of basic salary and fixed allowances.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Overtime Hours</label>
            <input type="number" className="form-control" min={0} step={0.5}
              value={overtimeHours} onChange={e => setOvertimeHours(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Overtime Amount (KES)</label>
            <input type="number" className="form-control" min={0}
              value={overtimeAmount} onChange={e => setOvertimeAmount(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Performance Bonus (KES)</label>
            <input type="number" className="form-control" min={0}
              value={bonus} onChange={e => setBonus(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Acting Allowance (KES)</label>
            <input type="number" className="form-control" min={0}
              value={acting} onChange={e => setActing(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Per Diem (KES)</label>
            <input type="number" className="form-control" min={0}
              value={perDiem} onChange={e => setPerDiem(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Benefits in Kind (KES)</label>
            <input type="number" className="form-control" min={0}
              value={bik} onChange={e => setBik(Number(e.target.value))}
              title="Non-cash taxable benefits (company car, housing, etc.). Added to chargeable income for PAYE." />
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Court-ordered deduction (if any)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">Court Deduction (KES)</label>
              <input type="number" className="form-control" min={0}
                value={courtAmount} onChange={e => setCourtAmount(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Court Order Ref.</label>
              <input type="text" className="form-control" placeholder="e.g. CMCC 123/2025"
                value={courtRef} onChange={e => setCourtRef(e.target.value)} />
            </div>
          </div>
        </div>

        {err && <div className="error-message" style={{ marginTop: '0.5rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save & Recompute'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Remittance mark-done modal ────────────────────────────────────────────────

interface RemittanceModalProps {
  remittance: PayrollRemittance;
  onSave: (id: string, ref: string, notes: string) => Promise<void>;
  onClose: () => void;
}

function RemittanceModal({ remittance, onSave, onClose }: RemittanceModalProps) {
  const [ref,   setRef]   = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    if (!ref.trim()) { setErr('Reference number is required'); return; }
    setSaving(true);
    setErr('');
    try {
      await onSave(remittance.id, ref.trim(), notes);
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 className="modal-title">Mark Remitted — {REMITTANCE_LABELS[remittance.remittance_type]}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Amount: <strong>{formatKES(remittance.amount)}</strong> &nbsp;|&nbsp; Due: {remittance.due_date}
        </p>
        <div className="form-group">
          <label className="form-label">Portal / iTax Reference Number *</label>
          <input type="text" className="form-control" placeholder="e.g. PRN12345678"
            value={ref} onChange={e => setRef(e.target.value)} />
        </div>
        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label className="form-label">Notes (optional)</label>
          <textarea className="form-control" rows={2}
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
        {err && <div className="error-message">{err}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm Remittance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Revision modal ────────────────────────────────────────────────────────────

interface RevisionModalProps {
  onConfirm: (notes: string) => Promise<void>;
  onClose: () => void;
}

function RevisionModal({ onConfirm, onClose }: RevisionModalProps) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleConfirm() {
    if (!notes.trim()) { setErr('Please describe what was corrected'); return; }
    setSaving(true);
    setErr('');
    try {
      await onConfirm(notes.trim());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 className="modal-title">Create Revised Run</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
          A new draft will be created with the same period. The rejected run will be marked superseded.
          Variable pay must be re-entered on the new draft.
        </p>
        <div className="form-group">
          <label className="form-label">Revision notes — what was corrected? *</label>
          <textarea className="form-control" rows={3}
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Corrected overtime for 3 staff; updated acting allowance for HOD" />
        </div>
        {err && <div className="error-message">{err}</div>}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Creating…' : 'Create Revision'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PayrollRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [run,          setRun]          = useState<PayrollRun | null>(null);
  const [lines,        setLines]        = useState<PayrollLine[]>([]);
  const [remittances,  setRemittances]  = useState<PayrollRemittance[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,        setError]        = useState('');
  const [comments,     setComments]     = useState('');
  const [search,       setSearch]       = useState('');

  // Modals
  const [confirmAction,    setConfirmAction]    = useState<ApprovalAction | null>(null);
  const [editVarPayLine,   setEditVarPayLine]   = useState<PayrollLine | null>(null);
  const [markRemittance,   setMarkRemittance]   = useState<PayrollRemittance | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [r, ls] = await Promise.all([getPayrollRunById(id), getPayrollLines(id)]);
      setRun(r);
      setLines(ls);
      if (r && ['approved', 'paid'].includes(r.status)) {
        const rems = await getRemittances(id);
        setRemittances(rems);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function handleRecompute() {
    if (!id) return;
    setActionLoading(true);
    try { await computeAndSaveRun(id); await load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setActionLoading(false); }
  }

  async function handleAction(action: ApprovalAction) {
    if (!id) return;
    setActionLoading(true);
    setError('');
    try {
      const updated = await advancePayrollRunStatus(id, action, comments || undefined);
      setRun(updated);
      setConfirmAction(null);
      setComments('');
      if (['approved', 'paid'].includes(updated.status)) {
        const rems = await getRemittances(id);
        setRemittances(rems);
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setActionLoading(false); }
  }

  async function handleSaveVariablePay(lineId: string, vp: Partial<VariablePayInput>) {
    await saveVariablePayForLine(lineId, vp);
    await load();
  }

  async function handleMarkRemittance(remId: string, ref: string, notes: string) {
    await markRemittanceDone(remId, ref, notes);
    if (id) {
      const rems = await getRemittances(id);
      setRemittances(rems);
    }
  }

  async function handleCreateRevision(notes: string) {
    if (!id) return;
    const newRun = await createRevision(id, notes);
    navigate(`/payroll/runs/${newRun.id}`);
  }

  async function handleSetPayslipsReleased(release: boolean) {
    if (!id || !run) return;
    const period = `${monthName(run.pay_period_month)} ${run.pay_period_year}`;
    const ok = window.confirm(release
      ? `Release ${period} payslips? Every employee on this run will be able to view their payslip and will get a notification.`
      : `Withdraw ${period} payslips? Employees will no longer be able to view them until you release again.`);
    if (!ok) return;
    setActionLoading(true);
    setError('');
    try { setRun(await setPayslipsReleased(id, release)); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setActionLoading(false); }
  }

  function handleDownloadBankFile() {
    if (!run) return;
    const csv = generateBankFile(lines, `${monthName(run.pay_period_month)} ${run.pay_period_year}`);
    downloadCSV(csv, `FKF_Payroll_${run.pay_period_year}_${String(run.pay_period_month).padStart(2, '0')}_bank.csv`);
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  if (loading) return <div className="loading-spinner">Loading run…</div>;
  if (error && !run) return <div className="error-message">{error}</div>;
  if (!run) return null;

  const st      = STATUS_LABELS[run.status] ?? { label: run.status, color: '#94a3b8' };
  const flow    = STATUS_FLOW[run.status];
  const role    = profile?.role ?? '';
  const canAct  = role === 'hr_admin' || role === 'super_admin' || role === 'finance' || role === 'ceo';
  const isDraft = run.status === 'draft';
  const isApprovedOrPaid = ['approved', 'paid'].includes(run.status);
  const isHrAdmin = ['hr_admin', 'super_admin'].includes(role) ||
    ['hr_admin', 'super_admin'].includes((profile as { secondary_role?: string } | null)?.secondary_role ?? '');
  const payslipsReleasedAt = run.payslips_distributed_at ? new Date(run.payslips_distributed_at) : null;

  const filtered = lines.filter(l => {
    if (!search) return true;
    const name = `${l.profile?.first_name ?? ''} ${l.profile?.last_name ?? ''}`.toLowerCase();
    return name.includes(search.toLowerCase()) || (l.employee_id ?? '').toLowerCase().includes(search.toLowerCase());
  });

  const hasVariablePay = lines.some(l =>
    (l.overtime_amount || 0) > 0 || (l.bonus_amount || 0) > 0 ||
    (l.acting_allowance || 0) > 0 || (l.per_diem_amount || 0) > 0
  );

  const today = new Date().toISOString().split('T')[0];
  const pendingRemittances  = remittances.filter(r => r.status !== 'remitted');
  const remittedRemittances = remittances.filter(r => r.status === 'remitted');

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/payroll/dashboard')} style={{ marginBottom: '0.5rem' }}>
              ← Back
            </button>
            <h1 style={{ margin: '0 0 0.35rem' }}>
              {monthName(run.pay_period_month)} {run.pay_period_year} Payroll
              {run.revision_number > 1 && (
                <span style={{ marginLeft: 8, fontSize: '0.8rem', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 4 }}>
                  Rev {run.revision_number}
                </span>
              )}
            </h1>
            <span className="status-badge" style={{ background: st.color + '22', color: st.color, border: `1px solid ${st.color}44` }}>
              {st.label}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Recompute (draft only) */}
            {isDraft && canAct && (
              <button className="btn btn-outline" onClick={handleRecompute} disabled={actionLoading}>
                {actionLoading ? 'Computing…' : '↻ Recompute'}
              </button>
            )}

            {/* Bank file download (approved / paid) */}
            {isApprovedOrPaid && (
              <button className="btn btn-outline" onClick={handleDownloadBankFile}>
                ⬇ Bank File
              </button>
            )}

            {/* Create revision (rejected) */}
            {run.status === 'rejected' && canAct && (
              <button className="btn btn-outline" style={{ color: '#f59e0b', borderColor: '#f59e0b' }}
                onClick={() => setShowRevisionModal(true)}>
                ↩ Create Revision
              </button>
            )}

            {/* Approval / rejection */}
            {flow && canAct && (
              <button className="btn btn-primary" onClick={() => setConfirmAction(flow.next)} disabled={actionLoading}>
                {flow.nextLabel}
              </button>
            )}
            {flow?.reject && canAct && flow.rejectLabel && (
              <button className="btn btn-outline" style={{ color: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => setConfirmAction(flow.reject!)} disabled={actionLoading}>
                {flow.rejectLabel}
              </button>
            )}

            <NotificationBell />
          </div>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* ── Payslip release (approved / paid) ── */}
        {isApprovedOrPaid && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
            background: payslipsReleasedAt ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${payslipsReleasedAt ? '#a7f3d0' : '#fde68a'}`,
            borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.875rem',
          }}>
            <div style={{ color: payslipsReleasedAt ? '#065f46' : '#92400e' }}>
              {payslipsReleasedAt
                ? <><strong>Payslips released</strong> on {payslipsReleasedAt.toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })} — staff can view them under My Payslips.</>
                : <><strong>Payslips not yet released</strong> — staff cannot see this month's payslips until you release them.</>}
            </div>
            {isHrAdmin && (
              payslipsReleasedAt ? (
                <button className="btn btn-sm btn-outline" onClick={() => handleSetPayslipsReleased(false)} disabled={actionLoading}>
                  Withdraw payslips
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => handleSetPayslipsReleased(true)} disabled={actionLoading}>
                  📨 Release payslips to staff
                </button>
              )
            )}
          </div>
        )}

        {/* ── Totals summary ── */}
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Employees',    value: lines.length,                                              mono: false },
            { label: 'Gross Pay',    value: run.total_gross              ? formatKES(run.total_gross)              : '—', mono: true },
            { label: 'PAYE',         value: run.total_paye               ? formatKES(run.total_paye)               : '—', mono: true },
            { label: 'NSSF (Emp)',   value: run.total_nssf_employee      ? formatKES(run.total_nssf_employee)      : '—', mono: true },
            { label: 'SHA/SHIF',     value: run.total_sha                ? formatKES(run.total_sha)                : '—', mono: true },
            { label: 'Housing Levy', value: run.total_housing_levy_employee ? formatKES(run.total_housing_levy_employee) : '—', mono: true },
            { label: 'Net Pay',      value: run.total_net                ? formatKES(run.total_net)                : '—', mono: true },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '0.75rem' }}>
              <div className="stat-label" style={{ fontSize: '0.75rem' }}>{s.label}</div>
              <div className="stat-value" style={{ fontSize: s.mono ? '1rem' : '1.5rem' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Variable pay hint (draft mode) ── */}
        {isDraft && (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#1e40af' }}>
            <strong>SOP Day 24 — Data Input:</strong> Click <em>Edit Variable Pay</em> on any employee row to enter overtime, bonuses, acting allowances, per diems or court deductions.
            These are applied on top of fixed salary. When done, submit for HR Review.
          </div>
        )}

        {/* ── Employee payroll lines ── */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <h2 className="card-title" style={{ flex: 1 }}>Employee Lines ({lines.length})</h2>
            <input className="form-control" style={{ maxWidth: 240 }} placeholder="Search employee…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Basic</th>
                  {hasVariablePay && <th>Variable</th>}
                  <th>Gross</th>
                  <th>NSSF</th>
                  <th>SHA</th>
                  <th>Housing</th>
                  <th>PAYE</th>
                  <th>Net Pay</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center', color: '#94a3b8' }}>No employees found</td></tr>
                )}
                {filtered.map(line => {
                  const variableTotal = (line.overtime_amount || 0) + (line.bonus_amount || 0) +
                    (line.acting_allowance || 0) + (line.per_diem_amount || 0);
                  return (
                    <tr key={line.id} style={line.is_override ? { background: 'var(--warning-bg, #fef3c7)' } : undefined}>
                      <td>
                        <div>
                          <strong>{line.profile?.first_name} {line.profile?.last_name}</strong>
                          {line.is_override && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: '#f59e0b' }}>✎ Override</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{line.employee_id}</div>
                        {(line.leave_days > 0 || line.ooo_days > 0) && (
                          <div style={{ fontSize: '0.7rem', color: '#f59e0b' }}>
                            {line.leave_days > 0 && `${line.leave_days}d leave `}
                            {line.ooo_days > 0 && `${line.ooo_days}d OOO`}
                          </div>
                        )}
                      </td>
                      <td>{formatKES(line.basic_salary)}</td>
                      {hasVariablePay && (
                        <td style={{ color: variableTotal > 0 ? '#059669' : '#94a3b8', fontSize: '0.85rem' }}>
                          {variableTotal > 0 ? `+${formatKES(variableTotal)}` : '—'}
                        </td>
                      )}
                      <td>{formatKES(line.gross_pay)}</td>
                      <td>{formatKES(line.nssf_tier1 + line.nssf_tier2)}</td>
                      <td>{formatKES(line.sha_amount)}</td>
                      <td>{formatKES(line.housing_levy_employee)}</td>
                      <td>{formatKES(line.paye_amount)}</td>
                      <td><strong>{formatKES(line.net_pay)}</strong></td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          {isDraft && (
                            <button className="btn btn-sm btn-outline" onClick={() => setEditVarPayLine(line)}>
                              Variable Pay
                            </button>
                          )}
                          <button className="btn btn-sm btn-outline"
                            onClick={() => openPayslip(line, run)}
                            title="View payslip">
                            Payslip
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Remittance tracking (approved / paid) ── */}
        {isApprovedOrPaid && remittances.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <h2 className="card-title">Statutory Remittances</h2>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.25rem 0 0' }}>
                SOP Step 6: All statutory deductions must be remitted by the 9th of the following month.
              </p>
            </div>
            <div style={{ padding: '0 1rem 1rem' }}>
              {pendingRemittances.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.85rem', color: '#64748b', margin: '1rem 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '0.75rem' }}>
                    {pendingRemittances.map(r => {
                      const isOverdue = r.due_date < today;
                      return (
                        <div key={r.id} style={{
                          border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
                          borderRadius: 8,
                          padding: '0.875rem',
                          background: isOverdue ? '#fff1f2' : '#fff',
                        }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{REMITTANCE_LABELS[r.remittance_type]}</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{formatKES(r.amount)}</div>
                          <div style={{ fontSize: '0.75rem', color: isOverdue ? '#dc2626' : '#64748b' }}>
                            Due: {r.due_date} {isOverdue && '⚠ OVERDUE'}
                          </div>
                          {(role === 'finance' || role === 'hr_admin' || role === 'super_admin') && (
                            <button className="btn btn-sm btn-primary" style={{ marginTop: '0.5rem', width: '100%' }}
                              onClick={() => setMarkRemittance(r)}>
                              Mark as Remitted
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {remittedRemittances.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.85rem', color: '#64748b', margin: '1rem 0 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remitted</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '0.75rem' }}>
                    {remittedRemittances.map(r => (
                      <div key={r.id} style={{ border: '1px solid #bbf7d0', borderRadius: 8, padding: '0.875rem', background: '#f0fdf4' }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{REMITTANCE_LABELS[r.remittance_type]}</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#166534', marginBottom: 4 }}>{formatKES(r.amount)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>✓ Remitted {r.remitted_at ? new Date(r.remitted_at).toLocaleDateString('en-KE') : ''}</div>
                        {r.reference_number && (
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Ref: {r.reference_number}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Employer cost summary ── */}
        {run.total_nssf_employer && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <strong>Employer Contributions (not deducted from employees):</strong>&nbsp;
            NSSF Employer: {run.total_nssf_employer ? formatKES(run.total_nssf_employer) : '—'}&nbsp;|&nbsp;
            Housing Levy Employer: {run.total_housing_levy_employer ? formatKES(run.total_housing_levy_employer) : '—'}
          </div>
        )}

      </div>

      {/* ── Variable pay edit modal ── */}
      {editVarPayLine && (
        <VariablePayModal
          line={editVarPayLine}
          onSave={handleSaveVariablePay}
          onClose={() => setEditVarPayLine(null)}
        />
      )}

      {/* ── Remittance mark-done modal ── */}
      {markRemittance && (
        <RemittanceModal
          remittance={markRemittance}
          onSave={handleMarkRemittance}
          onClose={() => setMarkRemittance(null)}
        />
      )}

      {/* ── Revision modal ── */}
      {showRevisionModal && (
        <RevisionModal
          onConfirm={handleCreateRevision}
          onClose={() => setShowRevisionModal(false)}
        />
      )}

      {/* ── Approval confirm modal ── */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="modal-title">Confirm Action</h3>
            <p style={{ marginBottom: '1rem', color: '#64748b' }}>
              {confirmAction.includes('reject') ? 'Please provide a reason for rejection.' : 'Add optional comments before proceeding.'}
            </p>
            <textarea className="form-control" rows={3} placeholder="Comments (optional)"
              value={comments} onChange={e => setComments(e.target.value)}
              style={{ marginBottom: '1rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button
                className={`btn ${confirmAction.includes('reject') ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleAction(confirmAction)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
