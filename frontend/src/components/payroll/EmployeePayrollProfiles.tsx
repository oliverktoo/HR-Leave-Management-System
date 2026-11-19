import { useState, useEffect } from 'react';
import {
  getEmployeePayrollProfiles,
  updateEmployeePayrollProfile,
  getSalaryGrades,
  EmployeePayrollProfile,
  SalaryGrade,
  formatKES,
} from '../../services/payrollService';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const EMPLOYMENT_TYPES = ['permanent', 'contract', 'casual', 'intern'];

export function EmployeePayrollProfiles() {
  const [employees, setEmployees] = useState<EmployeePayrollProfile[]>([]);
  const [grades, setGrades] = useState<SalaryGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EmployeePayrollProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    Promise.all([getEmployeePayrollProfiles(), getSalaryGrades()])
      .then(([emps, gs]) => { setEmployees(emps); setGrades(gs); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e => {
    const term = search.toLowerCase();
    return (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
      (e.employee_id ?? '').toLowerCase().includes(term)
    );
  });

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setSaveError('');
    try {
      await updateEmployeePayrollProfile(editing.id, {
        kra_pin:              editing.kra_pin,
        nssf_number:          editing.nssf_number,
        sha_number:           editing.sha_number,
        helb_account:         editing.helb_account,
        helb_monthly_amount:  editing.helb_monthly_amount,
        bank_name:            editing.bank_name,
        bank_branch:          editing.bank_branch,
        bank_account_number:  editing.bank_account_number,
        employment_type:      editing.employment_type,
        basic_salary:         editing.basic_salary,
        allowances:           editing.allowances,
        salary_grade:         editing.salary_grade,
        payroll_active:       editing.payroll_active,
      });
      setEmployees(prev => prev.map(e => e.id === editing.id ? { ...e, ...editing } : e));
      setEditing(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof EmployeePayrollProfile>(key: K, val: EmployeePayrollProfile[K]) {
    setEditing(prev => prev ? { ...prev, [key]: val } : null);
  }

  function setAllowance(name: string, value: string) {
    setEditing(prev => {
      if (!prev) return null;
      return { ...prev, allowances: { ...prev.allowances, [name]: Number(value) || 0 } };
    });
  }

  function removeAllowance(name: string) {
    setEditing(prev => {
      if (!prev) return null;
      const next = { ...prev.allowances };
      delete next[name];
      return { ...prev, allowances: next };
    });
  }

  function addAllowanceRow() {
    setEditing(prev => {
      if (!prev) return null;
      const key = `allowance_${Object.keys(prev.allowances).length + 1}`;
      return { ...prev, allowances: { ...prev.allowances, [key]: 0 } };
    });
  }

  if (loading) return <div className="loading-spinner">Loading employee profiles…</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1>Employee Payroll Profiles</h1>
          <p style={{ color: '#64748b', margin: 0 }}>Salary, statutory numbers, and bank details</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <input
            className="form-control"
            style={{ maxWidth: 260 }}
            placeholder="Search employee…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <NotificationBell />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Employment Type</th>
                <th>Basic Salary</th>
                <th>KRA PIN</th>
                <th>NSSF No.</th>
                <th>Bank Account</th>
                <th>Payroll Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id}>
                  <td>
                    <strong>{emp.first_name} {emp.last_name}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.employee_id}</div>
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{emp.employment_type}</td>
                  <td>{formatKES(emp.basic_salary)}</td>
                  <td>{emp.kra_pin || <span style={{ color: '#ef4444' }}>Missing</span>}</td>
                  <td>{emp.nssf_number || '—'}</td>
                  <td>{emp.bank_account_number ? `****${emp.bank_account_number.slice(-4)}` : '—'}</td>
                  <td>
                    <span style={{ color: emp.payroll_active ? '#10b981' : '#ef4444' }}>
                      {emp.payroll_active ? '✓ Active' : '✗ Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => { setEditing({ ...emp }); setSaveError(''); }}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>No employees found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 className="modal-title">Edit Payroll Profile — {editing.first_name} {editing.last_name}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Employment Type</label>
                <select className="form-control" value={editing.employment_type} onChange={e => setField('employment_type', e.target.value)}>
                  {EMPLOYMENT_TYPES.map(t => <option key={t} value={t} style={{ textTransform: 'capitalize' }}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Salary Grade</label>
                <select className="form-control" value={editing.salary_grade ?? ''} onChange={e => setField('salary_grade', e.target.value || null)}>
                  <option value="">— None —</option>
                  {grades.map(g => <option key={g.id} value={g.grade_code}>{g.grade_code} — {g.grade_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Basic Salary (KES)</label>
                <input type="number" className="form-control" value={editing.basic_salary} onChange={e => setField('basic_salary', Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">KRA PIN</label>
                <input className="form-control" value={editing.kra_pin ?? ''} onChange={e => setField('kra_pin', e.target.value || null)} placeholder="A000000000Z" />
              </div>
              <div className="form-group">
                <label className="form-label">NSSF Number</label>
                <input className="form-control" value={editing.nssf_number ?? ''} onChange={e => setField('nssf_number', e.target.value || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">SHA / SHIF Number</label>
                <input className="form-control" value={editing.sha_number ?? ''} onChange={e => setField('sha_number', e.target.value || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">HELB Account</label>
                <input className="form-control" value={editing.helb_account ?? ''} onChange={e => setField('helb_account', e.target.value || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">HELB Monthly Amount (KES)</label>
                <input type="number" className="form-control" value={editing.helb_monthly_amount} onChange={e => setField('helb_monthly_amount', Number(e.target.value))} />
              </div>
              <div className="form-group">
                <label className="form-label">Bank Name</label>
                <input className="form-control" value={editing.bank_name ?? ''} onChange={e => setField('bank_name', e.target.value || null)} />
              </div>
              <div className="form-group">
                <label className="form-label">Bank Branch</label>
                <input className="form-control" value={editing.bank_branch ?? ''} onChange={e => setField('bank_branch', e.target.value || null)} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Bank Account Number</label>
                <input className="form-control" value={editing.bank_account_number ?? ''} onChange={e => setField('bank_account_number', e.target.value || null)} />
              </div>
            </div>

            {/* Allowances */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ flex: 1 }}>Allowances</strong>
                <button className="btn btn-sm btn-outline" onClick={addAllowanceRow}>+ Add</button>
              </div>
              {Object.entries(editing.allowances).map(([name, amount]) => (
                <div key={name} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                  <input
                    className="form-control"
                    placeholder="Name (e.g. house, transport)"
                    defaultValue={name}
                    onBlur={e => {
                      if (e.target.value !== name) {
                        removeAllowance(name);
                        setAllowance(e.target.value, String(amount));
                      }
                    }}
                    style={{ flex: 2 }}
                  />
                  <input
                    type="number"
                    className="form-control"
                    value={amount}
                    onChange={e => setAllowance(name, e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-sm"
                    style={{ color: '#ef4444' }}
                    onClick={() => removeAllowance(name)}
                  >✕</button>
                </div>
              ))}
            </div>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editing.payroll_active}
                  onChange={e => setField('payroll_active', e.target.checked)}
                />
                Include in payroll runs
              </label>
            </div>

            {saveError && <div className="error-message" style={{ marginBottom: '1rem' }}>{saveError}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
