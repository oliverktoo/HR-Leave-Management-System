import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getPayrollRuns,
  PayrollRun,
  formatKES,
  monthName,
} from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:           { label: 'Draft',             color: '#94a3b8' },
  pending_hr:      { label: 'Pending HR',         color: '#f59e0b' },
  pending_finance: { label: 'Pending Finance',    color: '#3b82f6' },
  pending_ceo:     { label: 'Pending CEO',        color: '#8b5cf6' },
  approved:        { label: 'Approved',           color: '#10b981' },
  rejected:        { label: 'Rejected',           color: '#ef4444' },
  paid:            { label: 'Paid',               color: '#059669' },
};

export function PayrollDashboard() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPayrollRuns()
      .then(setRuns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const latest = runs[0];

  const statCards = [
    { label: 'Total Runs', value: runs.length, icon: '📋' },
    { label: 'Pending Approval', value: runs.filter(r => ['pending_hr','pending_finance','pending_ceo'].includes(r.status)).length, icon: '⏳' },
    { label: 'Paid This Year', value: runs.filter(r => r.status === 'paid' && r.pay_period_year === new Date().getFullYear()).length, icon: '✅' },
    { label: 'Latest Net Pay', value: latest?.total_net ? formatKES(latest.total_net) : '—', icon: '💰' },
  ];

  if (loading) return <div className="loading-spinner">Loading payroll data…</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>Payroll</h1>
          <p style={{ color: '#64748b', margin: 0 }}>Kenya-compliant payroll processing</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/payroll/runs/new')}
          >
            + New Payroll Run
          </button>
          <NotificationBell />
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {statCards.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent runs table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Payroll Runs</h2>
        </div>
        {runs.length === 0 ? (
          <div className="empty-state">
            <p>No payroll runs yet. Create the first one to get started.</p>
            <button className="btn btn-primary" onClick={() => navigate('/payroll/runs/new')}>
              Create First Run
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Gross Pay</th>
                  <th>Total PAYE</th>
                  <th>Net Pay</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const st = STATUS_LABELS[run.status] ?? { label: run.status, color: '#94a3b8' };
                  return (
                    <tr key={run.id}>
                      <td><strong>{monthName(run.pay_period_month)} {run.pay_period_year}</strong></td>
                      <td>
                        <span
                          className="status-badge"
                          style={{ background: st.color + '22', color: st.color, border: `1px solid ${st.color}44` }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td>{run.total_gross ? formatKES(run.total_gross) : '—'}</td>
                      <td>{run.total_paye ? formatKES(run.total_paye) : '—'}</td>
                      <td><strong>{run.total_net ? formatKES(run.total_net) : '—'}</strong></td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => navigate(`/payroll/runs/${run.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
