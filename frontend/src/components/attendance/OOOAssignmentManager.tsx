// OOO Assignment Manager — HOD/Admin creates and manages OOO assignments

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import { useAuth } from '../../hooks/useAuth';
import {
  getMyCreatedOOOAssignments,
  getOOOAssignments,
  createOOOAssignment,
  updateOOOAssignment,
  getAssignmentApplicants,
} from '../../services/oooService';
import {
  OOOAssignment,
  OOORequest,
  OOOAbsenceType,
  CreateOOOAssignmentInput,
  OOO_ABSENCE_LABELS,
  OOO_ASSIGNMENT_STATUS_COLOR,
  OOO_STATUS_LABELS,
  OOO_STATUS_COLOR,
} from '../../types/ooo';

export function OOOAssignmentManager() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'hr_admin' || profile?.role === 'super_admin';

  const [assignments, setAssignments] = useState<OOOAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateOOOAssignmentInput>({
    title: '',
    assignment_type: 'training',
    start_date: '',
    end_date: '',
    description: '',
    location: '',
    includes_weekend: false,
    includes_public_holiday: false,
    max_participants: undefined,
  });

  // Applicants drawer
  const [viewAssignment, setViewAssignment] = useState<OOOAssignment | null>(null);
  const [applicants, setApplicants] = useState<OOORequest[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = isAdmin
        ? await getOOOAssignments()
        : await getMyCreatedOOOAssignments();
      setAssignments(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.start_date || !form.end_date) {
      setError('Title and dates are required.');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await createOOOAssignment(form);
      setShowCreate(false);
      setForm({ title: '', assignment_type: 'training', start_date: '', end_date: '', description: '', location: '', includes_weekend: false, includes_public_holiday: false });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    if (!confirm(`${status === 'closed' ? 'Close' : 'Cancel'} this assignment? No further applications will be accepted.`)) return;
    try {
      await updateOOOAssignment(id, { status });
      setAssignments(prev => prev.map(a => a.id === id ? { ...a, status: status as any } : a));
    } catch (err: any) {
      setError(err.message || 'Failed to update assignment');
    }
  };

  const handleViewApplicants = async (assignment: OOOAssignment) => {
    setViewAssignment(assignment);
    setLoadingApplicants(true);
    try {
      const data = await getAssignmentApplicants(assignment.id);
      setApplicants(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load applicants');
    } finally {
      setLoadingApplicants(false);
    }
  };

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const openCount = assignments.filter(a => a.status === 'open').length;
  if (loading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="loading-container"><div className="loading-spinner" /><p>Loading…</p></div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          <header className="admin-header">
            <div>
              <h1 className="page-title">OOO Assignments</h1>
              <p className="page-subtitle">Create work assignments that staff can apply against for out-of-office approval</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + New Assignment
            </button>
          </header>

          {error && (
            <div className="alert alert-danger mb-4">
              {error}<button onClick={() => setError(null)} style={{ marginLeft: 8 }}>×</button>
            </div>
          )}

          {/* How it works */}
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
            padding: '16px 20px', marginBottom: 20,
          }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e40af', marginBottom: 10 }}>
              ℹ️ How OOO Assignments Work
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                { step: '1', icon: '📋', title: 'HOD Creates Assignment', body: 'Click "+ New Assignment", fill in the title, type (training, travel, etc.), dates, location, and max participants. Save — it becomes Open immediately.' },
                { step: '2', icon: '✋', title: 'Staff Apply', body: 'Staff go to Attendance → My OOO Requests → Apply for OOO. They select this assignment, add a reason, and submit. Status shows as Pending.' },
                { step: '3', icon: '✅', title: 'HOD Approves (Stage 1)', body: 'Go to Attendance → OOO Approvals. Review each request, then Approve or Reject. Approved requests move to HR for final sign-off.' },
                { step: '4', icon: '🏢', title: 'HR Final Approval (Stage 2)', body: 'HR Admin reviews HOD-approved requests, gives final approval, and optionally flags for payroll (per diem/allowance). Staff are notified.' },
              ].map(s => (
                <div key={s.step} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', background: '#1e40af',
                    color: '#fff', fontSize: 12, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                  }}>{s.step}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e3a8a', marginBottom: 2 }}>{s.icon} {s.title}</div>
                    <div style={{ fontSize: 12, color: '#3b5ea6', lineHeight: 1.5 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="dashboard-grid mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <div className="stats-card">
              <p className="stats-title">Open Assignments</p>
              <p className="stats-value" style={{ color: '#22c55e' }}>{openCount}</p>
            </div>
            <div className="stats-card">
              <p className="stats-title">Total Assignments</p>
              <p className="stats-value">{assignments.length}</p>
            </div>
          </div>

          {/* Assignment list */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {isAdmin ? 'All Assignments' : 'My Assignments'}
              </h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {assignments.length === 0 ? (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div style={{ fontSize: 48 }}>📋</div>
                  <h3>No assignments yet</h3>
                  <p>Create an assignment so staff can apply for OOO.</p>
                  <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ New Assignment</button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Location</th>
                        <th>Flags</th>
                        {isAdmin && <th>Created By</th>}
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 500 }}>{a.title}</td>
                          <td>
                            <span className="status-badge" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>
                              {OOO_ABSENCE_LABELS[a.assignment_type]}
                            </span>
                          </td>
                          <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                            {a.start_date} → {a.end_date}
                          </td>
                          <td style={{ fontSize: 13, color: '#6b7280' }}>{a.location || '—'}</td>
                          <td style={{ fontSize: 12 }}>
                            {a.includes_weekend && <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>WKD</span>}
                            {a.includes_public_holiday && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 4 }}>HOL</span>}
                          </td>
                          {isAdmin && (
                            <td style={{ fontSize: 13 }}>
                              {a.creator ? `${a.creator.first_name} ${a.creator.last_name}` : '—'}
                            </td>
                          )}
                          <td>
                            <span style={{
                              background: OOO_ASSIGNMENT_STATUS_COLOR[a.status] + '22',
                              color: OOO_ASSIGNMENT_STATUS_COLOR[a.status],
                              border: `1px solid ${OOO_ASSIGNMENT_STATUS_COLOR[a.status]}`,
                              padding: '2px 10px', borderRadius: 12, fontSize: 12
                            }}>
                              {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-outline btn-sm" onClick={() => handleViewApplicants(a)}>
                                Applicants
                              </button>
                              {a.status === 'open' && (
                                <>
                                  <button className="btn btn-outline btn-sm" onClick={() => handleStatusChange(a.id, 'closed')}>
                                    Close
                                  </button>
                                  <button
                                    className="btn btn-outline btn-sm"
                                    style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                    onClick={() => handleStatusChange(a.id, 'cancelled')}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* ── Create Assignment Modal ── */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>New OOO Assignment</h3>
              <button onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input enhanced-input" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. County Monitoring Visit — Nakuru" required />
                </div>

                <div className="form-group">
                  <label className="form-label">Assignment Type *</label>
                  <div className="select-container">
                    <select className="form-select enhanced-select" value={form.assignment_type}
                      onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value as OOOAbsenceType }))}>
                      {(Object.entries(OOO_ABSENCE_LABELS) as [OOOAbsenceType, string][]).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Start Date *</label>
                    <input type="date" className="form-input enhanced-input" value={form.start_date}
                      min={isAdmin ? undefined : today} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
                    {isAdmin && (
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        As an admin you can backdate this assignment to a past date.
                      </p>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Date *</label>
                    <input type="date" className="form-input enhanced-input" value={form.end_date}
                      min={form.start_date || (isAdmin ? undefined : today)} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input enhanced-input" value={form.location || ''}
                    onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                    placeholder="Town, county or venue" />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-textarea enhanced-textarea" rows={3} value={form.description || ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Objectives, expectations, or any relevant details…" />
                </div>

                <div className="form-group">
                  <label className="form-label">Max Participants <span style={{ fontWeight: 400, color: '#9ca3af' }}>(leave blank for unlimited)</span></label>
                  <input type="number" min={1} className="form-input enhanced-input"
                    value={form.max_participants ?? ''}
                    onChange={e => setForm(f => ({ ...f, max_participants: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="e.g. 5" />
                </div>

                <div style={{ display: 'flex', gap: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.includes_weekend}
                      onChange={e => setForm(f => ({ ...f, includes_weekend: e.target.checked }))} />
                    Includes Weekend Days
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.includes_public_holiday}
                      onChange={e => setForm(f => ({ ...f, includes_public_holiday: e.target.checked }))} />
                    Includes Public Holidays
                  </label>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Applicants Drawer Modal ── */}
      {viewAssignment && (
        <div className="modal-overlay" onClick={() => setViewAssignment(null)}>
          <div className="modal" style={{ maxWidth: 680 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Applicants — {viewAssignment.title}</h3>
                <p style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                  {viewAssignment.start_date} → {viewAssignment.end_date}
                </p>
              </div>
              <button onClick={() => setViewAssignment(null)}>×</button>
            </div>
            <div className="modal-body">
              {loadingApplicants ? (
                <div className="loading-container"><div className="loading-spinner" /></div>
              ) : applicants.length === 0 ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <p>No applications yet for this assignment.</p>
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Submitted</th>
                      <th>Urgent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applicants.map(req => (
                      <tr key={req.id}>
                        <td>
                          {req.requester
                            ? `${req.requester.first_name} ${req.requester.last_name}`
                            : req.employee_id}
                        </td>
                        <td style={{ fontSize: 13, color: '#6b7280' }}>
                          {new Date(req.submitted_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td>{req.is_urgent ? <span style={{ color: '#ef4444', fontSize: 12 }}>Urgent</span> : '—'}</td>
                        <td>
                          <span style={{
                            background: OOO_STATUS_COLOR[req.status] + '22',
                            color: OOO_STATUS_COLOR[req.status],
                            border: `1px solid ${OOO_STATUS_COLOR[req.status]}`,
                            padding: '2px 8px', borderRadius: 10, fontSize: 12
                          }}>
                            {OOO_STATUS_LABELS[req.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setViewAssignment(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
