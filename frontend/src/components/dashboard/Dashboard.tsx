import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { getLeaveBalances, getLeaveRequests } from '../../services/leaveService';
import NotificationBell from '../notifications/NotificationBell';

interface LeaveBalance {
  id: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  annual_allocation: number;
  used_days: number;
  pending_days: number;
  carryforward_days: number;
  leave_types: {
    name: string;
    color_code?: string;
  };
}

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string;
  created_at: string;
  leave_types: {
    name: string;
  };
}

export const Dashboard: React.FC = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [recentRequests, setRecentRequests] = useState<LeaveRequest[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const loadDashboardData = useCallback(async (): Promise<void> => {
    if (!profile?.id) return;

    setLoading(true);
    const [balancesResult, requestsResult, pendingResult] = await Promise.all([
      getLeaveBalances(profile.id),
      getLeaveRequests(profile.id, { limit: 5 }),
      getLeaveRequests(profile.id, { status: 'pending' }),
    ]);

    console.log('Dashboard data loaded:', {
      balances: balancesResult.data,
      recentRequests: requestsResult.data,
      pendingRequests: pendingResult.data,
      pendingCount: pendingResult.data?.length
    });

    if (balancesResult.data) setBalances(balancesResult.data as LeaveBalance[]);
    if (requestsResult.data) setRecentRequests((requestsResult.data as LeaveRequest[]).slice(0, 5));
    if (pendingResult.data) setPendingCount((pendingResult.data as LeaveRequest[]).length);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/login');
  };

  // Calculate total available days across all leave types
  const totalAvailable: number = balances.reduce((sum, b) => {
    return sum + (b.annual_allocation + b.carryforward_days - b.used_days - b.pending_days);
  }, 0);

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-left">
          <h1>Welcome back, {profile?.first_name}! 👋</h1>
          <p className="header-subtitle">
            Here's your leave summary and recent activity
          </p>
        </div>
        <div className="header-right">
          <NotificationBell />
          {(profile?.role === 'hod' || profile?.role === 'hr_admin') && (
            <button
              className="btn btn-primary"
              onClick={() => navigate('/approvals')}
              style={{
                marginLeft: '1rem'
              }}
            >
              Approvals
            </button>
          )}
          <button 
            onClick={handleSignOut}
            className="btn btn-secondary"
            style={{ marginLeft: '1rem' }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-content">
            <div className="stats-icon stats-icon-success">📅</div>
            <div className="stats-details">
              <h3 className="stats-title">Available Days</h3>
              <p className="stats-value">{totalAvailable}</p>
              <p className="stats-change">
                <span className="stats-change-positive">Ready to use</span>
              </p>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-content">
            <div className="stats-icon stats-icon-info">📊</div>
            <div className="stats-details">
              <h3 className="stats-title">Used This Year</h3>
              <p className="stats-value">
                {balances.reduce((sum, b) => sum + b.used_days, 0)}
              </p>
              <p className="stats-change">
                <span className="stats-change-neutral">Days taken</span>
              </p>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-content">
            <div className="stats-icon stats-icon-warning">⏳</div>
            <div className="stats-details">
              <h3 className="stats-title">Pending Requests</h3>
              <p className="stats-value">{pendingCount}</p>
              <p className="stats-change">
                <span className="stats-change-warning">Awaiting approval</span>
              </p>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-content">
            <div className="stats-icon stats-icon-primary">🎯</div>
            <div className="stats-details">
              <h3 className="stats-title">Leave Types</h3>
              <p className="stats-value">{balances.length}</p>
              <p className="stats-change">
                <span className="stats-change-positive">Available</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Leave Balances */}
        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Leave Balances</h2>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/leave/request')}
            >
              Request Leave
            </button>
          </div>
          
          <div className="balance-cards">
            {balances.map((balance) => {
              const available = balance.annual_allocation + balance.carryforward_days - balance.used_days - balance.pending_days;
              const usedPercentage = (balance.used_days / balance.annual_allocation) * 100;
              
              return (
                <div key={balance.id} className="balance-card">
                  <div className="balance-header">
                    <div 
                      className="balance-color-indicator"
                      style={{ backgroundColor: balance.leave_types?.color_code || '#3b82f6' }}
                    ></div>
                    <h3 className="balance-title">{balance.leave_types?.name}</h3>
                  </div>
                  
                  <div className="balance-stats">
                    <div className="balance-stat">
                      <span className="balance-label">Available</span>
                      <span className="balance-value balance-value-primary">{available}</span>
                    </div>
                    <div className="balance-stat">
                      <span className="balance-label">Used</span>
                      <span className="balance-value balance-value-used">{balance.used_days}</span>
                    </div>
                    <div className="balance-stat">
                      <span className="balance-label">Pending</span>
                      <span className="balance-value balance-value-pending">{balance.pending_days}</span>
                    </div>
                    <div className="balance-stat">
                      <span className="balance-label">Total</span>
                      <span className="balance-value">{balance.annual_allocation}</span>
                    </div>
                  </div>
                  
                  <div className="balance-progress">
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ 
                          width: `${Math.min(usedPercentage, 100)}%`,
                          backgroundColor: usedPercentage > 80 ? '#ef4444' : 
                                         usedPercentage > 60 ? '#f59e0b' : '#10b981'
                        }}
                      ></div>
                    </div>
                    <span className="progress-text">
                      {Math.round(usedPercentage)}% used
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {balances.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <h3 className="empty-state-title">No leave balances found</h3>
              <p className="empty-state-description">
                Your leave balances will appear here once they're set up.
              </p>
            </div>
          )}
        </div>

        {/* Recent Requests */}
        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Recent Leave Requests</h2>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/leave/history')}
            >
              View All
            </button>
          </div>

          <div className="requests-list">
            {recentRequests.map((request) => (
              <div key={request.id} className="request-item">
                <div className="request-info">
                  <div className="request-header">
                    <span className="request-type">{request.leave_types?.name}</span>
                    <span className={`request-status request-status-${request.status}`}>
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                  </div>
                  <div className="request-details">
                    <span className="request-dates">
                      {new Date(request.start_date).toLocaleDateString()} - {' '}
                      {new Date(request.end_date).toLocaleDateString()}
                    </span>
                    <span className="request-days">{request.total_days} days</span>
                  </div>
                  <p className="request-reason">{request.reason}</p>
                </div>
                <div className="request-date">
                  {new Date(request.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>

          {recentRequests.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <h3 className="empty-state-title">No recent requests</h3>
              <p className="empty-state-description">
                Your recent leave requests will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="dashboard-section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="action-cards">
          <button 
            className="action-card"
            onClick={() => navigate('/leave/request')}
          >
            <div className="action-icon">📝</div>
            <h3 className="action-title">Request Leave</h3>
            <p className="action-description">Submit a new leave request</p>
          </button>

          <button 
            className="action-card"
            onClick={() => navigate('/leave/history')}
          >
            <div className="action-icon">📊</div>
            <h3 className="action-title">View History</h3>
            <p className="action-description">Check your leave history</p>
          </button>

          <button 
            className="action-card"
            onClick={() => navigate('/calendar')}
          >
            <div className="action-icon">📅</div>
            <h3 className="action-title">Team Calendar</h3>
            <p className="action-description">View team leave calendar</p>
          </button>

          {(profile?.role === 'hod' || profile?.role === 'hr_admin') && (
            <button 
              className="action-card action-card-primary"
              onClick={() => navigate('/approvals')}
            >
              <div className="action-icon">✓</div>
              <h3 className="action-title">⏳ Pending Approvals</h3>
              <p className="action-description">
                {pendingCount} requests need your attention
              </p>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
