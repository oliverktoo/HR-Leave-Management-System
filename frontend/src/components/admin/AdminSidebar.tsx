import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export const AdminSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // Apply/remove collapsed class to body
  useEffect(() => {
    if (isCollapsed) {
      document.body.classList.add('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-collapsed');
    }
    return () => {
      document.body.classList.remove('sidebar-collapsed');
    };
  }, [isCollapsed]);

  const getRoleDisplay = () => {
    if (!profile?.role) return 'User';
    
    switch (profile.role) {
      case 'super_admin':
        return 'System Administrator';
      case 'hr_admin':
        return 'HR Administrator';
      case 'hod':
        return 'Head of Department';
      case 'employee':
        return 'Employee';
      default:
        return 'User';
    }
  };

  const getUserDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return user?.email?.split('@')[0] || 'Admin User';
  };

  const getUserInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name.charAt(0)}${profile.last_name.charAt(0)}`;
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'A';
  };

  return (
    <>
      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="sidebar-toggle"
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '→' : '←'}
      </button>

      <div className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="sidebar-header">
        <h1 className="sidebar-title">FKF HR Admin</h1>
        <p className="sidebar-subtitle">System Administration</p>
      </div>
      
      <nav className="sidebar-nav">
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/dashboard')}
            className={`nav-link ${isActive('/admin/dashboard') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">🏠</span>
            Admin Dashboard
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/users')}
            className={`nav-link ${isActive('/admin/users') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">👥</span>
            User Management
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/leave-types')}
            className={`nav-link ${isActive('/admin/leave-types') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">📋</span>
            Leave Types
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/reports')}
            className={`nav-link ${isActive('/admin/reports') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">📊</span>
            Reports & Analytics
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/holidays')}
            className={`nav-link ${isActive('/admin/holidays') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">🗓️</span>
            Public Holidays
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/settings')}
            className={`nav-link ${isActive('/admin/settings') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">⚙️</span>
            Settings
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/admin/bulk-operations')}
            className={`nav-link ${isActive('/admin/bulk-operations') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">📦</span>
            Bulk Operations
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/approvals')}
            className={`nav-link ${isActive('/approvals') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">✅</span>
            Approvals
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/team-calendar')}
            className={`nav-link ${isActive('/team-calendar') ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
          >
            <span className="nav-icon">📅</span>
            Team Calendar
          </button>
        </div>
        
        <div className="nav-divider"></div>
        
        <div className="nav-item">
          <button 
            onClick={() => navigate('/dashboard')}
            className="nav-link nav-link-inactive w-full text-left"
          >
            <span className="nav-icon">👤</span>
            Employee View
          </button>
        </div>
        <div className="nav-item">
          <button 
            onClick={() => navigate('/approvals')}
            className="nav-link nav-link-inactive w-full text-left"
          >
            <span className="nav-icon">✓</span>
            Approvals
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="user-avatar admin-avatar">
            {getUserInitials()}
          </div>
          <div className="user-info">
            <div className="user-name">
              {getUserDisplayName()}
            </div>
            <div className="user-role admin-role">
              {getRoleDisplay()}
            </div>
          </div>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
          className="btn btn-outline mt-3 w-full sign-out-btn"
        >
          <span className="nav-icon">🚪</span>
          Sign Out
        </button>
      </div>
    </div>
    </>
  );
};
