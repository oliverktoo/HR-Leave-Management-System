// OOO Request List — Employee views their own OOO history

import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getMyOOORequests, cancelOOORequest, getOOOSummary, getAssignmentsByIds, MiniAssignment } from '../../services/oooService';
import { OOORequest, OOOSummaryRow, OOO_ABSENCE_LABELS, OOO_STATUS_LABELS, OOO_STATUS_COLOR } from '../../types/ooo';
import { useAuth } from '../../hooks/useAuth';

export function OOORequestList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [requests, setRequests] = useState<OOORequest[]>([]);
  const [summary, setSummary] = useState<OOOSummaryRow[]>([]);
  const [assignmentMap, setAssignmentMap] = useState<Record<string, MiniAssignment>>({});
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>((location.state as any)?.success ?? null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, sum] = await Promise.all([
        getMyOOORequests(),
        getOOOSummary(profile?.id),
      ]);
      setRequests(reqs);
      setSummary(sum);

      // Batch-fetch assignment titles for display
      const asgIds = [...new Set(reqs.map(r => r.assignment_id).filter(Boolean))] as string[];
      const asgMap = await getAssignmentsByIds(asgIds);
      setAssignmentMap(asgMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (successMsg) setTimeout(() => setSuccessMsg(null), 4000);
  }, [successMsg]);

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this OOO request?')) return;
    setCancelling(id);
    try {
      await cancelOOORequest(id);
      await load(); // reload from server to reflect true DB state
    } catch (err: any) {
      setError(err.message || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const approvedThisYear = summary.reduce((s, r) => s + Number(r.approved_days), 0);
  const pendingThisYear = summary.reduce((s, r) => s + Number(r.pending_days), 0);

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
              <h1>📤 My OOO Requests</h1>
              <p className="admin-subtitle">Your out of office history and status</p>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/attendance/ooo/new')}>
              + New Request
            </button>
          </header>

          {successMsg && <div className="alert alert-success mb-4">{successMsg}</div>}
          {error && <div className="alert alert-error mb-4">{error}<button onClick={() => setError(null)}>×</button></div>}

          {/* Summary cards */}
          <div className="dashboard-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div className="stats-card">
              <p className="stats-title">Approved Days ({new Date().getFullYear()})</p>
              <p className="stats-value" style={{ color: '#22c55e' }}>{approvedThisYear}</p>
            </div>
            <div className="stats-card">
              <p className="stats-title">Pending Days</p>
              <p className="stats-value" style={{ color: '#f59e0b' }}>{pendingThisYear}</p>
            </div>
            <div className="stats-card">
              <p className="stats-title">Total Requests</p>
              <p className="stats-value">{requests.length}</p>
            </div>
          </div>

          {/* Request list */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">All Requests</h3>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {requests.length === 0 ? (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div style={{ fontSize: 48 }}>📤</div>
                  <h3>No requests yet</h3>
                  <p>Submit your first OOO request when you need to be away.</p>
                  <button className="btn btn-primary" onClick={() => navigate('/attendance/ooo/new')}>
                    + New Request
                  </button>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Assignment</th>
                        <th>Type</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Submitted</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map(req => (
                        <tr key={req.id}>
                          <td style={{ maxWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {req.assignment_id && assignmentMap[req.assignment_id]
                                ? assignmentMap[req.assignment_id].title
                                : '—'}
                            </div>
                          </td>
                          <td>
                            {req.is_urgent && <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>URGENT</span>}
                            {OOO_ABSENCE_LABELS[req.absence_type]}
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {req.start_date} → {req.end_date}
                          </td>
                          <td>{req.total_days}</td>
                          <td>
                            <span className="status-badge" style={{
                              background: OOO_STATUS_COLOR[req.status] + '22',
                              color: OOO_STATUS_COLOR[req.status],
                              border: `1px solid ${OOO_STATUS_COLOR[req.status]}`,
                              padding: '2px 10px', borderRadius: 12, fontSize: 12, whiteSpace: 'nowrap'
                            }}>
                              {OOO_STATUS_LABELS[req.status]}
                            </span>
                          </td>
                          <td style={{ fontSize: 13, color: '#6b7280' }}>
                            {new Date(req.submitted_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {req.status === 'pending' && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  style={{ color: '#ef4444', borderColor: '#ef4444' }}
                                  onClick={() => handleCancel(req.id)}
                                  disabled={cancelling === req.id}
                                >
                                  {cancelling === req.id ? '…' : 'Cancel'}
                                </button>
                              )}
                              {(req.hod_comments || req.hr_comments) && (
                                <button
                                  className="btn btn-outline btn-sm"
                                  onClick={() => {
                                    const msg = [
                                      req.hod_comments && `HOD: ${req.hod_comments}`,
                                      req.hr_comments && `HR: ${req.hr_comments}`,
                                    ].filter(Boolean).join('\n\n');
                                    alert(msg);
                                  }}
                                >
                                  View Comments
                                </button>
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
    </div>
  );
}
