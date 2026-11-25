// Review one employee's unexplained absences and decide how many days are unpaid.
// Nothing is deducted automatically: missing clock-ins can be forgotten taps,
// phone trouble or field work that was not logged.
import { errorMessage } from '../../utils/errorMessage';
import { useState } from 'react';
import { setAttendanceUnpaidDays, type PayrollLine } from '../../services/payrollService';

interface Props {
  line: PayrollLine;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}

const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });

export function AttendanceModal({ line, canEdit, onSaved, onClose }: Props) {
  const unexplained = Number(line.att_unexplained_days) || 0;
  const [days, setDays] = useState<number>(Number(line.att_unpaid_days) || 0);
  const [reason, setReason] = useState(line.att_unpaid_reason ?? '');
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  const name = `${line.profile?.first_name ?? ''} ${line.profile?.last_name ?? ''}`.trim() || line.employee_id;
  const dates = (line.att_unexplained_dates ?? []).map(d => String(d).slice(0, 10));
  const changed = days !== (Number(line.att_unpaid_days) || 0) || (days > 0 && reason.trim() !== (line.att_unpaid_reason ?? ''));

  async function save() {
    if (days > 0 && !reason.trim()) { setErr('Give a reason — it is kept in the payroll audit log.'); return; }
    setWorking(true);
    setErr('');
    try {
      await setAttendanceUnpaidDays(line.id, days, reason.trim());
      await onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(errorMessage(e));
      setWorking(false);
    }
  }

  const stat = (label: string, value: string) => (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 className="modal-title">Attendance — {name}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
          {stat('Days present', `${Number(line.att_present_days) || 0} / ${Number(line.att_scheduled_days) || 0}`)}
          {stat('Hours clocked', `${Math.round((Number(line.att_hours_clocked) || 0) * 10) / 10} / ${Math.round((Number(line.att_hours_expected) || 0) * 10) / 10}`)}
          {stat('Unexplained', `${unexplained} day${unexplained === 1 ? '' : 's'}`)}
          {stat('Days paid', `${line.days_worked ?? '—'}`)}
        </div>

        {unexplained > 0 ? (
          <>
            <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 0.5rem' }}>
              Scheduled working days with no clock-in, no approved leave, no OOO and no public holiday:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '1rem' }}>
              {dates.map(d => (
                <span key={d} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: '2px 8px', fontSize: '0.8rem' }}>
                  {fmtDate(d)}
                </span>
              ))}
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 1rem' }}>
              Check with the employee or their supervisor first: a missing clock-in may be a forgotten tap, phone trouble or
              unlogged field work. Pay changes only if you mark days unpaid below.
            </p>

            {canEdit ? (
              <>
                <div className="form-group">
                  <label className="form-label">Days to treat as unpaid absence</label>
                  <input className="form-control" type="number" min={0} max={unexplained} step={1} value={days}
                    style={{ maxWidth: 120 }}
                    onChange={e => setDays(Math.max(0, Math.min(unexplained, Math.floor(Number(e.target.value) || 0))))} />
                </div>
                {days > 0 && (
                  <div className="form-group">
                    <label className="form-label">Reason (required)</label>
                    <textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)}
                      placeholder="e.g. Absent without leave on 11–12 Mar, confirmed with HOD" />
                  </div>
                )}
              </>
            ) : (
              (Number(line.att_unpaid_days) || 0) > 0 && (
                <p style={{ fontSize: '0.85rem' }}>
                  <strong>{line.att_unpaid_days}</strong> day(s) marked unpaid: {line.att_unpaid_reason}
                </p>
              )
            )}
          </>
        ) : (
          <p style={{ fontSize: '0.85rem', color: '#065f46' }}>No unexplained absences this month.</p>
        )}

        {err && <div className="error-message" style={{ marginTop: '0.75rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={working}>Close</button>
          {canEdit && unexplained > 0 && (
            <button className="btn btn-primary" onClick={save} disabled={working || !changed}>
              {working ? 'Saving…' : 'Save & recompute'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
