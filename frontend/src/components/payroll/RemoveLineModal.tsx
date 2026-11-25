// Remove one employee from a draft payroll run: either for this month only, or
// also switch payroll off for them. Needs a reason; recorded in the audit log.
import { errorMessage } from '../../utils/errorMessage';
import { useState } from 'react';
import { formatKES, removePayrollLine, type PayrollLine } from '../../services/payrollService';

interface Props {
  line: PayrollLine;
  period: string;
  onRemoved: () => Promise<void> | void;
  onClose: () => void;
}

export function RemoveLineModal({ line, period, onRemoved, onClose }: Props) {
  const [mode, setMode] = useState<'month' | 'payroll'>(line.profile?.payroll_active === false ? 'payroll' : 'month');
  const [reason, setReason] = useState('');
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  const name = `${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`.trim() || line.employee_id;
  const hasExtras = (line.arrears_amount || 0) > 0 ||
    ((line.leave_pay || 0) + (line.notice_pay || 0) + (line.severance_pay || 0) +
     (line.gratuity_amount || 0) + (line.compensation_amount || 0)) > 0;

  async function remove() {
    if (!reason.trim()) { setErr('Give a reason — it is kept in the payroll audit log.'); return; }
    setWorking(true);
    setErr('');
    try {
      await removePayrollLine(line.id, line.run_id, reason.trim(), mode === 'payroll');
      await onRemoved();
      onClose();
    } catch (e: unknown) {
      setErr(errorMessage(e));
      setWorking(false);
    }
  }

  const option = (value: 'month' | 'payroll', title: string, detail: string) => (
    <label style={{
      display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer',
      border: `1px solid ${mode === value ? '#93c5fd' : '#e5e7eb'}`, background: mode === value ? '#eff6ff' : '#fff',
      borderRadius: 8, padding: '0.65rem 0.8rem',
    }}>
      <input type="radio" checked={mode === value} onChange={() => setMode(value)} style={{ marginTop: 3 }} />
      <span>
        <strong style={{ display: 'block', fontSize: '0.9rem' }}>{title}</strong>
        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h3 className="modal-title">Remove {name} from {period}</h3>
        <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem' }}>
          {line.employee_id} · net pay {formatKES(line.net_pay)}. Their line is deleted and the run totals are recomputed.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {option('month', 'Skip this month only',
            'They stay on payroll and appear in next month\'s run. You can add them back to this run while it is a draft.')}
          {option('payroll', 'Take off payroll',
            'Also switches payroll off for them, so later runs leave them out until HR turns it back on in Employee Payroll Profiles.')}
        </div>

        {hasExtras && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '0.6rem 0.8rem', fontSize: '0.82rem', marginBottom: '1rem' }}>
            This line has arrears or final dues. They are deleted with it and would need to be entered again.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Reason (required)</label>
          <textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Unpaid leave all month; left the federation on 31 Oct" />
        </div>

        {err && <div className="error-message" style={{ marginTop: '0.75rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={working}>Cancel</button>
          <button className="btn btn-primary" style={{ background: '#dc2626', borderColor: '#dc2626' }}
            onClick={remove} disabled={working}>
            {working ? 'Removing…' : 'Remove from run'}
          </button>
        </div>
      </div>
    </div>
  );
}
