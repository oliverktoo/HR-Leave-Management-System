import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getLeaveBalances, getLeaveRequests } from '../../services/leaveService';
import { getTodayAttendance } from '../../services/attendanceService';
import { formatEmployeeId } from '../../utils/formatters';
import NotificationBell from '../notifications/NotificationBell';

export const Dashboard = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState([]);
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showClockInReminder, setShowClockInReminder] = useState(false);

  useEffect(() => {
    loadDashboardData();
    checkClockInStatus();

    // Listen for leave request updates
    const handleLeaveRequestUpdate = () => {
      console.log('Leave request updated, refreshing employee dashboard...');
      loadDashboardData();
    };

    window.addEventListener('leaveRequestUpdated', handleLeaveRequestUpdate);

    return () => {
      window.removeEventListener('leaveRequestUpdated', handleLeaveRequestUpdate);
    };
  }, [profile?.id]);

  const checkClockInStatus = async () => {
    if (!profile?.id) return;
    // Only show for non-admin roles (employees and drivers need to clock in)
    const adminRoles = ['super_admin', 'hr_admin'];
    if (adminRoles.includes(profile?.role)) return;
    // Only show once per session
    const sessionKey = `clockin_reminder_dismissed_${new Date().toDateString()}`;
    if (sessionStorage.getItem(sessionKey)) return;
    try {
      const { data: todayRecord } = await getTodayAttendance();
      if (!todayRecord) {
        setShowClockInReminder(true);
      }
    } catch {
      // non-critical — don't show reminder on error
    }
  };

  const dismissClockInReminder = () => {
    const sessionKey = `clockin_reminder_dismissed_${new Date().toDateString()}`;
    sessionStorage.setItem(sessionKey, '1');
    setShowClockInReminder(false);
  };

  const loadDashboardData = async () => {
    if (!profile?.id) return;

    setLoading(true);
    const [balancesResult, requestsResult] = await Promise.all([
      getLeaveBalances(profile.id),
      getLeaveRequests(profile.id, { limit: 5 }),
    ]);

    if (balancesResult.data) setBalances(balancesResult.data);
    if (requestsResult.data) setRecentRequests(requestsResult.data.slice(0, 5));
    setLoading(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const toggleSidebar = () => {
    console.log('Toggle sidebar clicked! Current state:', sidebarOpen);
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    console.log('New sidebar state:', newState);
  };

  const closeSidebar = () => {
    console.log('Closing sidebar');
    setSidebarOpen(false);
  };

  const handleNavigation = (path) => {
    navigate(path);
    closeSidebar();
  };

  // Calculate total available days across all leave types
  const totalAvailable = balances.reduce((sum, b) => {
    return sum + (b.annual_allocation + b.carryforward_days - b.used_days - b.pending_days);
  }, 0);

  const totalUsed = balances.reduce((sum, b) => sum + b.used_days, 0);
  const totalPending = balances.reduce((sum, b) => sum + b.pending_days, 0);

  return (
    <div className="app">

      {/* ── Clock-in reminder popup ───────────────────────────────────────── */}
      {showClockInReminder && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 2000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, maxWidth: 360, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            overflow: 'hidden',
          }}>
            {/* Coloured top bar */}
            <div style={{ background: '#4f46e5', padding: '20px 24px 16px' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🕐</div>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.15rem', fontWeight: 700 }}>
                Don't forget to clock in!
              </h3>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ margin: '0 0 20px', color: '#374151', fontSize: '0.9rem', lineHeight: 1.5 }}>
                You haven't clocked in for work today. Head to attendance to record your arrival.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={dismissClockInReminder}
                  style={{
                    flex: 1, padding: '10px 0', border: '1px solid #e5e7eb',
                    borderRadius: 8, background: '#fff', color: '#6b7280',
                    cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
                  }}
                >
                  Remind me later
                </button>
                <button
                  onClick={() => { dismissClockInReminder(); navigate('/attendance'); }}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none',
                    borderRadius: 8, background: '#4f46e5', color: '#fff',
                    cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600,
                  }}
                >
                  Clock In Now →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Toggle Button */}
      <button
        className={`mobile-menu-toggle ${sidebarOpen ? 'menu-open' : ''}`}
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? '✕' : '☰'}
      </button>

      {/* Sidebar Overlay for Mobile */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'active' : ''}`}
        onClick={closeSidebar}
      ></div>

      {/* Modern Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-title">FKF HR</h1>
          <p className="sidebar-subtitle">Employee Self-Service</p>
        </div>
        
        <nav className="sidebar-nav">
          {/* Back to Admin — only visible to admin roles */}
          {(profile?.role === 'hr_admin' || profile?.role === 'super_admin' || profile?.role === 'hod' || profile?.role === 'fleet_manager' || profile?.role === 'finance' || profile?.role === 'ceo' || profile?.role === 'auditor') && (
            <>
              <div className="nav-item">
                <button
                  onClick={() => handleNavigation('/admin/dashboard')}
                  className="nav-link nav-link-inactive w-full text-left"
                  style={{
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.18) 100%)',
                    borderLeft: '3px solid rgb(99,102,241)',
                  }}
                >
                  <span className="nav-icon">🏛️</span>
                  ← Back to Admin
                </button>
              </div>
              <div className="nav-divider"></div>
            </>
          )}

          {/* ── My Leave ─────────────────────────────── */}
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/dashboard')}
              className="nav-link nav-link-active w-full text-left"
            >
              <span className="nav-icon">🏠</span>
              Dashboard
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/attendance')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🕐</span>
              Attendance
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/request-leave')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📝</span>
              Request Leave
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/leave-history')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📋</span>
              Leave History
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/attendance/ooo/new')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📤</span>
              OOO Request
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/attendance/ooo/my-requests')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📑</span>
              My OOO
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/attendance/field/clock-in')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">⏰</span>
              Field Clock-In
            </button>
          </div>

          <div className="nav-divider"></div>

          {/* ── Fleet ─────────────────────────────────── */}
          {profile?.role === 'driver' ? (
            <>
              <div className="nav-item">
                <button
                  onClick={() => handleNavigation('/fleet/driver-dashboard')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">🚗</span>
                  Driver Dashboard
                </button>
              </div>
              <div className="nav-item">
                <button
                  onClick={() => handleNavigation('/fleet/my-trips')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">📋</span>
                  My Trips
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="nav-item">
                <button
                  onClick={() => handleNavigation('/fleet/my-trips')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">🚗</span>
                  My Trip Requests
                </button>
              </div>
              <div className="nav-item">
                <button
                  onClick={() => handleNavigation('/fleet/trip-request/new')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">➕</span>
                  Request Trip
                </button>
              </div>
            </>
          )}

          <div className="nav-divider"></div>

          {/* ── Personal ──────────────────────────────── */}
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/documents')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📄</span>
              My Documents
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/reports')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📊</span>
              My Reports
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/payroll/my-payslips')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">💵</span>
              My Payslips
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-assets')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">💻</span>
              My Assets
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-schedule')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🗓️</span>
              My Schedule
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-training')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🎓</span>
              My Training
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-overtime')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">⏱️</span>
              Overtime
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-appraisal')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🌟</span>
              My Appraisal
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/my-benefits')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🏥</span>
              My Benefits
            </button>
          </div>
          <div className="nav-item">
            <button
              onClick={() => handleNavigation('/announcements')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📢</span>
              Announcements
            </button>
          </div>
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
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Welcome back, {profile?.first_name}! Here's your leave overview.</p>
          </div>
          <NotificationBell />
        </div>

        {/* Dashboard Stats */}
        <div className="dashboard-grid">
          {/* Total Available Days */}
          <div className="stats-card">
            <div className="stats-header">
              <div className="stats-icon stats-icon-success">
                <span style={{ fontSize: '1.5rem' }}>✅</span>
              </div>
              <div>
                <p className="stats-title">Available Leave</p>
                <p className="stats-value">{loading ? '...' : totalAvailable.toFixed(1)}</p>
                <p className="stats-change stats-change-positive">Days remaining</p>
              </div>
            </div>
          </div>

          {/* Used Days */}
          <div className="stats-card">
            <div className="stats-header">
              <div className="stats-icon stats-icon-primary">
                <span style={{ fontSize: '1.5rem' }}>📊</span>
              </div>
              <div>
                <p className="stats-title">Used Leave</p>
                <p className="stats-value">{loading ? '...' : totalUsed.toFixed(1)}</p>
                <p className="stats-change">Days taken this year</p>
              </div>
            </div>
          </div>

          {/* Pending Requests */}
          <div className="stats-card">
            <div className="stats-header">
              <div className="stats-icon stats-icon-warning">
                <span style={{ fontSize: '1.5rem' }}>⏳</span>
              </div>
              <div>
                <p className="stats-title">Pending</p>
                <p className="stats-value">{loading ? '...' : totalPending.toFixed(1)}</p>
                <p className="stats-change">Days awaiting approval</p>
              </div>
            </div>
          </div>

          {/* Profile Information */}
          <div className="stats-card">
            <div className="stats-header">
              <div className="stats-icon stats-icon-primary">
                <span style={{ fontSize: '1.5rem' }}>👤</span>
              </div>
              <div>
                <p className="stats-title">Employee Profile</p>
                <p className="stats-value" style={{ fontSize: '1rem', marginTop: '0.5rem' }}>
                  ID: {formatEmployeeId(profile?.employee_id)}
                </p>
                <p className="stats-change">
                  {profile?.departments?.name || 'No Department'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Leave Balance Details */}
        {balances.length > 0 && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">Leave Balance Breakdown</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {balances.map((balance) => (
                <div key={balance.id} className="p-4 border rounded-lg" style={{ borderColor: 'var(--gray-200)' }}>
                  <h4 className="font-semibold text-gray-900 mb-2">
                    {balance.leave_types?.name}
                  </h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Allocated:</span>
                      <span className="font-medium">{balance.annual_allocation}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Used:</span>
                      <span className="font-medium text-danger">{balance.used_days}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending:</span>
                      <span className="font-medium text-warning">{balance.pending_days}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1" style={{ borderColor: 'var(--gray-200)' }}>
                      <span className="font-semibold">Available:</span>
                      <span className="font-bold text-success">
                        {(balance.annual_allocation + balance.carryforward_days - balance.used_days - balance.pending_days).toFixed(1)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Requests */}
        {recentRequests.length > 0 && (
          <div className="card" style={{ marginBottom: '2rem' }}>
            <div className="card-header">
              <h3 className="card-title">Recent Leave Requests</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Applied Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.leave_types?.name}</td>
                      <td>
                        {request.start_date} to {request.end_date}
                        <br />
                        <span className="text-muted">({request.total_days} days)</span>
                      </td>
                      <td>
                        <span className={`badge badge-${request.status}`}>
                          {request.status.toUpperCase()}
                        </span>
                      </td>
                      <td>{new Date(request.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="action-buttons">
          <button 
            onClick={() => handleNavigation('/request-leave')}
            className="btn btn-primary"
          >
            📝 Request New Leave
          </button>
          <button 
            onClick={() => handleNavigation('/leave-history')}
            className="btn btn-secondary"
          >
            📋 View All Requests
          </button>
          {(profile?.role === 'hod' || profile?.role === 'hr_admin') && (
            <>
              <button 
                onClick={() => handleNavigation('/approvals')}
                className="btn btn-warning"
              >
                ⏳ Pending Approvals
              </button>
              <button 
                onClick={() => handleNavigation('/team-calendar')}
                className="btn btn-outline"
              >
                📅 Team Calendar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};