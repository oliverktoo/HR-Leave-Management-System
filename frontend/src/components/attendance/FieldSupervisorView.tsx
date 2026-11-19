// Field Supervisor View — HOD/HR verifies field clock logs and activity logs

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getFieldAssignments,
  getAssignmentClockLogs,
  getActivityLogs,
  supervisorVerifyLog,
  acknowledgeActivityLog,
} from '../../services/fieldAssignmentService';
import {
  FieldAssignment,
  FieldClockLog,
  FieldActivityLog,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_COLOR,
} from '../../types/fieldAssignment';

type Tab = 'clock_logs' | 'activity_logs';

export function FieldSupervisorView() {
  const [searchParams] = useSearchParams();
  const preselect = searchParams.get('assignment');

  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(preselect);
  const [clockLogs, setClockLogs] = useState<FieldClockLog[]>([]);
  const [actLogs, setActLogs] = useState<FieldActivityLog[]>([]);
  const [tab, setTab] = useState<Tab>('clock_logs');
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // Verify modal
  const [verifyingLog, setVerifyingLog] = useState<FieldClockLog | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<'verified' | 'flagged'>('verified');
  const [verifyNotes, setVerifyNotes] = useState('');

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getFieldAssignments({ status: ['active', 'in_progress', 'completed'] });
      setAssignments(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAssignments(); }, [loadAssignments]);

  useEffect(() => {
    if (!selectedId) return;
    setDataLoading(true);
    Promise.all([
      getAssignmentClockLogs(selectedId),
      getActivityLogs(selectedId),
    ]).then(([cl, al]) => {
      setClockLogs(cl);
      setActLogs(al);
    }).catch(err => setError(err.message))
    .finally(() => setDataLoading(false));
  }, [selectedId]);

  const handleVerify = async () => {
    if (!verifyingLog) return;
    setProcessing(verifyingLog.id);
    try {
      await supervisorVerifyLog({
        log_id: verifyingLog.id,
        verification_status: verifyStatus,
        supervisor_notes: verifyNotes || undefined,
      });
      setClockLogs(prev => prev.map(l => l.id === verifyingLog.id
        ? { ...l, verification_status: verifyStatus, supervisor_notes: verifyNotes || null }
        : l
      ));
      setVerifyingLog(null);
      flash(verifyStatus === 'verified' ? 'Log verified.' : 'Log flagged for review.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleAcknowledge = async (logId: string) => {
    setProcessing(logId);
    try {
      await acknowledgeActivityLog(logId);
      setActLogs(prev => prev.map(l => l.id === logId
        ? { ...l, acknowledged_at: new Date().toISOString() }
        : l
      ));
      flash('Activity log acknowledged.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const selected = assignments.find(a => a.id === selectedId);
  const unverifiedCount = clockLogs.filter(l => l.clock_out_time && !l.verification_status).length;
  const unacknowledgedCount = actLogs.filter(l => !l.acknowledged_at).length;

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
              <h1>🔍 Field Supervisor Review</h1>
              <p className="admin-subtitle">Verify clock logs and acknowledge activity reports</p>
            </div>
          </header>

          {error && <div className="alert alert-error mb-4">{error}<button onClick={() => setError(null)}>×</button></div>}
          {success && <div className="alert alert-success mb-4">{success}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

            {/* Assignment list sidebar */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 14 }}>
                Assignments
              </div>
              {assignments.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>No assignments found.</div>
              ) : (
                assignments.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '12px 16px',
                      background: selectedId === a.id ? '#eff6ff' : 'transparent',
                      borderLeft: selectedId === a.id ? '3px solid #3b82f6' : '3px solid transparent',
                      border: 'none', borderTop: '1px solid #f3f4f6', cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.assignment_number}</div>
                    <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{a.title}</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{
                        background: ASSIGNMENT_STATUS_COLOR[a.status] + '22',
                        color: ASSIGNMENT_STATUS_COLOR[a.status],
                        fontSize: 10, padding: '1px 6px', borderRadius: 8
                      }}>
                        {ASSIGNMENT_STATUS_LABELS[a.status]}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Main content */}
            <div>
              {!selected ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                  <p>Select an assignment to review.</p>
                </div>
              ) : (
                <>
                  {/* Assignment header card */}
                  <div className="card mb-4">
                    <div className="card-body">
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.title}</div>
                      <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>
                        📍 {selected.location_name} · 👤 Supervisor: {selected.supervisor?.first_name} {selected.supervisor?.last_name}
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
                        {new Date(selected.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} → {new Date(selected.planned_end).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: 13 }}>
                        <span>{(selected.employees || []).length} staff assigned</span>
                        {unverifiedCount > 0 && <span style={{ color: '#f59e0b' }}>⚠️ {unverifiedCount} log{unverifiedCount !== 1 ? 's' : ''} need verification</span>}
                        {unacknowledgedCount > 0 && <span style={{ color: '#3b82f6' }}>📝 {unacknowledgedCount} activity log{unacknowledgedCount !== 1 ? 's' : ''} unread</span>}
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="tabs mb-4">
                    <button className={`tab ${tab === 'clock_logs' ? 'active' : ''}`} onClick={() => setTab('clock_logs')}>
                      🕐 Clock Logs ({clockLogs.length})
                      {unverifiedCount > 0 && <span style={{ marginLeft: 6, background: '#f59e0b', color: '#fff', fontSize: 11, padding: '0 5px', borderRadius: 8 }}>{unverifiedCount}</span>}
                    </button>
                    <button className={`tab ${tab === 'activity_logs' ? 'active' : ''}`} onClick={() => setTab('activity_logs')}>
                      📝 Activity Logs ({actLogs.length})
                      {unacknowledgedCount > 0 && <span style={{ marginLeft: 6, background: '#3b82f6', color: '#fff', fontSize: 11, padding: '0 5px', borderRadius: 8 }}>{unacknowledgedCount}</span>}
                    </button>
                  </div>

                  {dataLoading ? (
                    <div className="loading-container"><div className="loading-spinner" /></div>
                  ) : tab === 'clock_logs' ? (
                    <div className="card">
                      <div className="card-body" style={{ padding: 0 }}>
                        {clockLogs.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No clock logs yet for this assignment.</div>
                        ) : (
                          <table className="table">
                            <thead>
                              <tr><th>Employee</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Mileage</th><th>Verification</th><th></th></tr>
                            </thead>
                            <tbody>
                              {clockLogs.map(log => (
                                <tr key={log.id} style={{ background: log.verification_status === 'flagged' ? '#fef2f2' : undefined }}>
                                  <td style={{ fontWeight: 600, fontSize: 13 }}>
                                    {log.employee?.first_name} {log.employee?.last_name}
                                    <div style={{ fontSize: 11, color: '#6b7280' }}>{log.employee?.employee_id}</div>
                                  </td>
                                  <td style={{ fontSize: 12 }}>
                                    {new Date(log.clock_in_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    {log.clock_in_offline && <span style={{ display: 'block', fontSize: 10, color: '#f59e0b' }}>OFFLINE SYNC</span>}
                                    {log.clock_in_note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{log.clock_in_note}</div>}
                                    {log.clock_in_lat && <div style={{ fontSize: 10, color: '#9ca3af' }}>GPS: {log.clock_in_lat.toFixed(4)}, {log.clock_in_lng?.toFixed(4)}</div>}
                                  </td>
                                  <td style={{ fontSize: 12 }}>
                                    {log.clock_out_time
                                      ? <>
                                          {new Date(log.clock_out_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                          {log.clock_out_offline && <span style={{ display: 'block', fontSize: 10, color: '#f59e0b' }}>OFFLINE SYNC</span>}
                                          {log.end_report && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{log.end_report}</div>}
                                        </>
                                      : <span style={{ color: '#22c55e', fontSize: 12 }}>Still active</span>}
                                  </td>
                                  <td>{log.work_hours != null ? `${log.work_hours}h` : '—'}</td>
                                  <td>{log.mileage_km != null ? `${log.mileage_km} km` : '—'}</td>
                                  <td>
                                    {log.verification_status === 'verified' && <span style={{ color: '#22c55e', fontSize: 12 }}>✓ Verified</span>}
                                    {log.verification_status === 'flagged' && <span style={{ color: '#ef4444', fontSize: 12 }}>⚠ Flagged{log.supervisor_notes && `: ${log.supervisor_notes}`}</span>}
                                    {!log.verification_status && log.clock_out_time && <span style={{ color: '#9ca3af', fontSize: 12 }}>Pending</span>}
                                    {!log.clock_out_time && <span style={{ color: '#22c55e', fontSize: 12 }}>Active</span>}
                                  </td>
                                  <td>
                                    {log.clock_out_time && !log.verification_status && (
                                      <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => { setVerifyingLog(log); setVerifyStatus('verified'); setVerifyNotes(''); }}
                                        disabled={!!processing}
                                      >
                                        Verify
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="card">
                      <div className="card-body" style={{ padding: 0 }}>
                        {actLogs.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>No activity logs submitted yet.</div>
                        ) : (
                          actLogs.map(log => (
                            <div key={log.id} style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', background: !log.acknowledged_at ? '#fafbff' : undefined }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                                    {log.employee?.first_name} {log.employee?.last_name}
                                    <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8, fontSize: 12 }}>
                                      {new Date(log.log_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                  </div>
                                  <div style={{ marginTop: 8, fontSize: 13 }}>
                                    <div><strong>Activities:</strong> {log.activities_done}</div>
                                    {log.people_engaged && <div style={{ marginTop: 4 }}><strong>People engaged:</strong> {log.people_engaged}</div>}
                                    {log.issues_blockers && <div style={{ marginTop: 4, color: '#ef4444' }}><strong>Issues:</strong> {log.issues_blockers}</div>}
                                    {log.resources_used && <div style={{ marginTop: 4 }}><strong>Resources:</strong> {log.resources_used}</div>}
                                  </div>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                  {log.acknowledged_at ? (
                                    <span style={{ fontSize: 12, color: '#22c55e' }}>
                                      ✓ Acknowledged {new Date(log.acknowledged_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                                    </span>
                                  ) : (
                                    <button
                                      className="btn btn-outline btn-sm"
                                      onClick={() => handleAcknowledge(log.id)}
                                      disabled={processing === log.id}
                                    >
                                      {processing === log.id ? '…' : '✓ Acknowledge'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Verify Modal */}
      {verifyingLog && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3>Verify Clock Log</h3>
              <button className="modal-close" onClick={() => setVerifyingLog(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 13, background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 14 }}>
                <strong>{verifyingLog.employee?.first_name} {verifyingLog.employee?.last_name}</strong><br />
                In: {new Date(verifyingLog.clock_in_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}<br />
                Out: {verifyingLog.clock_out_time ? new Date(verifyingLog.clock_out_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}<br />
                Hours: {verifyingLog.work_hours ?? '—'}
                {verifyingLog.end_report && <div style={{ marginTop: 6 }}><strong>Report:</strong> {verifyingLog.end_report}</div>}
              </div>
              <div className="form-group">
                <label className="required">Verification Decision</label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {(['verified', 'flagged'] as const).map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="radio" name="vs" checked={verifyStatus === s} onChange={() => setVerifyStatus(s)} />
                      <span style={{ color: s === 'verified' ? '#22c55e' : '#ef4444', fontWeight: 600, textTransform: 'capitalize' }}>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Notes {verifyStatus === 'flagged' && <span style={{ color: '#ef4444' }}>*</span>}</label>
                <textarea className="form-control" rows={3} value={verifyNotes} onChange={e => setVerifyNotes(e.target.value)} placeholder={verifyStatus === 'flagged' ? 'Describe the discrepancy or issue…' : 'Optional verification notes…'} />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setVerifyingLog(null)}>Cancel</button>
              <button
                className="btn btn-primary"
                style={verifyStatus === 'flagged' ? { background: '#ef4444' } : undefined}
                onClick={handleVerify}
                disabled={!!processing || (verifyStatus === 'flagged' && !verifyNotes.trim())}
              >
                {processing ? '…' : verifyStatus === 'verified' ? '✓ Mark Verified' : '⚠ Flag Issue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
