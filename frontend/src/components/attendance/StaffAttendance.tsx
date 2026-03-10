import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  getTodayAttendance, 
  checkIn, 
  mobileCheckIn, 
  checkOut, 
  getAttendanceHistory,
  getAttendanceStats,
  updateOfficePresence,
  type AttendanceRecord 
} from '../../services/attendanceService';
import { Capacitor } from '@capacitor/core';
import NotificationBell from '../notifications/NotificationBell';

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

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Track office presence every 2 minutes when checked in (on native platforms)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !todayAttendance || todayAttendance.check_out_time) {
      return;
    }

    const trackPresence = async () => {
      try {
        const { geofencingService } = await import('../../services/geofencingService');
        const officeCheck = await geofencingService.checkIfAtOffice();
        
        if (officeCheck.isAtOffice) {
          await updateOfficePresence();
          console.log('📍 Office presence updated');
        }
      } catch (error) {
        console.error('Error tracking office presence:', error);
      }
    };

    // Track immediately and then every 2 minutes
    trackPresence();
    const interval = setInterval(trackPresence, 2 * 60 * 1000); // 2 minutes

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

  const handleCheckIn = async () => {
    setActionLoading(true);
    setError('');
    setSuccess('');

    try {
      // Use mobile check-in on native platforms, regular check-in on web
      const checkInFunction = Capacitor.isNativePlatform() ? mobileCheckIn : checkIn;
      const result = await checkInFunction({ notes });
      
      if (result.error) {
        setError((result.error as any).message || 'Failed to check in');
      } else {
        // Show appropriate success message based on online/offline status
        const message = (result as any).offline 
          ? 'Checked in offline. Will sync when online.' 
          : 'Successfully checked in!';
        setSuccess(message);
        setTodayAttendance(result.data);
        setNotes('');
        
        // Only reload if online (offline records don't show in Supabase yet)
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

  const handleCheckOut = async () => {
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
    return new Date(dateString).toLocaleTimeString('en-US', {
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
          <div className="user-profile">
            <div className="user-avatar">
              {profile?.first_name?.charAt(0)?.toUpperCase() || ''}{profile?.last_name?.charAt(0)?.toUpperCase() || ''}
            </div>
            <div className="user-info">
              <div className="user-name">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="user-role">
                {profile?.role === 'super_admin' ? 'SUPER ADMIN' : 
                 profile?.role === 'hr_admin' ? 'HR ADMIN' :
                 profile?.role === 'hod' ? 'HEAD OF DEPARTMENT' :
                 'EMPLOYEE'}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="btn btn-outline mt-3 w-full sign-out-btn"
          >
            <span className="nav-icon">🚪</span>
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
                {currentTime.toLocaleTimeString()}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--gray-600)' }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </div>
            </div>
            <NotificationBell />
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>❌</span>
            <span>{error}</span>
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
                        onClick={handleCheckOut}
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
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem' }}>{new Date(record.date).toLocaleDateString()}</td>
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
  );
};

export default StaffAttendance;
