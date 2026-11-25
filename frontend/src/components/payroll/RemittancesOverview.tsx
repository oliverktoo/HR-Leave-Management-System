import { errorMessage } from '../../utils/errorMessage';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { markRemittanceDone, formatKES, monthName, PayrollRemittance } from '../../services/payrollService';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const REMITTANCE_LABELS: Record<string, string> = {
  paye:         'PAYE (KRA iTax)',
  nssf:         'NSSF',
  shif:         'SHIF / SHA',
  housing_levy: 'Housing Levy',
};

const PORTAL_LINKS: Record<string, string> = {
  paye:         'https://itax.kra.go.ke',
  nssf:         'https://online.nssfkenya.co.ke',
  shif:         'https://portal.sha.go.ke',
  housing_levy: 'https://itax.kra.go.ke',
};

interface RemittanceWithRun extends PayrollRemittance {
  run_year?: number;
  run_month?: number;
}

interface MarkDoneModal {
  remittance: RemittanceWithRun;
  ref: string;
  notes: string;
}

export function RemittancesOverview() {
  const navigate = useNavigate();
  const [remittances, setRemittances] = useState<RemittanceWithRun[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [modal,       setModal]       = useState<MarkDoneModal | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');
  const [filterType,  setFilterType]  = useState('');
  const [showAll,     setShowAll]     = useState(false);

  const today = new Date().toISOString().split('T')[0];

  async function load() {
    setLoading(true);
    try {
      // Get pending + recently remitted
      const { data, error: err } = await supabase
        .from('payroll_remittances')
        .select('*, payroll_runs(pay_period_year, pay_period_month)')
        .order('due_date', { ascending: true });
      if (err) throw err;

      const rows: RemittanceWithRun[] = (data || []).map((r: any) => ({
        ...r,
        run_year:  r.payroll_runs?.pay_period_year,
        run_month: r.payroll_runs?.pay_period_month,
        // Mark overdue pending ones
        status: r.status === 'pending' && r.due_date < today ? 'late' : r.status,
      }));
      setRemittances(rows);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleMark() {
    if (!modal) return;
    if (!modal.ref.trim()) { setSaveError('Reference number is required'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await markRemittanceDone(modal.remittance.id, modal.ref.trim(), modal.notes);
      setModal(null);
      await load();
    } catch (e: unknown) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const pending   = remittances.filter(r => r.status !== 'remitted');
  const remitted  = remittances.filter(r => r.status === 'remitted');
  const overdue   = remittances.filter(r => r.status === 'late');

  const displayPending = pending.filter(r => filterType ? r.remittance_type === filterType : true);
  const displayRemitted = (showAll ? remitted : remitted.slice(0, 10))
    .filter(r => filterType ? r.remittance_type === filterType : true);

  const totalPending = pending.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/payroll/dashboard')} style={{ marginBottom: '0.5rem' }}>
              ← Back
            </button>
            <h1 style={{ margin: '0 0 0.25rem' }}>Statutory Remittances</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>
              SOP Step 6 — PAYE, NSSF, SHIF and Housing Levy must be remitted by the 9th of each month
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total Pending',  value: formatKES(totalPending), color: overdue.length > 0 ? '#ef4444' : '#f59e0b', sub: `${pending.length} items` },
            { label: 'Overdue',        value: overdue.length,          color: '#ef4444', sub: 'Past 9th deadline' },
            { label: 'Remitted',       value: remitted.length,         color: '#10b981', sub: 'This year' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '0.875rem', borderLeft: `4px solid ${s.color}` }}>
              <div className="stat-label" style={{ fontSize: '0.75rem' }}>{s.label}</div>
              <div className="stat-value" style={{ fontSize: '1.4rem', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {overdue.length > 0 && (
          <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' }}>
            <strong>⚠ Overdue Remittances:</strong> {overdue.length} payment{overdue.length > 1 ? 's are' : ' is'} past the 9th deadline.
            Late remittances attract penalties from KRA/NSSF/SHA. Remit immediately and record the reference numbers.
          </div>
        )}

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        {/* Filter */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <select className="form-control" style={{ maxWidth: 200 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">All types</option>
            {Object.entries(REMITTANCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Pending */}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <>
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div className="card-header">
                <h2 className="card-title">Pending ({displayPending.length})</h2>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pay Period</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayPending.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: '#10b981' }}>✓ No pending remittances</td></tr>
                    )}
                    {displayPending.map(r => {
                      const isOverdue = r.status === 'late';
                      return (
                        <tr key={r.id} style={isOverdue ? { background: '#fff1f2' } : undefined}>
                          <td>
                            {r.run_month && r.run_year
                              ? `${monthName(r.run_month)} ${r.run_year}`
                              : '—'}
                          </td>
                          <td><strong>{REMITTANCE_LABELS[r.remittance_type]}</strong></td>
                          <td><strong>{formatKES(r.amount)}</strong></td>
                          <td style={{ color: isOverdue ? '#dc2626' : '#374151', fontWeight: isOverdue ? 700 : 400 }}>
                            {r.due_date} {isOverdue && '⚠'}
                          </td>
                          <td>
                            <span style={{
                              background: isOverdue ? '#fee2e2' : '#fef3c7',
                              color: isOverdue ? '#dc2626' : '#92400e',
                              border: `1px solid ${isOverdue ? '#fca5a5' : '#fcd34d'}`,
                              borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600,
                            }}>
                              {isOverdue ? 'Overdue' : 'Pending'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button className="btn btn-sm btn-primary"
                                onClick={() => setModal({ remittance: r, ref: '', notes: '' })}>
                                Mark Remitted
                              </button>
                              <a className="btn btn-sm btn-outline" href={PORTAL_LINKS[r.remittance_type]} target="_blank" rel="noreferrer">
                                Portal ↗
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Remitted history */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
                <h2 className="card-title" style={{ flex: 1 }}>Remitted ({remitted.length})</h2>
                {remitted.length > 10 && (
                  <button className="btn btn-sm btn-outline" onClick={() => setShowAll(v => !v)}>
                    {showAll ? 'Show less' : 'Show all'}
                  </button>
                )}
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pay Period</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Remitted On</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRemitted.length === 0 && (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8' }}>No remittances recorded yet</td></tr>
                    )}
                    {displayRemitted.map(r => (
                      <tr key={r.id}>
                        <td>{r.run_month && r.run_year ? `${monthName(r.run_month)} ${r.run_year}` : '—'}</td>
                        <td>{REMITTANCE_LABELS[r.remittance_type]}</td>
                        <td>{formatKES(r.amount)}</td>
                        <td style={{ color: '#10b981' }}>
                          ✓ {r.remitted_at ? new Date(r.remitted_at).toLocaleDateString('en-KE') : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.reference_number || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Mark remitted modal */}
        {modal && (
          <div className="modal-overlay" onClick={() => setModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <h3 className="modal-title">
                Mark Remitted — {REMITTANCE_LABELS[modal.remittance.remittance_type]}
              </h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {modal.remittance.run_month && modal.remittance.run_year
                  ? `${monthName(modal.remittance.run_month)} ${modal.remittance.run_year} · `
                  : ''}
                Amount: <strong>{formatKES(modal.remittance.amount)}</strong> · Due: {modal.remittance.due_date}
              </p>
              <div className="form-group">
                <label className="form-label">Portal / iTax Reference Number *</label>
                <input type="text" className="form-control" placeholder="e.g. PRN12345678"
                  value={modal.ref}
                  onChange={e => setModal(m => m ? { ...m, ref: e.target.value } : null)} />
              </div>
              <div className="form-group" style={{ marginTop: '0.75rem' }}>
                <label className="form-label">Notes (optional)</label>
                <textarea className="form-control" rows={2}
                  value={modal.notes}
                  onChange={e => setModal(m => m ? { ...m, notes: e.target.value } : null)} />
              </div>
              {saveError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{saveError}</div>}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn btn-outline" onClick={() => { setModal(null); setSaveError(''); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleMark} disabled={saving}>
                  {saving ? 'Saving…' : 'Confirm Remittance'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
