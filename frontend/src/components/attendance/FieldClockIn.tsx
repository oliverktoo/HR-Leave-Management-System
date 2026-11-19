// Field Clock-In — Employee clocks in/out of a field assignment with GPS

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getMyFieldAssignments,
  fieldClockIn,
  fieldClockOut,
  getMyOpenClockIn,
  getCurrentGpsPosition,
  queueOfflineClockAction,
  syncOfflineClockQueue,
  getOfflineQueueSize,
  createActivityLog,
} from '../../services/fieldAssignmentService';
import {
  FieldAssignment,
  FieldClockLog,
  FieldClockInInput,
  DeliverableItem,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_COLOR,
} from '../../types/fieldAssignment';
import { useAuth } from '../../hooks/useAuth';
import { SelfieCapture } from './SelfieCapture';
import { supabase } from '../../lib/supabaseClient';
import {
  verifyFace,
  type VerificationResult,
} from '../../services/faceVerificationService';

// ── Countdown helpers ─────────────────────────────────────────────────────────

function getTimeUntil(target: string): { total: number; h: number; m: number; s: number } {
  const total = Math.max(0, new Date(target).getTime() - Date.now());
  const s = Math.floor((total / 1000) % 60);
  const m = Math.floor((total / 1000 / 60) % 60);
  const h = Math.floor(total / 1000 / 60 / 60);
  return { total, h, m, s };
}

function formatCountdown(target: string): string {
  const { total, h, m, s } = getTimeUntil(target);
  if (total <= 0) return '';
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function isBeforeStart(planned_start: string): boolean {
  return Date.now() < new Date(planned_start).getTime();
}

function isAfterEnd(planned_end: string): boolean {
  return Date.now() > new Date(planned_end).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────

export function FieldClockIn() {
  const { profile } = useAuth();

  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLog, setOpenLog] = useState<FieldClockLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [offlineQueueSize, setOfflineQueueSize] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Selfie capture state
  const [showSelfie, setShowSelfie] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);

  // Live clock — ticks every second to update countdowns and auto-unlock buttons
  const [_now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Clock-in form
  const [clockInNote, setClockInNote] = useState('');
  const [showClockInForm, setShowClockInForm] = useState(false);

  // Clock-out form
  const [showClockOutForm, setShowClockOutForm] = useState(false);
  const [clockOutNote, setClockOutNote] = useState('');
  const [endReport, setEndReport] = useState('');
  const [mileage, setMileage] = useState('');
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>([]);

  // Activity log form
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [actDone, setActDone] = useState('');
  const [actPeople, setActPeople] = useState('');
  const [actIssues, setActIssues] = useState('');
  const [actResources, setActResources] = useState('');

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getMyFieldAssignments();
      // Show active + in_progress assignments (active = published, may not have started yet)
      const visible = list.filter(a => ['active', 'in_progress'].includes(a.status));
      setAssignments(visible);
      setOfflineQueueSize(getOfflineQueueSize());
      // Auto-select if only one visible assignment
      if (visible.length === 1 && !selectedId) setSelectedId(visible[0].id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId) { setOpenLog(null); return; }
    getMyOpenClockIn(selectedId).then(setOpenLog).catch(() => setOpenLog(null));
  }, [selectedId]);

  useEffect(() => {
    const selected = assignments.find(a => a.id === selectedId);
    if (selected) {
      setDeliverables(selected.expected_deliverables.map(d => ({ ...d, completed: false })));
    }
  }, [selectedId, assignments]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncOfflineClockQueue();
      setOfflineQueueSize(getOfflineQueueSize());
      flash(`Synced ${result.synced} offline clock actions.`);
    } finally {
      setSyncing(false);
    }
  };

  // Called when user clicks "Clock In Now" — open selfie camera first
  const handleClockInClick = () => {
    setShowClockInForm(false);
    setShowSelfie(true);
  };

  // Called when selfie is captured — run face verification then proceed with clock-in
  const handleSelfieCapture = async (photoUrl: string, _blob: Blob, dataUrl: string) => {
    setSelfieUrl(photoUrl);
    setShowSelfie(false);

    // Fetch stored face descriptor for this user
    let storedDescriptor: number[] | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from('users_profile')
          .select('face_descriptor')
          .eq('id', user.id)
          .single();
        storedDescriptor = profileData?.face_descriptor ?? null;
      }
    } catch {
      // Verification is best-effort — proceed even if fetch fails
    }

    const result = await verifyFace(dataUrl, storedDescriptor);
    setVerificationResult(result);

    await doClockIn(photoUrl, result);
  };

  // Called when user skips selfie — proceed without photo
  const handleSelfieSkip = async () => {
    setShowSelfie(false);
    await doClockIn(undefined);
  };

  const doClockIn = async (photoUrl?: string, faceResult?: VerificationResult) => {
    if (!selectedId) return;
    setProcessing(true);
    setError(null);
    try {
      const pos = await getCurrentGpsPosition();
      const isOnline = navigator.onLine;
      const payload: FieldClockInInput = {
        assignment_id: selectedId,
        clock_in_lat: pos?.coords.latitude,
        clock_in_lng: pos?.coords.longitude,
        clock_in_accuracy: pos?.coords.accuracy,
        clock_in_note: clockInNote || undefined,
        clock_in_offline: !isOnline,
        clock_in_time: new Date().toISOString(),
        face_match_score: faceResult?.score ?? null,
        face_verified_auto: faceResult?.status === 'verified',
        clock_in_photo_url: photoUrl || undefined,
      };

      if (!isOnline) {
        queueOfflineClockAction({ type: 'clock_in', payload, queued_at: new Date().toISOString() });
        setOfflineQueueSize(getOfflineQueueSize());
        flash('You are offline. Clock-in has been saved locally and will sync when you reconnect.');
        setClockInNote('');
        return;
      }

      const log = await fieldClockIn(payload);
      setOpenLog(log);
      setClockInNote('');
      flash('Clocked in successfully!');
      await load();
    } catch (err: any) {
      setError(err.message || 'Clock-in failed');
    } finally {
      setProcessing(false);
    }
  };

  const doClockOut = async () => {
    if (!openLog) return;
    setProcessing(true);
    setError(null);
    try {
      const pos = await getCurrentGpsPosition();
      const isOnline = navigator.onLine;
      const payload = {
        log_id: openLog.id,
        clock_out_lat: pos?.coords.latitude,
        clock_out_lng: pos?.coords.longitude,
        clock_out_accuracy: pos?.coords.accuracy,
        clock_out_note: clockOutNote || undefined,
        clock_out_offline: !isOnline,
        clock_out_time: new Date().toISOString(),
        end_report: endReport || undefined,
        deliverables_status: deliverables,
        mileage_km: mileage ? parseFloat(mileage) : undefined,
      };

      if (!isOnline) {
        queueOfflineClockAction({ type: 'clock_out', payload, queued_at: new Date().toISOString() });
        setOfflineQueueSize(getOfflineQueueSize());
        flash('You are offline. Clock-out saved locally and will sync when you reconnect.');
        setShowClockOutForm(false);
        return;
      }

      await fieldClockOut(payload);
      setOpenLog(null);
      setShowClockOutForm(false);
      flash('Clocked out successfully. Great work!');
      await load();
    } catch (err: any) {
      setError(err.message || 'Clock-out failed');
    } finally {
      setProcessing(false);
    }
  };

  const submitActivity = async () => {
    if (!selectedId || !actDone.trim()) return;
    setProcessing(true);
    try {
      await createActivityLog({
        assignment_id: selectedId,
        activities_done: actDone,
        people_engaged: actPeople || undefined,
        issues_blockers: actIssues || undefined,
        resources_used: actResources || undefined,
      });
      setShowActivityForm(false);
      setActDone(''); setActPeople(''); setActIssues(''); setActResources('');
      flash('Activity log submitted.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const selected = assignments.find(a => a.id === selectedId);

  // ── Per-assignment lock state (re-evaluated every second via `now`) ─────────
  const locked   = selected ? isBeforeStart(selected.planned_start) : false;
  const overdue  = selected ? isAfterEnd(selected.planned_end) : false;
  const countdown = selected && locked ? formatCountdown(selected.planned_start) : '';

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
              <h1>📍 Field Clock-In</h1>
              <p className="admin-subtitle">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <button className="btn btn-outline" onClick={load}>↻ Refresh</button>
          </header>

          {error && <div className="alert alert-error mb-4">{error}<button onClick={() => setError(null)}>×</button></div>}
          {success && <div className="alert alert-success mb-4">{success}</div>}

          {/* Offline sync banner */}
          {offlineQueueSize > 0 && (
            <div className="alert mb-4" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>📡 {offlineQueueSize} offline clock action{offlineQueueSize !== 1 ? 's' : ''} pending sync.</span>
              <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
          )}

          {assignments.length === 0 ? (
            <div className="card">
              <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: 48 }}>📍</div>
                <h3>No active assignments</h3>
                <p>You have no active field assignments. Contact your HOD or HR if you believe this is incorrect.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Assignment selector — shown when more than one */}
              {assignments.length > 1 && (
                <div className="card mb-4">
                  <div className="card-header"><h3 className="card-title">Select Assignment</h3></div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {assignments.map(a => {
                      const aLocked = isBeforeStart(a.planned_start);
                      const cd = aLocked ? formatCountdown(a.planned_start) : '';
                      const isOOO = !!a.ooo_request_id;
                      const creatorName = a.creator
                        ? `${a.creator.first_name} ${a.creator.last_name}`
                        : null;
                      const supervisorName = a.supervisor
                        ? `${a.supervisor.first_name} ${a.supervisor.last_name}`
                        : null;
                      return (
                        <label key={a.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12,
                          border: `2px solid ${selectedId === a.id ? '#3b82f6' : '#e5e7eb'}`,
                          borderRadius: 8, cursor: 'pointer',
                          background: selectedId === a.id ? '#eff6ff' : '#fff',
                          opacity: aLocked ? 0.85 : 1
                        }}>
                          <input type="radio" name="assignment" checked={selectedId === a.id} onChange={() => setSelectedId(a.id)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600 }}>{a.assignment_number} — {a.title}</span>
                              {isOOO && (
                                <span style={{ fontSize: 10, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                                  📤 OOO
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>📍 {a.location_name}{a.location_county ? `, ${a.location_county}` : ''}</div>
                            <div style={{ fontSize: 12, marginTop: 2, color: '#6b7280' }}>
                              🕐 {new Date(a.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              {' → '}
                              {new Date(a.planned_end).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                            {(supervisorName || creatorName) && (
                              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                                {supervisorName && <span>👤 HOD: {supervisorName}</span>}
                                {supervisorName && creatorName && <span style={{ margin: '0 6px' }}>·</span>}
                                {creatorName && <span>✅ Approved by: {creatorName}</span>}
                              </div>
                            )}
                          </div>
                          {aLocked && cd && (
                            <span style={{
                              fontSize: 11, background: '#fef3c7', color: '#92400e',
                              border: '1px solid #fde68a', borderRadius: 6,
                              padding: '2px 8px', whiteSpace: 'nowrap', alignSelf: 'center'
                            }}>
                              🔒 Starts in {cd}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {selected && (
                <>
                  {/* Assignment details card */}
                  <div className="card mb-4" style={{ borderLeft: `4px solid ${ASSIGNMENT_STATUS_COLOR[selected.status]}` }}>
                    <div className="card-body">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Title row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{selected.title}</span>
                            {selected.ooo_request_id && (
                              <span style={{ fontSize: 11, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: 4, padding: '2px 8px' }}>
                                📤 OOO Assignment
                              </span>
                            )}
                          </div>

                          {/* Ref */}
                          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                            Ref: {selected.assignment_number}
                          </div>

                          {/* Location & schedule */}
                          <div style={{ display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: 13, color: '#4b5563' }}>
                              📍 <strong>{selected.location_name}</strong>{selected.location_county ? `, ${selected.location_county}` : ''}
                            </div>
                            <div style={{ fontSize: 13, color: '#4b5563' }}>
                              🕐 Start: <strong>{new Date(selected.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                            </div>
                            <div style={{ fontSize: 13, color: '#4b5563' }}>
                              🏁 End: <strong>{new Date(selected.planned_end).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                            </div>
                          </div>

                          {/* Creator / supervisor */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                            {selected.supervisor && (
                              <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10, color: '#9ca3af', marginBottom: 1 }}>HOD / Supervisor</span>
                                <span style={{ fontWeight: 600, color: '#374151' }}>
                                  👤 {selected.supervisor.first_name} {selected.supervisor.last_name}
                                </span>
                              </div>
                            )}
                            {selected.creator && (
                              <div style={{ fontSize: 12, color: '#6b7280' }}>
                                <span style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10, color: '#9ca3af', marginBottom: 1 }}>
                                  {selected.ooo_request_id ? 'Approved by (HR)' : 'Created by'}
                                </span>
                                <span style={{ fontWeight: 600, color: '#374151' }}>
                                  ✅ {selected.creator.first_name} {selected.creator.last_name}
                                </span>
                              </div>
                            )}
                          </div>

                          {selected.description && (
                            <div style={{ fontSize: 13, marginTop: 8, color: '#6b7280', fontStyle: 'italic' }}>
                              {selected.description}
                            </div>
                          )}
                        </div>
                        <span style={{
                          background: ASSIGNMENT_STATUS_COLOR[selected.status] + '22',
                          color: ASSIGNMENT_STATUS_COLOR[selected.status],
                          border: `1px solid ${ASSIGNMENT_STATUS_COLOR[selected.status]}`,
                          padding: '3px 12px', borderRadius: 12, fontSize: 13, flexShrink: 0
                        }}>
                          {ASSIGNMENT_STATUS_LABELS[selected.status]}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Lock banner — shown before planned_start ── */}
                  {locked && !openLog && (
                    <div className="card mb-4" style={{ borderLeft: '4px solid #f59e0b', background: '#fffbeb' }}>
                      <div className="card-body" style={{ textAlign: 'center', padding: '28px 20px' }}>
                        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#92400e', marginBottom: 4 }}>
                          Clock-In Not Yet Available
                        </div>
                        <div style={{ fontSize: 13, color: '#78350f', marginBottom: 16 }}>
                          This assignment starts on{' '}
                          <strong>{new Date(selected.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                        </div>
                        {countdown && (
                          <div style={{
                            display: 'inline-block',
                            background: '#fef3c7', border: '2px solid #f59e0b',
                            borderRadius: 12, padding: '10px 24px'
                          }}>
                            <div style={{ fontSize: 11, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Unlocks in</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#92400e', fontVariantNumeric: 'tabular-nums' }}>
                              {countdown}
                            </div>
                          </div>
                        )}
                        <div style={{ marginTop: 16 }}>
                          <button className="btn btn-primary btn-lg" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                            🔒 Clock In Now
                          </button>
                        </div>
                        <p style={{ fontSize: 12, color: '#a16207', marginTop: 10 }}>
                          The button will unlock automatically when the assignment start time is reached.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Normal clock-in/out UI — only after planned_start ── */}
                  {!locked && (
                    <>
                      {/* Overdue notice — past planned_end but still clocked in */}
                      {overdue && openLog && (
                        <div className="alert mb-4" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 16px', fontSize: 13, color: '#991b1b' }}>
                          ⚠️ This assignment's planned end time has passed. Please clock out and submit your report.
                        </div>
                      )}

                      {openLog ? (
                        <div className="card mb-4" style={{ borderLeft: '4px solid #22c55e', background: '#f0fdf4' }}>
                          <div className="card-body">
                            <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 4 }}>🟢 Currently Clocked In</div>
                            <div style={{ fontSize: 13 }}>
                              Since: <strong>{new Date(openLog.clock_in_time).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong>
                              {' · '}
                              Duration: <strong>{(() => {
                                const ms = Date.now() - new Date(openLog.clock_in_time).getTime();
                                const h = Math.floor(ms / 3600000);
                                const m = Math.floor((ms % 3600000) / 60000);
                                return h > 0 ? `${h}h ${m}m` : `${m}m`;
                              })()}</strong>
                            </div>
                            {openLog.clock_in_lat && (
                              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                                GPS: {openLog.clock_in_lat.toFixed(5)}, {openLog.clock_in_lng?.toFixed(5)}
                              </div>
                            )}
                            {/* Selfie thumbnail if captured at clock-in */}
                            {selfieUrl && (
                              <div style={{ marginTop: 10 }}>
                                <img
                                  src={selfieUrl}
                                  alt="Clock-in selfie"
                                  style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', border: '2px solid #bbf7d0' }}
                                />
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Clock-in photo captured</div>
                              </div>
                            )}
                            {/* Face verification badge */}
                            {verificationResult && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                marginTop: 8, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                                ...(verificationResult.status === 'verified'
                                  ? { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }
                                  : verificationResult.status === 'uncertain'
                                  ? { background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a' }
                                  : verificationResult.status === 'flagged'
                                  ? { background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5' }
                                  : { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }),
                              }}>
                                {verificationResult.status === 'verified' && '\u2713 Identity Verified'}
                                {verificationResult.status === 'uncertain' && '\u26a0 Low confidence \u2014 HR will review'}
                                {verificationResult.status === 'flagged' && '\u2717 Face mismatch \u2014 flagged'}
                                {verificationResult.status === 'no_reference' && '\u2139 No face registered'}
                                {verificationResult.status === 'no_face' && '\u2139 No face detected'}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                              <button className="btn btn-danger" onClick={() => setShowClockOutForm(true)}>🏁 Clock Out</button>
                              <button className="btn btn-outline" onClick={() => setShowActivityForm(true)}>📝 Log Activity</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="card mb-4">
                          <div className="card-body" style={{ textAlign: 'center', padding: '28px 20px' }}>
                            <div style={{ fontSize: 40, marginBottom: 8 }}>📍</div>
                            <p style={{ marginBottom: 12, color: '#6b7280' }}>You are not currently clocked in to this assignment.</p>
                            <button className="btn btn-primary btn-lg" onClick={() => setShowClockInForm(true)}>
                              📍 Clock In Now
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

        </div>
      </main>

      {/* ── Clock-In Modal ───────────────────────────────────────────────────── */}
      {showClockInForm && selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>📍 Clock In — {selected.title}</h3>
              <button className="modal-close" onClick={() => setShowClockInForm(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                <div style={{ color: '#374151', marginBottom: 4 }}>
                  📍 {selected.location_name}{selected.location_county ? `, ${selected.location_county}` : ''}
                </div>
                <div style={{ color: '#6b7280' }}>
                  🕐 {new Date(selected.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' → '}
                  {new Date(selected.planned_end).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
                {selected.supervisor && (
                  <div style={{ color: '#6b7280', marginTop: 4 }}>
                    👤 HOD: <strong>{selected.supervisor.first_name} {selected.supervisor.last_name}</strong>
                    {selected.creator && (
                      <span style={{ marginLeft: 12 }}>
                        ✅ {selected.ooo_request_id ? 'HR: ' : 'By: '}
                        <strong>{selected.creator.first_name} {selected.creator.last_name}</strong>
                      </span>
                    )}
                  </div>
                )}
                <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 6 }}>Your GPS location will be recorded at clock-in.</div>
              </div>
              <div className="form-group">
                <label>On-Ground Status Note</label>
                <textarea
                  className="form-control" rows={2} value={clockInNote}
                  onChange={e => setClockInNote(e.target.value)}
                  placeholder="e.g. Arrived at venue, meeting with county FA officers"
                />
              </div>
              <div style={{ padding: '10px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, fontSize: 13, color: '#0369a1', marginBottom: 4 }}>
                📸 A selfie photo will be requested to verify your presence. You may skip if camera is unavailable.
              </div>
              {!navigator.onLine && (
                <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  ⚠️ You appear to be offline. Clock-in will be saved locally with your current timestamp.
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowClockInForm(false)}>Cancel</button>
              <button className="btn btn-outline" onClick={() => { setShowClockInForm(false); doClockIn(undefined); }} disabled={processing}>
                Skip Photo
              </button>
              <button className="btn btn-primary" onClick={handleClockInClick} disabled={processing}>
                {processing ? 'Locating…' : '📸 Take Selfie & Clock In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clock-Out Modal ──────────────────────────────────────────────────── */}
      {showClockOutForm && selected && openLog && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>🏁 Clock Out & Report — {selected.title}</h3>
              <button className="modal-close" onClick={() => setShowClockOutForm(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Work hours preview */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
                <strong>⏱ Time on assignment:</strong>{' '}
                {(() => {
                  const ms = Date.now() - new Date(openLog.clock_in_time).getTime();
                  const h = Math.floor(ms / 3600000);
                  const m = Math.floor((ms % 3600000) / 60000);
                  return `${h}h ${m}m (clocked in at ${new Date(openLog.clock_in_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })})`;
                })()}
              </div>

              <div className="form-group">
                <label>Clock-Out Note</label>
                <input className="form-control" value={clockOutNote} onChange={e => setClockOutNote(e.target.value)} placeholder="e.g. All activities completed, departing venue" />
              </div>
              <div className="form-group">
                <label>End-of-Assignment Report</label>
                <textarea className="form-control" rows={3} value={endReport} onChange={e => setEndReport(e.target.value)} placeholder="What was accomplished vs. planned? Any follow-up actions?" />
              </div>
              {deliverables.length > 0 && (
                <div className="form-group">
                  <label>Deliverables Checklist</label>
                  {deliverables.map((d, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', cursor: 'pointer' }}>
                      <input
                        type="checkbox" checked={d.completed}
                        onChange={e => setDeliverables(prev => prev.map((x, idx) => idx === i ? { ...x, completed: e.target.checked } : x))}
                        style={{ marginTop: 2 }}
                      />
                      <span style={{ fontSize: 13 }}>{d.item}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="form-group">
                <label>Mileage (km)</label>
                <input type="number" step="0.1" className="form-control" value={mileage} onChange={e => setMileage(e.target.value)} placeholder="Distance travelled" />
              </div>
              {!navigator.onLine && (
                <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                  ⚠️ Offline — clock-out will be saved locally and synced when you reconnect.
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowClockOutForm(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doClockOut} disabled={processing}>
                {processing ? 'Processing…' : '🏁 Confirm Clock Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Activity Log Modal ───────────────────────────────────────────────── */}
      {showActivityForm && selectedId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>📝 Daily Activity Log</h3>
              <button className="modal-close" onClick={() => setShowActivityForm(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="required">Activities Done Today</label>
                <textarea className="form-control" rows={3} value={actDone} onChange={e => setActDone(e.target.value)} placeholder="What did you do today?" />
              </div>
              <div className="form-group">
                <label>People / Organisations Engaged</label>
                <textarea className="form-control" rows={2} value={actPeople} onChange={e => setActPeople(e.target.value)} placeholder="Names and organisations of people you met" />
              </div>
              <div className="form-group">
                <label>Issues / Blockers</label>
                <textarea className="form-control" rows={2} value={actIssues} onChange={e => setActIssues(e.target.value)} placeholder="Any challenges or issues encountered" />
              </div>
              <div className="form-group">
                <label>Resources Used</label>
                <input className="form-control" value={actResources} onChange={e => setActResources(e.target.value)} placeholder="e.g. Fuel KES 2,500 · Venue hire KES 5,000" />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setShowActivityForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitActivity} disabled={processing || !actDone.trim()}>
                {processing ? 'Saving…' : '📝 Submit Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Selfie Capture ───────────────────────────────────────────────────── */}
      {showSelfie && (
        <SelfieCapture
          userId={profile?.id ?? ''}
          context="field_clock_in"
          onCapture={handleSelfieCapture}
          onCancel={handleSelfieSkip}
        />
      )}
    </div>
  );
}
