import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPayrollRuns,
  getPayrollLines,
  advancePayrollRunStatus,
  PayrollRun,
  PayrollLine,
  formatKES,
  monthName,
  ApprovalAction,
} from '../../services/payrollService';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

// Which statuses each role sees in their inbox
const ROLE_QUEUE: Record<string, { status: string; action: ApprovalAction; rejectAction: ApprovalAction; title: string }> = {
  hr_admin:    { status: 'pending_hr',      action: 'approve_hr',      rejectAction: 'reject_hr',      title: 'HR Review Queue' },
  super_admin: { status: 'pending_hr',      action: 'approve_hr',      rejectAction: 'reject_hr',      title: 'HR Review Queue' },
  finance:     { status: 'pending_finance', action: 'approve_finance', rejectAction: 'reject_finance', title: 'Finance Review Queue' },
  ceo:         { status: 'pending_ceo',     action: 'approve_ceo',     rejectAction: 'reject_ceo',     title: 'CEO Approval Queue' },
};

const STATUS_COLORS: Record<string, string> = {
  pending_hr:      '#f59e0b',
  pending_finance: '#3b82f6',
  pending_ceo:     '#8b5cf6',
  approved:        '#10b981',
  rejected:        '#ef4444',
  paid:            '#059669',
};

export function PayrollApprovals() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role ?? '';

  const queue = ROLE_QUEUE[role];

  const [pendingRuns, setPendingRuns] = useState<PayrollRun[]>([]);
  const [recentRuns, setRecentRuns]   = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Detail panel
  const [selected, setSelected] = useState<PayrollRun | null>(null);
  const [lines, setLines]       = useState<PayrollLine[]>([]);
  const [lineLoading, setLineLoading] = useState(false);

  // Confirm modal
  const [confirmAction, setConfirmAction] = useState<ApprovalAction | null>(null);
  const [comments, setComments] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getPayrollRuns();
      if (queue) {
        setPendingRuns(all.filter(r => r.status === queue.status));
      }
      // Recent: approved/paid runs (last 6)
      setRecentRuns(
        all.filter(r => r.status === 'approved' || r.status === 'paid').slice(0, 6)
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [queue]);

  useEffect(() => { load(); }, [load]);

  async function openRun(run: PayrollRun) {
    setSelected(run);
    setLineLoading(true);
    try {
      const ls = await getPayrollLines(run.id);
      setLines(ls);
    } catch {
      setLines([]);
    } finally {
      setLineLoading(false);
    }
  }

  async function handleAction(action: ApprovalAction) {
    if (!selected) return;
    setActionLoading(true);
    setError('');
    try {
      await advancePayrollRunStatus(selected.id, action, comments || undefined);
      setConfirmAction(null);
      setSelected(null);
      setComments('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  }

  if (!queue) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h1>Payroll Approvals</h1>
            <NotificationBell />
          </div>
          <div className="empty-state">
            <p>You don't have payroll approval responsibilities assigned to your role.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="loading-spinner">Loading…</div>;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>{queue.title}</h1>
          <p style={{ color: '#64748b', margin: 0 }}>Review and action payroll runs awaiting your approval</p>
        </div>
        <NotificationBell />
      </div>

      {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '340px 1fr' : '1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left panel: pending + recent */}
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div className="card-header">
              <h2 className="card-title">
                Pending Approval
                {pendingRuns.length > 0 && (
                  <span style={{
                    marginLeft: 8, background: '#ef4444', color: '#fff',
                    borderRadius: '9999px', padding: '1px 8px', fontSize: '0.75rem'
                  }}>
                    {pendingRuns.length}
                  </span>
                )}
              </h2>
            </div>
            {pendingRuns.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8' }}>
                No runs awaiting your approval
              </div>
            ) : (
              pendingRuns.map(run => (
                <RunCard
                  key={run.id}
                  run={run}
                  isSelected={selected?.id === run.id}
                  onClick={() => openRun(run)}
                />
              ))
            )}
          </div>

          {recentRuns.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Recently Approved</h2>
              </div>
              {recentRuns.map(run => (
                <RunCard
                  key={run.id}
                  run={run}
                  isSelected={selected?.id === run.id}
                  onClick={() => openRun(run)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right panel: run detail */}
        {selected && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 className="card-title">
                  {monthName(selected.pay_period_month)} {selected.pay_period_year}
                </h2>
                <StatusBadge status={selected.status} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => navigate(`/payroll/runs/${selected.id}`)}
                >
                  Full View
                </button>
                {selected.status === queue.status && (
                  <>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setConfirmAction(queue.action)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ color: '#ef4444', borderColor: '#ef4444' }}
                      onClick={() => setConfirmAction(queue.rejectAction)}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Totals strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color,#e2e8f0)' }}>
              {[
                { label: 'Employees', value: String(lines.length || '—') },
                { label: 'Gross Pay', value: selected.total_gross ? formatKES(selected.total_gross) : '—' },
                { label: 'PAYE',      value: selected.total_paye  ? formatKES(selected.total_paye)  : '—' },
                { label: 'Net Pay',   value: selected.total_net   ? formatKES(selected.total_net)   : '—' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontWeight: 600 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Approval trail */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color,#e2e8f0)', fontSize: '0.8rem' }}>
              <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Approval Trail</strong>
              <Trail label="Prepared"   date={selected.prepared_at}       comments={null} />
              <Trail label="HR"         date={selected.hr_approved_at}    comments={selected.hr_comments} />
              <Trail label="Finance"    date={selected.finance_approved_at} comments={selected.finance_comments} />
              <Trail label="CEO"        date={selected.ceo_approved_at}   comments={selected.ceo_comments} />
            </div>

            {/* Employee lines */}
            {lineLoading ? (
              <div className="loading-spinner" style={{ padding: '2rem' }}>Loading lines…</div>
            ) : (
              <div className="table-container">
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Gross</th>
                      <th>PAYE</th>
                      <th>Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td>
                          <div>{l.profile?.first_name} {l.profile?.last_name}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{l.employee_id}</div>
                        </td>
                        <td>{formatKES(l.gross_pay)}</td>
                        <td>{formatKES(l.paye_amount)}</td>
                        <td><strong>{formatKES(l.net_pay)}</strong></td>
                      </tr>
                    ))}
                    {lines.length === 0 && (
                      <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>No lines loaded</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      {confirmAction && selected && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 className="modal-title">
              {confirmAction.includes('reject') ? 'Reject Payroll Run' : 'Approve Payroll Run'}
            </h3>
            <p style={{ color: '#64748b', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              {monthName(selected.pay_period_month)} {selected.pay_period_year}
              {selected.total_net && ` — Net Pay: ${formatKES(selected.total_net)}`}
            </p>
            <div className="form-group">
              <label className="form-label">
                {confirmAction.includes('reject') ? 'Reason for rejection *' : 'Comments (optional)'}
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder={confirmAction.includes('reject') ? 'State why this run is being rejected…' : 'Any notes…'}
              />
            </div>
            {error && <div className="error-message" style={{ marginBottom: '0.75rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setConfirmAction(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className={`btn ${confirmAction.includes('reject') ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleAction(confirmAction)}
                disabled={actionLoading || (confirmAction.includes('reject') && !comments.trim())}
              >
                {actionLoading ? 'Processing…' : confirmAction.includes('reject') ? 'Reject' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RunCard({ run, isSelected, onClick }: { run: PayrollRun; isSelected: boolean; onClick: () => void }) {
  const color = STATUS_COLORS[run.status] ?? '#94a3b8';
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', padding: '0.75rem 1rem',
        textAlign: 'left', background: isSelected ? 'var(--primary-light,#eff6ff)' : 'transparent',
        borderBottom: '1px solid var(--border-color,#e2e8f0)', border: 'none',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{monthName(run.pay_period_month)} {run.pay_period_year}</strong>
        <span style={{ fontSize: '0.7rem', color, background: color + '18', padding: '2px 8px', borderRadius: 9999 }}>
          {run.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>
      {run.total_net && (
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
          Net Pay: {formatKES(run.total_net)}
        </div>
      )}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#94a3b8';
  return (
    <span style={{
      fontSize: '0.72rem', color, background: color + '18',
      padding: '2px 8px', borderRadius: 9999, border: `1px solid ${color}40`,
    }}>
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}

function Trail({ label, date, comments }: { label: string; date: string | null; comments: string | null }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.2rem', color: date ? '#1e293b' : '#94a3b8' }}>
      <span style={{ width: 56, flexShrink: 0 }}>{label}</span>
      <span>{date ? new Date(date).toLocaleDateString('en-KE') : '—'}</span>
      {comments && <span style={{ color: '#64748b', fontStyle: 'italic' }}>"{comments}"</span>}
    </div>
  );
}
