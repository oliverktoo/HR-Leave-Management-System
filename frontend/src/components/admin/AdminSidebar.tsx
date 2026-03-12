import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

interface MenuItem {
  path: string;
  icon: string;
  label: string;
}

interface MenuGroup {
  id: string;
  icon: string;
  label: string;
  items: MenuItem[];
}

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
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  const isActive = (path: string) => location.pathname === path;
  const isGroupActive = (group: MenuGroup) => group.items.some(item => location.pathname.startsWith(item.path));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  // Auto-expand group containing active item
  useEffect(() => {
    const menuGroups = getMenuGroups();
    menuGroups.forEach(group => {
      if (group.items.some(item => location.pathname.startsWith(item.path))) {
        setExpandedGroups(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
      }
    });
  }, [location.pathname]);

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
      case 'fleet_manager':
        return 'Fleet Manager';
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

  // Define menu groups based on role
  const getMenuGroups = (): MenuGroup[] => {
    const role = profile?.role;

    // HOD - Limited access to department management
    if (role === 'hod') {
      return [
        {
          id: 'approvals',
          icon: '✅',
          label: 'Approvals',
          items: [
            { path: '/approvals', icon: '📋', label: 'Leave Approvals' },
            { path: '/fleet/trip-approvals', icon: '🚗', label: 'Trip Approvals' },
          ]
        },
        {
          id: 'department',
          icon: '👥',
          label: 'Department',
          items: [
            { path: '/team-calendar', icon: '📅', label: 'Team Calendar' },
            { path: '/admin/employee-reports', icon: '📊', label: 'Reports' },
            { path: '/admin/attendance', icon: '🕐', label: 'Attendance' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents', icon: '📄', label: 'My Documents' },
            { path: '/fleet/my-trips', icon: '🚗', label: 'My Trips' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // Fleet Manager
    if (role === 'fleet_manager') {
      return [
        {
          id: 'fleet',
          icon: '🚗',
          label: 'Fleet Management',
          items: [
            { path: '/fleet/dashboard', icon: '📊', label: 'Dashboard' },
            { path: '/fleet/vehicles', icon: '🚙', label: 'Vehicles' },
            { path: '/fleet/drivers', icon: '🪪', label: 'Drivers' },
            { path: '/fleet/assignments', icon: '📋', label: 'Assignments' },
            { path: '/fleet/requests', icon: '📝', label: 'All Requests' },
            { path: '/fleet/fuel', icon: '⛽', label: 'Fuel Records' },
            { path: '/fleet/maintenance', icon: '🔧', label: 'Maintenance' },
          ]
        },
        {
          id: 'approvals',
          icon: '✅',
          label: 'Approvals',
          items: [
            { path: '/approvals', icon: '📋', label: 'Leave Approvals' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents', icon: '📄', label: 'My Documents' },
            { path: '/fleet/my-trips', icon: '🚗', label: 'My Trips' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // HR Admin and Super Admin - Full access
    if (role === 'hr_admin' || role === 'super_admin') {
      return [
        {
          id: 'overview',
          icon: '🏠',
          label: 'Overview',
          items: [
            { path: '/admin/dashboard', icon: '📊', label: 'Admin Dashboard' },
          ]
        },
        {
          id: 'staff',
          icon: '👥',
          label: 'Staff Management',
          items: [
            { path: '/admin/users', icon: '👤', label: 'Users' },
            { path: '/admin/employee-reports', icon: '📊', label: 'Employee Reports' },
            { path: '/admin/documents', icon: '📁', label: 'Documents' },
          ]
        },
        {
          id: 'leave',
          icon: '📋',
          label: 'Leave Management',
          items: [
            { path: '/approvals', icon: '✅', label: 'Approvals' },
            { path: '/admin/leave-types', icon: '📝', label: 'Leave Types' },
            { path: '/admin/leave-balances', icon: '💰', label: 'Leave Balances' },
            { path: '/team-calendar', icon: '📅', label: 'Team Calendar' },
          ]
        },
        {
          id: 'attendance',
          icon: '🕐',
          label: 'Attendance',
          items: [
            { path: '/admin/attendance', icon: '📊', label: 'Records' },
            { path: '/admin/geofence', icon: '📍', label: 'Office Locations' },
          ]
        },
        {
          id: 'fleet',
          icon: '🚗',
          label: 'Fleet Management',
          items: [
            { path: '/fleet/dashboard', icon: '📊', label: 'Dashboard' },
            { path: '/fleet/vehicles', icon: '🚙', label: 'Vehicles' },
            { path: '/fleet/drivers', icon: '🪪', label: 'Drivers' },
            { path: '/fleet/assignments', icon: '📋', label: 'Assignments' },
            { path: '/fleet/requests', icon: '📝', label: 'All Requests' },
            { path: '/fleet/fuel', icon: '⛽', label: 'Fuel Records' },
            { path: '/fleet/maintenance', icon: '🔧', label: 'Maintenance' },
          ]
        },
        {
          id: 'reports',
          icon: '📊',
          label: 'Reports & Data',
          items: [
            { path: '/admin/reports', icon: '📈', label: 'Analytics' },
            { path: '/admin/holidays', icon: '🗓️', label: 'Public Holidays' },
            { path: '/admin/bulk-operations', icon: '📦', label: 'Bulk Operations' },
          ]
        },
        {
          id: 'settings',
          icon: '⚙️',
          label: 'System',
          items: [
            { path: '/admin/settings', icon: '🔧', label: 'Settings' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents', icon: '📄', label: 'My Documents' },
            { path: '/fleet/my-trips', icon: '🚗', label: 'My Trips' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // Default - regular employees
    return [
      {
        id: 'main',
        icon: '🏠',
        label: 'Main',
        items: [
          { path: '/dashboard', icon: '📊', label: 'Dashboard' },
          { path: '/fleet/my-trips', icon: '🚗', label: 'My Trips' },
          { path: '/documents', icon: '📄', label: 'My Documents' },
        ]
      }
    ];
  };

  const menuGroups = getMenuGroups();

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
        {/* Menu Groups */}
        {menuGroups.map((group) => (
          <div key={group.id} className="nav-group">
            {/* Single item groups render directly */}
            {group.items.length === 1 ? (
              <button 
                onClick={() => handleNavigation(group.items[0].path)}
                className={`nav-link ${isActive(group.items[0].path) ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
              >
                <span className="nav-icon">{group.icon}</span>
                {group.label}
              </button>
            ) : (
              <>
                {/* Group Header */}
                <button 
                  onClick={() => toggleGroup(group.id)}
                  className={`nav-group-header ${isGroupActive(group) ? 'nav-group-active' : ''}`}
                >
                  <span className="nav-icon">{group.icon}</span>
                  <span className="nav-group-label">{group.label}</span>
                  <span className={`nav-group-arrow ${expandedGroups.includes(group.id) ? 'expanded' : ''}`}>
                    ▸
                  </span>
                </button>
                
                {/* Group Items */}
                <div className={`nav-group-items ${expandedGroups.includes(group.id) ? 'expanded' : ''}`}>
                  {group.items.map((item) => (
                    <button 
                      key={item.path}
                      onClick={() => handleNavigation(item.path)}
                      className={`nav-link nav-subitem ${isActive(item.path) ? 'nav-link-active' : 'nav-link-inactive'} w-full text-left`}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
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
