import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { getPendingRequestsForApproval } from '../../services/leaveService';
import { AdminSidebar } from './AdminSidebar';
import type { LeaveRequestStatus } from '../../types';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingRequests: number;
  approvedThisMonth: number;
  rejectedThisMonth: number;
  totalDepartments: number;
  totalLeaveTypes: number;
  systemHealth: string;
}

interface SystemAlert {
  type: 'warning' | 'info' | 'danger' | 'success';
  message: string;
  action: string;
  link: string;
}

interface RecentActivity {
  id: string;
  status: LeaveRequestStatus;
  created_at: string;
  updated_at: string;
  start_date: string;
  end_date: string;
  users_profile: {
    full_name: string;
  };
  leave_types: {
    name: string;
  };
}

interface QuickAction {
  title: string;
  description: string;
  icon: string;
  link: string;
  color: 'primary' | 'success' | 'warning' | 'secondary' | 'info' | 'danger';
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingRequests: 0,
    approvedThisMonth: 0,
    rejectedThisMonth: 0,
    totalDepartments: 0,
    totalLeaveTypes: 0,
    systemHealth: 'excellent'
  });
  
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemAlerts, setSystemAlerts] = useState<SystemAlert[]>([]);

  // Mobile menu handlers
  const toggleSidebar = () => {
    console.log('Admin sidebar toggle:', !sidebarOpen);
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    console.log('Admin sidebar close');
    setSidebarOpen(false);
  };

  // Load dashboard data when component mounts
  useEffect(() => {
    loadDashboardData();
    
    // Listen for leave request updates from other components
    const handleLeaveRequestUpdate = () => {
      console.log('Leave request updated, refreshing dashboard...');
      loadDashboardData();
    };
    
    window.addEventListener('leaveRequestUpdated', handleLeaveRequestUpdate);
    
    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('leaveRequestUpdated', handleLeaveRequestUpdate);
    };
  }, [user?.id]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Get pending requests count using the same logic as Approvals page
      let pendingRequestsCount = 0;
      if (user?.id) {
        const { data: pendingData } = await getPendingRequestsForApproval(user.id);
        pendingRequestsCount = pendingData?.length || 0;
      }
      
      // Load system statistics
      const [
        usersResult,
        departmentsResult,
        leaveTypesResult,
        requestsResult,
        recentActivityResult
      ] = await Promise.all([
        // Total and active users (always exclude super_admin from counts)
        supabase
          .from('users_profile')
          .select('id, is_active', { count: 'exact' })
          .neq('role', 'super_admin'),
        
        // Total departments
        supabase
          .from('departments')
          .select('id', { count: 'exact' }),
        
        // Total leave types
        supabase
          .from('leave_types')
          .select('id', { count: 'exact' }),
        
        // Leave requests statistics
        supabase
          .from('leave_requests')
          .select(`
            id, 
            status, 
            created_at,
            user_id,
            users_profile!leave_requests_user_id_fkey(first_name, last_name, department_id)
          `)
          .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        
        // Recent activity
        supabase
          .from('leave_requests')
          .select(`
            id,
            status,
            created_at,
            updated_at,
            start_date,
            end_date,
            user_id,
            leave_type_id,
            users_profile!leave_requests_user_id_fkey(first_name, last_name),
            leave_types(name)
          `)
          .order('updated_at', { ascending: false })
          .limit(10)
      ]);

      // Process statistics
      const totalUsers = usersResult.count || 0;
      const activeUsers = usersResult.data?.filter(u => u.is_active)?.length || 0;
      const totalDepartments = departmentsResult.count || 0;
      const totalLeaveTypes = leaveTypesResult.count || 0;
      
      const requests = requestsResult.data || [];
      // Use the already calculated pendingRequestsCount from getPendingRequestsForApproval
      const approvedThisMonth = requests.filter(r => r.status === 'approved').length;
      const rejectedThisMonth = requests.filter(r => r.status === 'rejected').length;

      setStats({
        totalUsers,
        activeUsers,
        pendingRequests: pendingRequestsCount,
        approvedThisMonth,
        rejectedThisMonth,
        totalDepartments,
        totalLeaveTypes,
        systemHealth: 'excellent'
      });

      // Enrich recent activity with full_name
      const enrichedActivity = (recentActivityResult.data || []).map((activity: any) => ({
        ...activity,
        users_profile: {
          ...activity.users_profile,
          full_name: `${activity.users_profile?.first_name || ''} ${activity.users_profile?.last_name || ''}`.trim()
        }
      }));
      
      setRecentActivity(enrichedActivity as unknown as RecentActivity[]);
      
      // Generate system alerts
      const alerts: SystemAlert[] = [];
      if (pendingRequestsCount > 10) {
        alerts.push({
          type: 'warning',
          message: `${pendingRequestsCount} pending leave requests require attention`,
          action: 'View Approvals',
          link: '/approvals'
        });
      }
      
      if (totalUsers - activeUsers > 5) {
        alerts.push({
          type: 'info',
          message: `${totalUsers - activeUsers} inactive users in the system`,
          action: 'Manage Users',
          link: '/admin/users'
        });
      }
      
      setSystemAlerts(alerts);
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions: QuickAction[] = [
    {
      title: 'Manage Users',
      description: 'Add, edit, or deactivate user accounts',
      icon: '👥',
      link: '/admin/users',
      color: 'primary'
    },
    {
      title: 'Leave Types',
      description: 'Configure leave policies and types',
      icon: '📋',
      link: '/admin/leave-types',
      color: 'success'
    },
    {
      title: 'Reports',
      description: 'View analytics and generate reports',
      icon: '📊',
      link: '/admin/reports',
      color: 'warning'
    },
    {
      title: 'System Settings',
      description: 'Configure policies and preferences',
      icon: '⚙️',
      link: '/admin/settings',
      color: 'secondary'
    },
    {
      title: 'Public Holidays',
      description: 'Manage organization holidays',
      icon: '🗓️',
      link: '/admin/holidays',
      color: 'info'
    },
    {
      title: 'Attendance',
      description: 'View and manage staff attendance',
      icon: '🕐',
      link: '/admin/attendance',
      color: 'success'
    },
    {
      title: 'Bulk Operations',
      description: 'Import users and batch updates',
      icon: '⚡',
      link: '/admin/bulk',
      color: 'danger'
    }
  ];

  const formatActivityTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getStatusIcon = (status: LeaveRequestStatus): string => {
    const icons: Record<LeaveRequestStatus, string> = {
      pending: '⏳',
      approved: '✅',
      rejected: '❌',
      cancelled: '🚫',
      hod_approved: '✅'
    };
    return icons[status] || '📄';
  };

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading admin dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

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

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <AdminSidebar 
        isOpen={sidebarOpen} 
        onClose={closeSidebar}
        onNavigate={(path) => {
          navigate(path);
          closeSidebar();
        }}
      />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">🏛️</span>
              HR Admin Dashboard
            </h1>
            <p className="page-subtitle">System overview and administrative controls</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={() => navigate('/admin/bulk')}
              className="btn btn-warning action-btn"
            >
              <span className="btn-icon">⚡</span>
              Bulk Operations
            </button>
            <button
              onClick={() => navigate('/admin/reports')}
              className="btn btn-primary action-btn"
            >
              <span className="btn-icon">📊</span>
              View Reports
            </button>
          </div>
        </div>

        {/* System Alerts */}
        {systemAlerts.length > 0 && (
          <div className="admin-alerts mb-6">
            {systemAlerts.map((alert, index) => (
              <div key={index} className={`alert alert-${alert.type} admin-alert`}>
                <div className="alert-content">
                  <span className="alert-message">{alert.message}</span>
                  <button 
                    onClick={() => navigate(alert.link)}
                    className="btn btn-sm btn-outline alert-action"
                  >
                    {alert.action}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* System Statistics */}
        <div className="stats-grid admin-stats-grid mb-8">
          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-primary">👥</div>
              <div className="stats-details">
                <h3 className="stats-title">Total Users</h3>
                <p className="stats-value">{stats.totalUsers}</p>
                <p className="stats-change">
                  <span className="stats-change-positive">{stats.activeUsers} active</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-warning">⏳</div>
              <div className="stats-details">
                <h3 className="stats-title">Pending Requests</h3>
                <p className="stats-value">{stats.pendingRequests}</p>
                <p className="stats-change">
                  <span className="text-muted">Require attention</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-success">✅</div>
              <div className="stats-details">
                <h3 className="stats-title">Approved This Month</h3>
                <p className="stats-value">{stats.approvedThisMonth}</p>
                <p className="stats-change">
                  <span className="stats-change-positive">+{stats.rejectedThisMonth} rejected</span>
                </p>
              </div>
            </div>
          </div>

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-secondary">🏢</div>
              <div className="stats-details">
                <h3 className="stats-title">Departments</h3>
                <p className="stats-value">{stats.totalDepartments}</p>
                <p className="stats-change">
                  <span className="text-muted">{stats.totalLeaveTypes} leave types</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="admin-section mb-8">
          <h2 className="section-title">
            <span className="section-icon">⚡</span>
            Quick Actions
          </h2>
          
          <div className="quick-actions-grid">
            {quickActions.map((action, index) => (
              <div key={index} className="quick-action-card">
                <button 
                  onClick={() => navigate(action.link)}
                  className={`quick-action-btn btn-${action.color}`}
                >
                  <div className="quick-action-icon">{action.icon}</div>
                  <div className="quick-action-content">
                    <h3 className="quick-action-title">{action.title}</h3>
                    <p className="quick-action-desc">{action.description}</p>
                  </div>
                  <div className="quick-action-arrow">→</div>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="admin-section">
          <h2 className="section-title">
            <span className="section-icon">📋</span>
            Recent System Activity
          </h2>
          
          <div className="card activity-card">
            {recentActivity.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>No recent activity</h3>
                <p>System activity will appear here</p>
              </div>
            ) : (
              <div className="activity-list">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className="activity-icon">
                      {getStatusIcon(activity.status)}
                    </div>
                    <div className="activity-content">
                      <div className="activity-main">
                        <strong>{activity.users_profile.full_name}</strong> 
                        <span className="activity-action">
                          {activity.status === 'pending' && ' submitted a'}
                          {activity.status === 'approved' && ' got approved for'}
                          {activity.status === 'rejected' && ' got rejected for'}
                        </span>
                        <span className="activity-type">{activity.leave_types.name}</span>
                        <span className="activity-details">
                          from {new Date(activity.start_date).toLocaleDateString()} 
                          to {new Date(activity.end_date).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="activity-time">
                        {formatActivityTime(activity.updated_at)}
                      </div>
                    </div>
                    <div className={`activity-status status-${activity.status}`}>
                      {activity.status}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
