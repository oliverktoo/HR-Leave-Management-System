// Field Assignment Manager — HR/HOD creates and manages field assignments

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getFieldAssignments,
  createFieldAssignment,
  updateFieldAssignment,
  closeFieldAssignment,
  cancelFieldAssignment,
  getAssignmentClockLogs,
} from '../../services/fieldAssignmentService';
import {
  FieldAssignment,
  FieldClockLog,
  CreateFieldAssignmentInput,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_COLOR,
} from '../../types/fieldAssignment';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';

interface EmployeeOption { id: string; name: string; employee_id: string; dept: string }

export function FieldAssignmentManager() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isHR = profile?.role === 'hr_admin' || profile?.role === 'super_admin';

  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Detail / logs view
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewLogs, setViewLogs] = useState<FieldClockLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Create / edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<CreateFieldAssignmentInput>>({
    expected_deliverables: [],
    location_radius_m: 500,
    employee_ids: [],
  });
  const [newDeliverable, setNewDeliverable] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Close modal
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeNotes, setCloseNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, empData] = await Promise.all([
        getFieldAssignments(),
        supabase.from('users_profile').select('id, first_name, last_name, employee_id, department:department_id(name)').eq('is_active', true).order('first_name'),
      ]);
      setAssignments(list);
      setEmployees((empData.data || []).map((e: any) => ({
        id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        employee_id: e.employee_id,
        dept: e.department?.name || '',
      })));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  const openCreate = () => {
    setEditingId(null);
    setForm({ expected_deliverables: [], location_radius_m: 500, employee_ids: [], supervisor_id: profile?.id });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.title || !form.location_name || !form.planned_start || !form.planned_end || !form.supervisor_id) {
      setError('Please fill in all required fields.'); return;
    }
    setSubmitting(true);
    try {
      if (editingId) {
        await updateFieldAssignment(editingId, form as CreateFieldAssignmentInput);
        flash('Assignment updated.');
      } else {
        await createFieldAssignment(form as CreateFieldAssignmentInput);
        flash('Assignment created.');
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (!closingId) return;
    try {
      await closeFieldAssignment(closingId, closeNotes);
      setClosingId(null);
      setCloseNotes('');
      flash('Assignment closed by HR.');
      await load();
    } catch (err: any) { setError(err.message); }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this assignment?')) return;
    try {
      await cancelFieldAssignment(id);
      flash('Assignment cancelled.');
      await load();
    } catch (err: any) { setError(err.message); }
  };

  const openLogs = async (id: string) => {
    setViewId(id);
    setLogsLoading(true);
    try {
      setViewLogs(await getAssignmentClockLogs(id));
    } finally {
      setLogsLoading(false);
    }
  };

  const addDeliverable = () => {
    if (!newDeliverable.trim()) return;
    setForm(f => ({ ...f, expected_deliverables: [...(f.expected_deliverables || []), { item: newDeliverable.trim(), completed: false }] }));
    setNewDeliverable('');
  };

  const removeDeliverable = (i: number) => {
    setForm(f => ({ ...f, expected_deliverables: (f.expected_deliverables || []).filter((_, idx) => idx !== i) }));
  };

  const toggleEmployee = (id: string) => {
    setForm(f => {
      const ids = f.employee_ids || [];
      return { ...f, employee_ids: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] };
    });
  };

  const viewing = viewId ? assignments.find(a => a.id === viewId) : null;

  if (loading) {
    return <div className="admin-layout"><AdminSidebar /><main className="admin-main"><div className="loading-container"><div className="loading-spinner" /><p>Loading…</p></div></main></div>;
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          <header className="admin-header">
            <div>
              <h1>📍 Field Assignments</h1>
              <p className="admin-subtitle">Create and manage field deployment assignments</p>
            </div>
            <button className="btn btn-primary" onClick={openCreate}>+ New Assignment</button>
          </header>

          {error && <div className="alert alert-error mb-4">{error}<button onClick={() => setError(null)}>×</button></div>}
          {success && <div className="alert alert-success mb-4">{success}</div>}

          {/* Assignments list */}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {assignments.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: 48 }}>📍</div>
                  <p>No assignments yet. Create one to deploy field staff.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Assignment</th><th>Location</th><th>Dates</th><th>Staff</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {assignments.map(a => (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{a.assignment_number}</div>
                          <div style={{ fontSize: 13 }}>{a.title}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>
                          <div>{a.location_name}</div>
                          {a.location_county && <div style={{ color: '#6b7280' }}>{a.location_county}</div>}
                        </td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          <div>{new Date(a.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          <div style={{ color: '#6b7280' }}>→ {new Date(a.planned_end).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        </td>
                        <td style={{ fontSize: 13 }}>{(a.employees || []).length} staff</td>
                        <td>
                          <span style={{
                            background: ASSIGNMENT_STATUS_COLOR[a.status] + '22',
                            color: ASSIGNMENT_STATUS_COLOR[a.status],
                            border: `1px solid ${ASSIGNMENT_STATUS_COLOR[a.status]}`,
                            padding: '2px 10px', borderRadius: 10, fontSize: 12
                          }}>
                            {ASSIGNMENT_STATUS_LABELS[a.status]}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => openLogs(a.id)}>Logs</button>
                            <button className="btn btn-outline btn-sm" onClick={() => navigate(`/attendance/field/supervisor?assignment=${a.id}`)}>Verify</button>
                            {isHR && a.status === 'in_progress' && (
                              <button className="btn btn-primary btn-sm" onClick={() => { setClosingId(a.id); setCloseNotes(''); }}>Close</button>
                            )}
                            {['draft', 'active'].includes(a.status) && (
                              <button className="btn btn-outline btn-sm" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleCancel(a.id)}>Cancel</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Create/Edit Assignment Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Assignment' : 'New Field Assignment'}</h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="form-group">
                <label className="required">Title</label>
                <input className="form-control" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. County FA Officer Visit – Kisumu" />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea className="form-control" rows={2} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="required">Location Name</label>
                  <input className="form-control" value={form.location_name || ''} onChange={e => setForm(f => ({ ...f, location_name: e.target.value }))} placeholder="e.g. Kasarani Stadium" />
                </div>
                <div className="form-group">
                  <label>County</label>
                  <input className="form-control" value={form.location_county || ''} onChange={e => setForm(f => ({ ...f, location_county: e.target.value }))} placeholder="e.g. Nairobi" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>GPS Latitude</label>
                  <input type="number" step="any" className="form-control" value={form.location_lat ?? ''} onChange={e => setForm(f => ({ ...f, location_lat: e.target.value ? parseFloat(e.target.value) : undefined }))} placeholder="-1.2345678" />
                </div>
                <div className="form-group">
                  <label>GPS Longitude</label>
                  <input type="number" step="any" className="form-control" value={form.location_lng ?? ''} onChange={e => setForm(f => ({ ...f, location_lng: e.target.value ? parseFloat(e.target.value) : undefined }))} placeholder="36.8245678" />
                </div>
                <div className="form-group">
                  <label>Radius (m)</label>
                  <input type="number" className="form-control" value={form.location_radius_m || 500} onChange={e => setForm(f => ({ ...f, location_radius_m: parseInt(e.target.value) }))} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="required">Planned Start</label>
                  <input type="datetime-local" className="form-control" value={form.planned_start || ''} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="required">Planned End</label>
                  <input type="datetime-local" className="form-control" value={form.planned_end || ''} onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))} />
                </div>
              </div>

              {/* Expected Deliverables */}
              <div className="form-group">
                <label>Expected Deliverables</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="form-control" value={newDeliverable} onChange={e => setNewDeliverable(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addDeliverable())} placeholder="Add deliverable and press Enter or +" />
                  <button type="button" className="btn btn-outline" onClick={addDeliverable}>+</button>
                </div>
                {(form.expected_deliverables || []).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#f8fafc', borderRadius: 6, marginBottom: 4 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>• {d.item}</span>
                    <button type="button" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} onClick={() => removeDeliverable(i)}>×</button>
                  </div>
                ))}
              </div>

              {/* Assign Employees */}
              <div className="form-group">
                <label className="required">Assign Staff ({(form.employee_ids || []).length} selected)</label>
                <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
                  {employees.map(emp => (
                    <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={(form.employee_ids || []).includes(emp.id)} onChange={() => toggleEmployee(emp.id)} />
                      <span style={{ fontSize: 13 }}>
                        <strong>{emp.name}</strong>
                        <span style={{ color: '#6b7280' }}> · {emp.employee_id} · {emp.dept}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Saving…' : editingId ? 'Update' : 'Create Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HR Close Modal */}
      {closingId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>Close Assignment</h3>
              <button className="modal-close" onClick={() => setClosingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12, fontSize: 14 }}>Mark this assignment as completed and close it in the HR records.</p>
              <div className="form-group">
                <label>HR Closure Notes</label>
                <textarea className="form-control" rows={3} value={closeNotes} onChange={e => setCloseNotes(e.target.value)} placeholder="Optional notes on closure, per diem processed, etc." />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setClosingId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleClose}>✓ Close Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* Logs Drawer */}
      {viewId && viewing && (
        <div className="modal-overlay" onClick={() => setViewId(null)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Clock Logs — {viewing.title}</h3>
              <button className="modal-close" onClick={() => setViewId(null)}>×</button>
            </div>
            <div className="modal-body">
              {logsLoading ? (
                <div className="loading-container"><div className="loading-spinner" /></div>
              ) : viewLogs.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: 24 }}>No clock-in logs yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Verification</th></tr>
                  </thead>
                  <tbody>
                    {viewLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ fontSize: 13 }}>{log.employee?.first_name} {log.employee?.last_name}</td>
                        <td style={{ fontSize: 13 }}>
                          {new Date(log.clock_in_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {log.clock_in_offline && <span style={{ fontSize: 10, marginLeft: 4, color: '#f59e0b' }}>OFFLINE</span>}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {log.clock_out_time
                            ? new Date(log.clock_out_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : <span style={{ color: '#22c55e' }}>Active</span>}
                        </td>
                        <td>{log.work_hours != null ? `${log.work_hours}h` : '—'}</td>
                        <td>
                          {log.verification_status
                            ? <span style={{ color: log.verification_status === 'verified' ? '#22c55e' : '#ef4444', fontSize: 12 }}>
                                {log.verification_status === 'verified' ? '✓ Verified' : '⚠ Flagged'}
                              </span>
                            : <span style={{ color: '#9ca3af', fontSize: 12 }}>Pending</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
