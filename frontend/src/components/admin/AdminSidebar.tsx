import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
}

export const AdminSidebar = ({ isOpen = false, onClose, onNavigate }: AdminSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const handleNavigation = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      navigate(path);
    }
  };

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

  // Define menu items based on role
  const getMenuItems = () => {
    const role = profile?.role;

    // HOD - Limited access to department management only
    if (role === 'hod') {
      return [
        { path: '/approvals', icon: '✅', label: 'Department Approvals', section: 'main' },
        { path: '/team-calendar', icon: '📅', label: 'Department Calendar', section: 'main' },
        { path: '/admin/employee-reports', icon: '👤', label: 'Department Reports', section: 'main' },
        { path: '/admin/attendance', icon: '🕐', label: 'Department Attendance', section: 'main' },
        { path: '/documents', icon: '📄', label: 'My Documents', section: 'main' },
        { path: '/dashboard', icon: '👤', label: 'Employee View', section: 'footer' },
      ];
    }

    // HR Admin and Super Admin - Full access
    if (role === 'hr_admin' || role === 'super_admin') {
      return [
        { path: '/admin/dashboard', icon: '🏠', label: 'Admin Dashboard', section: 'main' },
        { path: '/admin/users', icon: '👥', label: 'User Management', section: 'main' },
        { path: '/admin/leave-types', icon: '📋', label: 'Leave Types', section: 'main' },
        { path: '/admin/leave-balances', icon: '💰', label: 'Leave Balances', section: 'main' },
        { path: '/admin/reports', icon: '📊', label: 'Reports & Analytics', section: 'main' },
        { path: '/admin/employee-reports', icon: '👤', label: 'Employee Reports', section: 'main' },
        { path: '/admin/attendance', icon: '🕐', label: 'Attendance', section: 'main' },
        { path: '/admin/holidays', icon: '🗓️', label: 'Public Holidays', section: 'main' },
        { path: '/admin/settings', icon: '⚙️', label: 'Settings', section: 'main' },
        { path: '/admin/geofence', icon: '📍', label: 'Office Locations', section: 'main' },
        { path: '/admin/bulk-operations', icon: '📦', label: 'Bulk Operations', section: 'main' },
        { path: '/admin/documents', icon: '📁', label: 'Employee Documents', section: 'main' },
        { path: '/approvals', icon: '✅', label: 'Approvals', section: 'main' },
        { path: '/team-calendar', icon: '📅', label: 'Team Calendar', section: 'main' },
        { path: '/documents', icon: '📄', label: 'My Documents', section: 'main' },
        { path: '/dashboard', icon: '👤', label: 'Employee View', section: 'footer' },
      ];
    }

    // Default - minimal access
    return [
      { path: '/dashboard', icon: '🏠', label: 'Dashboard', section: 'main' },
      { path: '/documents', icon: '📄', label: 'My Documents', section: 'main' },
    ];
  };

  const menuItems = getMenuItems();
  const mainMenuItems = menuItems.filter(item => item.section === 'main');
  const footerMenuItems = menuItems.filter(item => item.section === 'footer');

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

      <div className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''} ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="sidebar-title">
          {profile?.role === 'hod' ? 'Department Manager' : 'FKF HR Admin'}
        </h1>
        <p className="sidebar-subtitle">
          {profile?.role === 'hod' ? 'Department Management' : 'System Administration'}
        </p>
      </div>
      
      <nav className="sidebar-nav">
        {/* Main Menu Items */}
        {mainMenuItems.map((item) => (
          <div key={item.path} className="nav-item">
            <button 
              onClick={() => handleNavigation(item.path)}
              className={`nav-link ${isActive(item.path) ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          </div>
        ))}
        
        {/* Divider before footer items */}
        {footerMenuItems.length > 0 && <div className="nav-divider"></div>}
        
        {/* Footer Menu Items */}
        {footerMenuItems.map((item) => (
          <div key={item.path} className="nav-item">
            <button 
              onClick={() => handleNavigation(item.path)}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          </div>
        ))}
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
            handleNavigation('/login');
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
