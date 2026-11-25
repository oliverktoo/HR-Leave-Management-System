import { errorMessage } from '../../utils/errorMessage';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { recordSalaryChange, formatKES, SalaryChange } from '../../services/payrollService';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  increment:    { label: 'Increment',     color: '#10b981' },
  decrement:    { label: 'Decrement',     color: '#ef4444' },
  promotion:    { label: 'Promotion',     color: '#6366f1' },
  grade_change: { label: 'Grade Change',  color: '#3b82f6' },
  acting:       { label: 'Acting',        color: '#f59e0b' },
  correction:   { label: 'Correction',    color: '#8b5cf6' },
  joining:      { label: 'Joining',       color: '#06b6d4' },
  termination:  { label: 'Termination',   color: '#94a3b8' },
};

interface Employee { id: string; employee_id: string; first_name: string; last_name: string; basic_salary: number; }

interface NewChangeForm {
  user_id: string;
  change_type: SalaryChange['change_type'];
  old_basic_salary: string;
  new_basic_salary: string;
  effective_date: string;
  reason: string;
}

const EMPTY_FORM: NewChangeForm = {
  user_id: '',
  change_type: 'increment',
  old_basic_salary: '',
  new_basic_salary: '',
  effective_date: new Date().toISOString().split('T')[0],
  reason: '',
};

export function SalaryChangeLog() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [employees,   setEmployees]   = useState<Employee[]>([]);
  const [changes,     setChanges]     = useState<SalaryChange[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState<NewChangeForm>(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState('');
  const [filterEmp,   setFilterEmp]   = useState('');
  const [filterType,  setFilterType]  = useState('');

  const canWrite = profile?.role === 'hr_admin' || profile?.role === 'super_admin';

  useEffect(() => {
    async function load() {
      try {
        // Load all employees for the filter/selector
        const { data: emps } = await supabase
          .from('users_profile')
          .select('id, employee_id, first_name, last_name, basic_salary')
          .eq('is_active', true)
          .order('first_name');
        setEmployees((emps as Employee[]) || []);

        // Load all salary changes
        const { data: all, error: err } = await supabase
          .from('salary_changes')
          .select('*')
          .order('effective_date', { ascending: false });
        if (err) throw err;
        setChanges((all as SalaryChange[]) || []);
      } catch (e: unknown) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // When employee selected, pre-fill old salary
  function handleEmpChange(userId: string) {
    const emp = employees.find(e => e.id === userId);
    setForm(f => ({
      ...f,
      user_id: userId,
      old_basic_salary: emp ? String(emp.basic_salary) : '',
    }));
  }

  async function handleSave() {
    if (!form.user_id)         { setSaveError('Select an employee'); return; }
    if (!form.new_basic_salary){ setSaveError('New salary is required'); return; }
    if (!form.reason.trim())   { setSaveError('Reason is required'); return; }

    setSaving(true);
    setSaveError('');
    try {
      const saved = await recordSalaryChange({
        user_id:         form.user_id,
        change_type:     form.change_type,
        old_basic_salary: form.old_basic_salary ? Number(form.old_basic_salary) : null,
        new_basic_salary: Number(form.new_basic_salary),
        old_allowances:  null,
        new_allowances:  null,
        old_grade:       null,
        new_grade:       null,
        effective_date:  form.effective_date,
        reason:          form.reason.trim(),
        approved_by:     profile?.id ?? null,
        approved_at:     new Date().toISOString(),
      });
      setChanges(prev => [saved, ...prev]);
      setShowModal(false);
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // Build employee lookup map
  const empMap: Record<string, Employee> = {};
  for (const e of employees) empMap[e.id] = e;

  const filtered = changes.filter(c => {
    if (filterEmp  && c.user_id !== filterEmp)           return false;
    if (filterType && c.change_type !== filterType)      return false;
    return true;
  });

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/payroll/dashboard')} style={{ marginBottom: '0.5rem' }}>
              ← Back
            </button>
            <h1 style={{ margin: '0 0 0.25rem' }}>Salary Change Log</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem' }}>
              SOP 7.1 — All salary changes must be captured with effective date and approver
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {canWrite && (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                + Record Change
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

        {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 className="card-title" style={{ flex: 1 }}>All Changes ({filtered.length})</h2>
            <select className="form-control" style={{ maxWidth: 200 }} value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">All employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
            <select className="form-control" style={{ maxWidth: 160 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(CHANGE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Old Salary</th>
                    <th>New Salary</th>
                    <th>Effective Date</th>
                    <th>Reason</th>
                    <th>Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94a3b8' }}>No salary changes found</td></tr>
                  )}
                  {filtered.map(c => {
                    const emp = empMap[c.user_id];
                    const cfg = CHANGE_TYPE_LABELS[c.change_type] ?? { label: c.change_type, color: '#94a3b8' };
                    const diff = c.new_basic_salary != null && c.old_basic_salary != null
                      ? c.new_basic_salary - c.old_basic_salary
                      : null;
                    return (
                      <tr key={c.id}>
                        <td>
                          <div><strong>{emp ? `${emp.first_name} ${emp.last_name}` : c.user_id}</strong></div>
                          {emp && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{emp.employee_id}</div>}
                        </td>
                        <td>
                          <span style={{
                            background: cfg.color + '22', color: cfg.color,
                            border: `1px solid ${cfg.color}44`,
                            borderRadius: 4, padding: '2px 8px', fontSize: '0.8rem', fontWeight: 600,
                          }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ color: '#64748b' }}>
                          {c.old_basic_salary != null ? formatKES(c.old_basic_salary) : '—'}
                        </td>
                        <td>
                          <strong>{c.new_basic_salary != null ? formatKES(c.new_basic_salary) : '—'}</strong>
                          {diff != null && (
                            <div style={{ fontSize: '0.75rem', color: diff >= 0 ? '#10b981' : '#ef4444' }}>
                              {diff >= 0 ? '+' : ''}{formatKES(diff)}
                            </div>
                          )}
                        </td>
                        <td>{c.effective_date}</td>
                        <td style={{ maxWidth: 240, fontSize: '0.85rem' }}>{c.reason}</td>
                        <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {new Date(c.created_at).toLocaleDateString('en-KE')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Record change modal */}
        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <h3 className="modal-title">Record Salary Change</h3>
              <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                This creates an audit trail entry. Update the employee's actual salary separately in Employee Profiles.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div className="form-group">
                  <label className="form-label">Employee *</label>
                  <select className="form-control" value={form.user_id} onChange={e => handleEmpChange(e.target.value)}>
                    <option value="">Select employee…</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_id})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Change Type *</label>
                  <select className="form-control" value={form.change_type}
                    onChange={e => setForm(f => ({ ...f, change_type: e.target.value as SalaryChange['change_type'] }))}>
                    {Object.entries(CHANGE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Old Basic Salary (KES)</label>
                    <input type="number" className="form-control" min={0}
                      value={form.old_basic_salary}
                      onChange={e => setForm(f => ({ ...f, old_basic_salary: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Basic Salary (KES) *</label>
                    <input type="number" className="form-control" min={0}
                      value={form.new_basic_salary}
                      onChange={e => setForm(f => ({ ...f, new_basic_salary: e.target.value }))} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Effective Date *</label>
                  <input type="date" className="form-control" value={form.effective_date}
                    onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Reason *</label>
                  <textarea className="form-control" rows={3} placeholder="e.g. Annual increment per performance review approved by CEO"
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
                </div>
              </div>

              {saveError && <div className="error-message" style={{ marginTop: '0.5rem' }}>{saveError}</div>}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button className="btn btn-outline" onClick={() => { setShowModal(false); setForm(EMPTY_FORM); setSaveError(''); }}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : 'Record Change'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
