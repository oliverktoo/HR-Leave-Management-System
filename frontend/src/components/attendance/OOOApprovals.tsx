// OOO Approvals — HOD and HR review queue

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getPendingOOOApprovals,
  hodReviewOOO,
  hrReviewOOO,
  getBlackoutPeriods,
  createBlackoutPeriod,
  updateBlackoutPeriod,
  deleteBlackoutPeriod,
  getProfilesByIds,
  getAssignmentsByIds,
  MiniProfile,
  MiniAssignment,
} from '../../services/oooService';
import {
  OOORequest,
  OOOBlackoutPeriod,
  OOO_ABSENCE_LABELS,
  OOO_STATUS_LABELS,
  OOO_STATUS_COLOR,
  BlackoutType,
} from '../../types/ooo';
import { useAuth } from '../../hooks/useAuth';

type Tab = 'pending' | 'blackouts';

export function OOOApprovals() {
  const { profile } = useAuth();
  const isHR = profile?.role === 'hr_admin' || profile?.role === 'super_admin';
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<OOORequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, MiniProfile>>({});
  const [assignmentMap, setAssignmentMap] = useState<Record<string, MiniAssignment>>({});
  const [blackouts, setBlackouts] = useState<OOOBlackoutPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Review modal state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>('approved');
  const [reviewComments, setReviewComments] = useState('');
  const [payrollFlag, setPayrollFlag] = useState(false);

  // Blackout form
  const [showBlackoutForm, setShowBlackoutForm] = useState(false);
  const [boTitle, setBoTitle] = useState('');
  const [boDesc, setBoDesc] = useState('');
  const [boStart, setBoStart] = useState('');
  const [boEnd, setBoEnd] = useState('');
  const [boType, setBoType] = useState<BlackoutType>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, bos] = await Promise.all([
        getPendingOOOApprovals(),
        getBlackoutPeriods(false),
      ]);
      setRequests(reqs);
      setBlackouts(bos);

      // Batch-fetch employee profiles (since OOO_SELECT = '*' has no joins)
      const uniqueUserIds = [...new Set(reqs.map(r => r.user_id))];
      const profs = await getProfilesByIds(uniqueUserIds);
      const map: Record<string, MiniProfile> = {};
      for (const p of profs) map[p.id] = p;
      setProfiles(map);

      // Batch-fetch assignment titles
      const uniqueAsgIds = [...new Set(reqs.map(r => r.assignment_id).filter(Boolean))] as string[];
      const asgMap = await getAssignmentsByIds(uniqueAsgIds);
      setAssignmentMap(asgMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  const openReview = (id: string) => {
    setReviewingId(id);
    setReviewDecision('approved');
    setReviewComments('');
    setPayrollFlag(false);
  };

  const submitReview = async () => {
    if (!reviewingId) return;
    setProcessing(reviewingId);
    try {
      if (isHR) {
        const req = requests.find(r => r.id === reviewingId);
        // HR can review hod_approved requests; super_admin can also review pending
        if (!req) return;
        await hrReviewOOO({
          request_id: reviewingId,
          decision: reviewDecision,
          comments: reviewComments || undefined,
          payroll_flagged: payrollFlag,
        });
      } else {
        await hodReviewOOO({
          request_id: reviewingId,
          decision: reviewDecision,
          comments: reviewComments || undefined,
        });
      }
      setReviewingId(null);
      flash(`Request ${reviewDecision === 'approved' ? 'approved' : 'rejected'} successfully.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Review failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleAddBlackout = async () => {
    if (!boTitle || !boStart || !boEnd) return;
    try {
      await createBlackoutPeriod({ title: boTitle, description: boDesc || undefined, start_date: boStart, end_date: boEnd, blackout_type: boType });
      setShowBlackoutForm(false);
      setBoTitle(''); setBoDesc(''); setBoStart(''); setBoEnd(''); setBoType('all');
      flash('Blackout period added.');
      await load();
    } catch (err: any) { setError(err.message); }
  };

  const handleToggleBlackout = async (b: OOOBlackoutPeriod) => {
    await updateBlackoutPeriod(b.id, { is_active: !b.is_active });
    await load();
  };

  const handleDeleteBlackout = async (id: string) => {
    if (!confirm('Delete this blackout period?')) return;
    await deleteBlackoutPeriod(id);
    await load();
  };

  const reviewingReq = requests.find(r => r.id === reviewingId);

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
              <h1>✅ OOO Approvals</h1>
              <p className="admin-subtitle">Review and action out of office requests</p>
            </div>
          </header>

          {error && <div className="alert alert-error mb-4">{error}<button onClick={() => setError(null)}>×</button></div>}
          {success && <div className="alert alert-success mb-4">{success}</div>}

          {/* Tabs */}
          <div className="tabs mb-4">
            <button className={`tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
              📋 Pending Requests ({requests.length})
            </button>
            {isHR && (
              <button className={`tab ${tab === 'blackouts' ? 'active' : ''}`} onClick={() => setTab('blackouts')}>
                🚫 Blackout Periods ({blackouts.length})
              </button>
            )}
          </div>

          {/* Pending Requests Tab */}
          {tab === 'pending' && (
            <div className="card">
              <div className="card-body" style={{ padding: 0 }}>
                {requests.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                    <div style={{ fontSize: 48 }}>✅</div>
                    <p>No pending requests.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Type</th>
                          <th>Dates</th>
                          <th>Days</th>
                          <th>Status</th>
                          <th>Reason</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map(req => {
                          const p = profiles[req.user_id];
                          return (
                          <tr key={req.id}>
                            <td>
                              <div style={{ fontWeight: 600 }}>
                                {p ? `${p.first_name} ${p.last_name}` : req.employee_id}
                              </div>
                              <div style={{ fontSize: 12, color: '#6b7280' }}>
                                {p?.employee_id ?? req.employee_id}
                              </div>
                            </td>
                            <td>
                              {req.is_urgent && (
                                <span style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>URGENT</span>
                              )}
                              <div style={{ fontWeight: 500 }}>{OOO_ABSENCE_LABELS[req.absence_type]}</div>
                              {req.assignment_id && assignmentMap[req.assignment_id] && (
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📋 {assignmentMap[req.assignment_id].title}</div>
                              )}
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                              {req.start_date} → {req.end_date}
                            </td>
                            <td>{req.total_days}</td>
                            <td>
                              <span style={{
                                background: OOO_STATUS_COLOR[req.status] + '22',
                                color: OOO_STATUS_COLOR[req.status],
                                border: `1px solid ${OOO_STATUS_COLOR[req.status]}`,
                                padding: '2px 8px', borderRadius: 10, fontSize: 11
                              }}>
                                {OOO_STATUS_LABELS[req.status]}
                              </span>
                            </td>
                            <td style={{ maxWidth: 200, fontSize: 13 }}>
                              <span title={req.reason} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {req.reason}
                              </span>
                            </td>
                            <td>
                              <button className="btn btn-primary btn-sm" onClick={() => openReview(req.id)}>
                                Review
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
          )}

          {/* Blackout Periods Tab */}
          {tab === 'blackouts' && isHR && (
            <div>
              <div className="mb-4">
                {!showBlackoutForm ? (
                  <button className="btn btn-primary" onClick={() => setShowBlackoutForm(true)}>
                    + Add Blackout Period
                  </button>
                ) : (
                  <div className="card">
                    <div className="card-header"><h3 className="card-title">New Blackout Period</h3></div>
                    <div className="card-body">
                      <div className="form-group">
                        <label className="required">Title</label>
                        <input className="form-control" value={boTitle} onChange={e => setBoTitle(e.target.value)} placeholder="e.g. AFCON Match Day" />
                      </div>
                      <div className="form-group">
                        <label>Description</label>
                        <input className="form-control" value={boDesc} onChange={e => setBoDesc(e.target.value)} placeholder="Optional detail" />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="form-group">
                          <label className="required">Start Date</label>
                          <input type="date" className="form-control" value={boStart} onChange={e => setBoStart(e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="required">End Date</label>
                          <input type="date" className="form-control" value={boEnd} onChange={e => setBoEnd(e.target.value)} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Applies To</label>
                        <select className="form-control" value={boType} onChange={e => setBoType(e.target.value as BlackoutType)}>
                          <option value="all">All absence types</option>
                          <option value="training">Training only</option>
                          <option value="official_travel">Official Travel only</option>
                          <option value="official_assignment">Official Assignment only</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-outline" onClick={() => setShowBlackoutForm(false)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAddBlackout} disabled={!boTitle || !boStart || !boEnd}>Save</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="card-body" style={{ padding: 0 }}>
                  {blackouts.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No blackout periods defined.</div>
                  ) : (
                    <table className="table">
                      <thead>
                        <tr><th>Title</th><th>Dates</th><th>Applies To</th><th>Active</th><th></th></tr>
                      </thead>
                      <tbody>
                        {blackouts.map(b => (
                          <tr key={b.id} style={{ opacity: b.is_active ? 1 : 0.5 }}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{b.title}</div>
                              {b.description && <div style={{ fontSize: 12, color: '#6b7280' }}>{b.description}</div>}
                            </td>
                            <td style={{ fontSize: 13 }}>{b.start_date} → {b.end_date}</td>
                            <td style={{ fontSize: 13 }}>{b.blackout_type === 'all' ? 'All types' : b.blackout_type.replace('_', ' ')}</td>
                            <td>
                              <span style={{ color: b.is_active ? '#22c55e' : '#9ca3af', fontWeight: 600 }}>
                                {b.is_active ? '✓ Active' : '✗ Inactive'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-outline btn-sm" onClick={() => handleToggleBlackout(b)}>
                                  {b.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button className="btn btn-outline btn-sm" style={{ color: '#ef4444', borderColor: '#ef4444' }} onClick={() => handleDeleteBlackout(b.id)}>
                                  Delete
                                </button>
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
          )}

        </div>
      </main>

      {/* Review Modal */}
      {reviewingId && reviewingReq && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>Review OOO Request</h3>
              <button className="modal-close" onClick={() => setReviewingId(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 14 }}>
                {(() => {
                  const rp = profiles[reviewingReq.user_id];
                  return <div><strong>{rp ? `${rp.first_name} ${rp.last_name}` : reviewingReq.employee_id}</strong></div>;
                })()}
                <div style={{ marginTop: 4 }}>{OOO_ABSENCE_LABELS[reviewingReq.absence_type]} · {reviewingReq.total_days} day{reviewingReq.total_days !== 1 ? 's' : ''}</div>
                <div style={{ marginTop: 2, color: '#6b7280' }}>{reviewingReq.start_date} → {reviewingReq.end_date}</div>
                <div style={{ marginTop: 8 }}><strong>Reason:</strong> {reviewingReq.reason}</div>
                {reviewingReq.handover_notes && (
                  <div style={{ marginTop: 4 }}><strong>Handover:</strong> {reviewingReq.handover_notes}</div>
                )}
                {reviewingReq.emergency_contact && (
                  <div style={{ marginTop: 4 }}><strong>Emergency Contact:</strong> {reviewingReq.emergency_contact}</div>
                )}
              </div>

              <div className="form-group">
                <label className="required">Decision</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {(['approved', 'rejected'] as const).map(d => (
                    <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" name="decision" value={d} checked={reviewDecision === d} onChange={() => setReviewDecision(d)} />
                      <span style={{ color: d === 'approved' ? '#22c55e' : '#ef4444', fontWeight: 600, textTransform: 'capitalize' }}>{d}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Comments {reviewDecision === 'rejected' && <span style={{ color: '#ef4444' }}>*</span>}</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reviewComments}
                  onChange={e => setReviewComments(e.target.value)}
                  placeholder={reviewDecision === 'rejected' ? 'Please provide a reason for rejection…' : 'Optional comments…'}
                />
              </div>

              {isHR && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={payrollFlag} onChange={e => setPayrollFlag(e.target.checked)} />
                    Flag to Payroll (absence affects pay)
                  </label>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setReviewingId(null)}>Cancel</button>
              <button
                className={`btn ${reviewDecision === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
                style={reviewDecision === 'rejected' ? { background: '#ef4444', color: '#fff' } : undefined}
                onClick={submitReview}
                disabled={!!processing || (reviewDecision === 'rejected' && !reviewComments.trim())}
              >
                {processing ? 'Saving…' : reviewDecision === 'approved' ? '✓ Approve' : '✗ Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
