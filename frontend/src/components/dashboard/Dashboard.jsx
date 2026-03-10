import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getLeaveBalances, getLeaveRequests } from '../../services/leaveService';
import { formatEmployeeId } from '../../utils/formatters';
import NotificationBell from '../notifications/NotificationBell';

export const Dashboard = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState([]);
  const [recentRequests, setRecentRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadDashboardData();
    
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
          <p className="sidebar-subtitle">Leave Management System</p>
        </div>
        
        <nav className="sidebar-nav">
          {(profile?.role === 'hr_admin' || profile?.role === 'super_admin') && (
            <>
              <div className="nav-item">
                <button 
                  onClick={() => handleNavigation('/admin/dashboard')}
                  className="nav-link nav-link-inactive w-full text-left"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%)',
                    borderLeft: '3px solid rgb(99, 102, 241)'
                  }}
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
              onClick={() => handleNavigation('/dashboard')}
              className="nav-link nav-link-active w-full text-left"
            >
              <span className="nav-icon">🏠</span>
              Dashboard
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
              onClick={() => handleNavigation('/documents')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📄</span>
              Documents
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
              onClick={() => handleNavigation('/attendance')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🕐</span>
              Attendance
            </button>
          </div>
          {(profile?.role === 'hod' || profile?.role === 'hr_admin' || profile?.role === 'super_admin') && (
            <>
              <div className="nav-item">
                <button 
                  onClick={() => handleNavigation('/approvals')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">✅</span>
                  Approvals
                </button>
              </div>
              <div className="nav-item">
                <button 
                  onClick={() => handleNavigation('/team-calendar')}
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