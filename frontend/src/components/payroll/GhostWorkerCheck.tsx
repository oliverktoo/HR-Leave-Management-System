import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getGhostWorkerCheck, formatKES } from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

interface GhostRow {
  id: string;
  employee_id: string;
  full_name: string;
  hr_active: boolean;
  payroll_active: boolean;
  basic_salary: number;
  payroll_status: 'ok' | 'ghost_risk' | 'excluded' | 'inactive';
}

const STATUS_CONFIG = {
  ghost_risk: { label: 'Ghost Risk',  color: '#ef4444', bg: '#fff1f2', desc: 'Inactive in HR but still on payroll — investigate immediately' },
  excluded:   { label: 'Excluded',    color: '#f59e0b', bg: '#fffbeb', desc: 'Active in HR but excluded from payroll' },
  ok:         { label: 'OK',          color: '#10b981', bg: '#f0fdf4', desc: 'Active in HR and on payroll' },
  inactive:   { label: 'Inactive',    color: '#94a3b8', bg: '#f8fafc', desc: 'Inactive in both HR and payroll' },
};

export function GhostWorkerCheck() {
  const navigate = useNavigate();
  const [rows,    setRows]    = useState<GhostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [filter,  setFilter]  = useState<string>('all');
  const [search,  setSearch]  = useState('');

  useEffect(() => {
    getGhostWorkerCheck()
      .then(data => setRows(data as GhostRow[]))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = rows.filter(r => {
    if (filter !== 'all' && r.payroll_status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.full_name.toLowerCase().includes(q) || (r.employee_id || '').toLowerCase().includes(q);
    }
    return true;
  });

  const ghostCount    = rows.filter(r => r.payroll_status === 'ghost_risk').length;
  const excludedCount = rows.filter(r => r.payroll_status === 'excluded').length;
  const okCount       = rows.filter(r => r.payroll_status === 'ok').length;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/payroll/dashboard')} style={{ marginBottom: '0.5rem' }}>
              ← Back
            </button>
            <h1 style={{ margin: '0 0 0.25rem' }}>Ghost Worker Check</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>
              SOP 9.5 — Monthly cross-check of HR active status vs payroll active flag
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total on Payroll', value: okCount,       color: '#10b981' },
            { label: 'Ghost Risk',       value: ghostCount,    color: '#ef4444' },
            { label: 'Excluded',         value: excludedCount, color: '#f59e0b' },
            { label: 'Total Checked',    value: rows.length,   color: '#6366f1' },
          ].map(s => (
            <div key={s.label} className="stat-card" style={{ padding: '0.875rem', borderLeft: `4px solid ${s.color}` }}>
              <div className="stat-label" style={{ fontSize: '0.75rem' }}>{s.label}</div>
              <div className="stat-value" style={{ fontSize: '1.75rem', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {ghostCount > 0 && (
          <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem' }}>
            <strong>⚠ Action Required:</strong> {ghostCount} employee{ghostCount > 1 ? 's are' : ' is'} inactive in HR but still drawing salary.
            These must be removed from payroll before the next run.
          </div>
        )}

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 className="card-title" style={{ flex: 1 }}>Employee Payroll Status</h2>
            <select className="form-control" style={{ maxWidth: 160 }} value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="ghost_risk">Ghost Risk</option>
              <option value="excluded">Excluded</option>
              <option value="ok">OK</option>
              <option value="inactive">Inactive</option>
            </select>
            <input className="form-control" style={{ maxWidth: 220 }} placeholder="Search employee…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>HR Active</th>
                    <th>Payroll Active</th>
                    <th>Basic Salary</th>
                    <th>Status</th>
                    <th>Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94a3b8' }}>No records found</td></tr>
                  )}
                  {filtered.map(row => {
                    const cfg = STATUS_CONFIG[row.payroll_status] ?? STATUS_CONFIG.inactive;
                    return (
                      <tr key={row.id} style={row.payroll_status === 'ghost_risk' ? { background: '#fff1f2' } : undefined}>
                        <td>
                          <div><strong>{row.full_name}</strong></div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{row.employee_id}</div>
                        </td>
                        <td>
                          <span style={{ color: row.hr_active ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {row.hr_active ? '✓ Active' : '✗ Inactive'}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: row.payroll_active ? '#10b981' : '#94a3b8', fontWeight: 600 }}>
                            {row.payroll_active ? '✓ On Payroll' : '✗ Excluded'}
                          </span>
                        </td>
                        <td>{formatKES(row.basic_salary)}</td>
                        <td>
                          <span style={{
                            background: cfg.bg, color: cfg.color,
                            border: `1px solid ${cfg.color}44`,
                            borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600,
                          }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{cfg.desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
          To fix a ghost risk: go to User Management, deactivate the employee, then set payroll_active = false on their profile.
          Run this check again before processing each month's payroll.
        </p>
      </div>
    </div>
  );
}
