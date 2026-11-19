import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPayrollRun, computeAndSaveRun } from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

export function PayrollRunNew() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const months = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const run = await createPayrollRun(year, month, notes || undefined);
      // Immediately compute lines
      await computeAndSaveRun(run.id);
      navigate(`/payroll/runs/${run.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>New Payroll Run</h1>
          <p style={{ color: '#64748b', margin: 0 }}>Select the pay period to compute</p>
        </div>
        <NotificationBell />
      </div>
      <div style={{ maxWidth: 520 }}>

      <div className="card">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label className="form-label">Year</label>
            <select
              className="form-control"
              value={year}
              onChange={e => setYear(Number(e.target.value))}
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Month</label>
            <select
              className="form-control"
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <textarea
              className="form-control"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes for this payroll run…"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={() => navigate('/payroll/dashboard')}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>
              {loading ? 'Computing…' : 'Create & Compute'}
            </button>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
