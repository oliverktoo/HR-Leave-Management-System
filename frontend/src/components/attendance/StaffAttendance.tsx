import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  getTodayAttendance,
  checkIn,
  mobileCheckIn,
  checkOut,
  checkLocationForCheckout,
  getAttendanceHistory,
  getAttendanceStats,
  isLateDepatureWindow,
  type AttendanceRecord
} from '../../services/attendanceService';
import { Capacitor } from '@capacitor/core';
import NotificationBell from '../notifications/NotificationBell';
import { SelfieCapture } from './SelfieCapture';
import { supabase } from '../../lib/supabaseClient';
import {
  verifyFace,
  type VerificationResult,
} from '../../services/faceVerificationService';

export const StaffAttendance = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [recentHistory, setRecentHistory] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warning, setWarning] = useState('');
  const [notes, setNotes] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [locationChecking, setLocationChecking] = useState(false);
  const [showSelfie, setShowSelfie] = useState(false);
  const [, setSelfieUrl] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [locationStatus, setLocationStatus] = useState<{
    geofenceEnabled: boolean;
    isAtOffice: boolean | null;
    distance?: number;
    officeName?: string;
    projectedCheckoutTime?: string;
  } | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // ─── Late departure nudge (7–8pm EAT window) ─────────────────────────────
  useEffect(() => {
    if (!todayAttendance || todayAttendance.check_out_time) return;

    const checkLateDeparture = async () => {
      const late = await isLateDepatureWindow();
      if (late) {
        setWarning('It is after 7pm. Please check out before 8pm or the system will auto-checkout based on your last recorded office presence.');
      }
    };

    // Check immediately and then every minute
    checkLateDeparture();
    const interval = setInterval(checkLateDeparture, 60 * 1000);
    return () => clearInterval(interval);
  }, [todayAttendance]);

  useEffect(() => {
    if (user) {
      loadAttendanceData();
    }
  }, [user]);

  const loadAttendanceData = async () => {
    setLoading(true);
    try {
      // Load today's attendance
      const { data: today } = await getTodayAttendance();
      setTodayAttendance(today);

      // Load recent history (last 7 days)
      const { data: history } = await getAttendanceHistory(undefined, undefined, 7);
      setRecentHistory(history || []);

      // Load stats
      const { data: statsData } = await getAttendanceStats();
      setStats(statsData);
    } catch (err) {
      console.error('Error loading attendance data:', err);
      setError('Failed to load attendance data');
    } finally {
      setLoading(false);
    }
  };

  // Step 0: Open selfie modal before check-in
  const handleCheckIn = () => {
    setError('');
    setSuccess('');
    setShowSelfie(true);
  };

  // Step 1a: Selfie captured — verify face then check in
  const handleSelfieCapture = async (photoUrl: string, _blob: Blob, dataUrl: string) => {
    setSelfieUrl(photoUrl);
    setShowSelfie(false);
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      // Fetch stored face descriptor
      let storedDescriptor: number[] | null = null;
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profileData } = await supabase
            .from('users_profile')
            .select('face_descriptor')
            .eq('id', authUser.id)
            .single();
          storedDescriptor = profileData?.face_descriptor ?? null;
        }
      } catch {
        // Best-effort — proceed even if descriptor fetch fails
      }

      const result = await verifyFace(dataUrl, storedDescriptor);
      setVerificationResult(result);

      const checkInFunction = Capacitor.isNativePlatform() ? mobileCheckIn : checkIn;
      const checkInResult = await checkInFunction({
        notes,
        selfie_url: photoUrl,
        face_match_score: result.score,
        face_verified_auto: result.autoVerified,
      });

      if (checkInResult.error) {
        setError((checkInResult.error as any).message || 'Failed to check in');
      } else {
        const message = (checkInResult as any).offline
          ? 'Checked in offline. Will sync when online.'
          : 'Successfully checked in!';
        setSuccess(message);
        setTodayAttendance(checkInResult.data);
        setNotes('');
        if (!(checkInResult as any).offline) {
          await loadAttendanceData();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking in');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 1b: User skips selfie — check in without photo
  const handleSelfieSkip = async () => {
    setShowSelfie(false);
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      const checkInFunction = Capacitor.isNativePlatform() ? mobileCheckIn : checkIn;
      const result = await checkInFunction({ notes });

      if (result.error) {
        setError((result.error as any).message || 'Failed to check in');
      } else {
        const message = (result as any).offline
          ? 'Checked in offline. Will sync when online.'
          : 'Successfully checked in!';
        setSuccess(message);
        setTodayAttendance(result.data);
        setNotes('');
        if (!(result as any).offline) {
          await loadAttendanceData();
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking in');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 1: Check location, show confirmation modal
  const handleCheckOutClick = async () => {
    setShowCheckoutConfirm(true);
    setLocationChecking(true);
    setLocationStatus(null);
    try {
      const status = await checkLocationForCheckout();
      setLocationStatus(status);
    } catch {
      setLocationStatus({ geofenceEnabled: false, isAtOffice: null });
    } finally {
      setLocationChecking(false);
    }
  };

  // Step 2: User confirmed — proceed with actual checkout
  const handleCheckOut = async () => {
    setShowCheckoutConfirm(false);
    setLocationStatus(null);
    setActionLoading(true);
    setError('');
    setSuccess('');
    setWarning('');

    try {
      const result = await checkOut(notes);
      
      if (result.error) {
        setError((result.error as any).message || 'Failed to check out');
      } else {
        if ((result as any).warning) {
          setWarning((result as any).warning);
          setSuccess('Checked out successfully.');
        } else {
          setSuccess('Successfully checked out!');
        }
        setTodayAttendance(result.data);
        setNotes('');
        await loadAttendanceData();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking out');
    } finally {
      setActionLoading(false);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-GB', {
      timeZone: 'Africa/Nairobi',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'present':
        return 'badge-success';
      case 'late':
        return 'badge-warning';
      case 'half_day':
        return 'badge-info';
      case 'absent':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  const calculateWorkDuration = () => {
    if (!todayAttendance?.check_in_time) return '0h 0m';
    
    const checkIn = new Date(todayAttendance.check_in_time);
    const checkOut = todayAttendance.check_out_time 
      ? new Date(todayAttendance.check_out_time)
      : currentTime;
    
    const diff = checkOut.getTime() - checkIn.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours}h ${minutes}m`;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading attendance data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">FKF HR</h1>
          <p className="sidebar-subtitle">Leave Management System</p>
        </div>
        
        <nav className="sidebar-nav">
          {(profile?.role === 'hr_admin' || profile?.role === 'super_admin') && (
            <>
              <div className="nav-item">
                <button 
                  onClick={() => navigate('/admin/dashboard')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">🏛️</span>
                  Admin Dashboard
                </button>
              </div>
              <div className="nav-divider"></div>
            </>
          )}
          
          <div className="nav-item">
            <button 
              onClick={() => navigate('/dashboard')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🏠</span>
              Dashboard
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/request-leave')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📝</span>
              Request Leave
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/attendance')}
              className="nav-link nav-link-active w-full text-left"
            >
              <span className="nav-icon">🕐</span>
              Attendance
            </button>
          </div>
          {(profile?.role === 'hod' || profile?.role === 'hr_admin' || profile?.role === 'super_admin') && (
            <>
              <div className="nav-item">
                <button 
                  onClick={() => navigate('/approvals')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">✅</span>
                  Approvals
                </button>
              </div>
              <div className="nav-item">
                <button 
                  onClick={() => navigate('/team-calendar')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">📅</span>
                  Team Calendar
                </button>
              </div>
            </>
          )}
        </nav>
        
        <div className="sidebar-footer">
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.75rem', borderRadius: '10px',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            marginBottom: '0.75rem'
          }}>
            <div style={{
              width: '2.5rem', height: '2.5rem', borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.9rem', fontWeight: 700, color: 'white',
              border: '2px solid rgba(255,255,255,0.25)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              {profile?.first_name?.charAt(0)?.toUpperCase() || ''}{profile?.last_name?.charAt(0)?.toUpperCase() || ''}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700, color: 'white', fontSize: '0.875rem',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.3
              }} title={`${profile?.first_name} ${profile?.last_name}`}>
                {profile?.first_name} {profile?.last_name}
              </div>
              <div style={{
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.3, marginTop: '1px',
                textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>
                {profile?.role === 'super_admin' ? 'System Administrator' :
                 profile?.role === 'hr_admin' ? 'HR Administrator' :
                 profile?.role === 'hod' ? 'Head of Department' :
                 profile?.role === 'fleet_manager' ? 'Fleet Manager' :
                 profile?.role === 'driver' ? 'Driver' :
                 profile?.role === 'finance' ? 'Finance Officer' :
                 profile?.role === 'ceo' ? 'Chief Executive Officer' :
                 'Employee'}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.5rem', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)',
              color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontWeight: 500,
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.35)';
              (e.currentTarget as HTMLButtonElement).style.color = 'white';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)';
              (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)';
            }}
          >
            <span style={{ fontSize: '1rem' }}>🚪</span>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="content">
        <div className="page-header">
          <div>
            <h1 className="page-title">
              <span style={{ marginRight: '0.5rem' }}>🕐</span>
              Staff Attendance
            </h1>
            <p className="page-subtitle">Track your daily attendance and work hours</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '600', color: 'var(--gray-900)' }}>
                {currentTime.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                {new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <NotificationBell />
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>❌</span>
              <span style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{error}</span>
            </div>
            {(error.includes('Location permission') || error.includes('Location services')) && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(239,68,68,0.2)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                  onClick={() => { setError(''); handleCheckIn(); }}
                >
                  🔄 Try Again
                </button>
                <button
                  className="btn btn-outline"
                  style={{ fontSize: '0.85rem', padding: '6px 14px' }}
                  onClick={() => window.location.reload()}
                >
                  ↺ Refresh Page
                </button>
              </div>
            )}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>✅</span>
            <span>{success}</span>
          </div>
        )}

        {warning && (
          <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>⚠️</span>
            <span>{warning}</span>
          </div>
        )}

        <div className="dashboard-grid">
          {/* Check In/Out Card */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title">Today's Attendance</h3>
                {todayAttendance && (
                  <span className={`badge ${ getStatusBadgeClass(todayAttendance.status)}`}>
                    {todayAttendance.status.replace('_', ' ').toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            <div>
              {!todayAttendance ? (
                <>
                  <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                    <span style={{ fontSize: '4rem' }}>🕐</span>
                    <h3 style={{ margin: '1rem 0 0.5rem', color: 'var(--gray-900)' }}>Ready to start your day?</h3>
                    <p style={{ color: 'var(--gray-600)' }}>Check in to mark your attendance for today</p>
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label htmlFor="notes" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Notes (Optional)</label>
                    <textarea
                      id="notes"
                      className="form-input"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about your shift..."
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--gray-300)', fontSize: '0.875rem' }}
                    />
                  </div>

                  <button
                    onClick={handleCheckIn}
                    disabled={actionLoading}
                    className="btn btn-success"
                    style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}
                  >
                    {actionLoading ? (
                      <>
                        <span className="loading-spinner"></span>
                        Checking In...
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>✅</span>
                        Check In Now
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                      <span style={{ fontWeight: '500', color: 'var(--gray-700)' }}>Check In Time:</span>
                      <span style={{ fontWeight: '600', color: 'var(--primary-600)', fontSize: '1.125rem' }}>{formatTime(todayAttendance.check_in_time)}</span>
                    </div>
                    {/* Face verification badge — shown after a selfie check-in this session */}
                    {verificationResult && (
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, width: 'fit-content',
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
                        {verificationResult.status === 'no_face' && '\u2139 No face detected in photo'}
                      </div>
                    )}

                    {todayAttendance.check_out_time ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                          <span style={{ fontWeight: '500', color: 'var(--gray-700)' }}>Check Out Time:</span>
                          <span style={{ fontWeight: '600', color: 'var(--danger-600)', fontSize: '1.125rem' }}>{formatTime(todayAttendance.check_out_time)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--success-50)', borderRadius: '0.5rem', border: '1px solid var(--success-200)' }}>
                          <span style={{ fontWeight: '500', color: 'var(--success-700)' }}>Total Hours:</span>
                          <span style={{ fontWeight: '700', color: 'var(--success-700)', fontSize: '1.25rem' }}>
                            {todayAttendance.work_hours?.toFixed(2)} hours
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: 'var(--primary-50)', borderRadius: '0.5rem', border: '1px solid var(--primary-200)' }}>
                        <span style={{ fontWeight: '500', color: 'var(--primary-700)' }}>Current Duration:</span>
                        <span style={{ fontWeight: '700', color: 'var(--primary-700)', fontSize: '1.25rem' }}>{calculateWorkDuration()}</span>
                      </div>
                    )}

                    {todayAttendance.notes && (
                      <div style={{ padding: '1rem', backgroundColor: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                        <span style={{ fontWeight: '500', color: 'var(--gray-700)', display: 'block', marginBottom: '0.5rem' }}>Notes:</span>
                        <span style={{ color: 'var(--gray-600)' }}>{todayAttendance.notes}</span>
                      </div>
                    )}
                  </div>

                  {!todayAttendance.check_out_time && (
                    <>
                      <div className="form-group" style={{ marginTop: '1.5rem' }}>
                        <label htmlFor="checkout-notes" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Notes (Optional)</label>
                        <textarea
                          id="checkout-notes"
                          className="form-input"
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Add any notes before checking out..."
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--gray-300)', fontSize: '0.875rem' }}
                        />
                      </div>

                      <button
                        onClick={handleCheckOutClick}
                        disabled={actionLoading}
                        className="btn btn-danger"
                        style={{ width: '100%', padding: '1rem', fontSize: '1rem', marginTop: '1rem' }}
                      >
                        {actionLoading ? (
                          <>
                            <span className="loading-spinner"></span>
                            Checking Out...
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>🚪</span>
                            Check Out Now
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {todayAttendance.check_out_time && (
                    <div style={{ textAlign: 'center', padding: '2rem 0', marginTop: '1rem' }}>
                      <span style={{ fontSize: '3rem' }}>✅</span>
                      <h3 style={{ margin: '1rem 0 0.5rem', color: 'var(--success-700)' }}>All done for today!</h3>
                      <p style={{ color: 'var(--gray-600)' }}>You've successfully checked out. Have a great day!</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Monthly Stats Card */}
          {stats && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <span style={{ marginRight: '0.5rem' }}>📊</span>
                  This Month's Summary
                </h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', padding: '1rem 0' }}>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-600)' }}>{stats.totalDays}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>Total Days</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--success-600)' }}>{stats.presentDays}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>On Time</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--warning-600)' }}>{stats.lateDays}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>Late Arrivals</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--gray-900)' }}>{stats.totalHours.toFixed(1)}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>Total Hours</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--primary-600)' }}>{stats.averageHours.toFixed(1)}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>Avg Hours/Day</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '2rem', fontWeight: '700', color: 'var(--warning-600)' }}>{stats.halfDays}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>Half Days</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Recent History */}
        {recentHistory.length > 0 && (
          <div className="card mb-6" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              <h3 className="card-title">
                <span style={{ marginRight: '0.5rem' }}>📅</span>
                Recent Attendance History
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Date</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Check In</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Check Out</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Hours</th>
                    <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: 'var(--gray-700)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((record) => (
                    <tr key={record.id} style={{ borderBottom: '1px solid var(--gray-200)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{new Date(record.date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{formatTime(record.check_in_time)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                        {record.check_out_time 
                          ? formatTime(record.check_out_time)
                          : <span style={{ color: 'var(--gray-500)' }}>Not checked out</span>
                        }
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>
                        {record.work_hours 
                          ? `${record.work_hours.toFixed(2)}h`
                          : <span style={{ color: 'var(--gray-500)' }}>-</span>
                        }
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span className={`badge ${getStatusBadgeClass(record.status)}`}>
                          {record.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Checkout Confirmation Modal */}

    {/* Selfie Capture modal for check-in */}
    {showSelfie && user && (
      <div style={{ position: 'relative', zIndex: 1200 }}>
        <SelfieCapture
          userId={user.id}
          context="check_in"
          onCapture={handleSelfieCapture}
          onCancel={handleSelfieSkip}
          onSkip={handleSelfieSkip}
        />
      </div>
    )}

    {showCheckoutConfirm && (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'var(--white)', borderRadius: '1rem', padding: '2rem',
          width: '90%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}>
          <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.25rem', fontWeight: '700', color: 'var(--gray-900)' }}>
            🚪 Confirm Check Out
          </h3>

          {locationChecking ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 1rem' }}></div>
              <p style={{ color: 'var(--gray-600)', margin: 0 }}>Verifying your location...</p>
            </div>
          ) : locationStatus?.geofenceEnabled ? (
            locationStatus.isAtOffice === true ? (
              <div style={{
                backgroundColor: 'var(--success-50)', border: '1px solid var(--success-200)',
                borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem'
              }}>
                <p style={{ margin: 0, color: 'var(--success-700)', fontWeight: '600' }}>
                  ✅ You are at {locationStatus.officeName || 'the office'}
                </p>
                <p style={{ margin: '0.5rem 0 0', color: 'var(--success-600)', fontSize: '0.875rem' }}>
                  Checkout time will be recorded as now.
                </p>
              </div>
            ) : locationStatus.isAtOffice === false ? (
              <div style={{
                backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem'
              }}>
                <p style={{ margin: 0, color: '#991b1b', fontWeight: '700', fontSize: '1rem' }}>
                  🚫 Sign-out blocked — you are outside the office
                </p>
                <p style={{ margin: '0.5rem 0 0', color: '#b91c1c', fontSize: '0.875rem' }}>
                  {locationStatus.distance !== undefined
                    ? `You are ${locationStatus.distance}m from ${locationStatus.officeName || 'the office'}.`
                    : `You are outside ${locationStatus.officeName || 'the office'}.`}
                </p>
                <p style={{ margin: '0.5rem 0 0', color: '#7f1d1d', fontSize: '0.875rem', fontWeight: '500' }}>
                  Please return to the office premises to sign out. Contact HR if you need an override.
                </p>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'var(--gray-50)', border: '1px solid var(--gray-200)',
                borderRadius: '0.75rem', padding: '1rem', marginBottom: '1.5rem'
              }}>
                <p style={{ margin: 0, color: 'var(--gray-600)', fontSize: '0.875rem' }}>
                  📍 Could not determine your location. Checkout will proceed normally.
                </p>
              </div>
            )
          ) : (
            <p style={{ color: 'var(--gray-600)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              Are you sure you want to check out?
            </p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => { setShowCheckoutConfirm(false); setLocationStatus(null); }}
              className="btn btn-secondary"
              style={{ flex: 1, padding: '0.75rem' }}
            >
              Cancel
            </button>
            <button
              onClick={handleCheckOut}
              disabled={locationChecking || locationStatus?.isAtOffice === false}
              className="btn btn-danger"
              style={{ flex: 1, padding: '0.75rem', opacity: locationStatus?.isAtOffice === false ? 0.4 : 1, cursor: locationStatus?.isAtOffice === false ? 'not-allowed' : 'pointer' }}
            >
              {locationStatus?.isAtOffice === false ? 'Cannot Sign Out' : 'Confirm Check Out'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default StaffAttendance;
