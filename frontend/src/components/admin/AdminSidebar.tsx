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

export const AdminSidebar = ({ isOpen = false, onClose: _onClose, onNavigate }: AdminSidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);

  // Apply auditor-mode class to body so CSS can hide action buttons globally
  useEffect(() => {
    if (profile?.role === 'auditor') {
      document.body.classList.add('auditor-mode');
    } else {
      document.body.classList.remove('auditor-mode');
    }
    return () => document.body.classList.remove('auditor-mode');
  }, [profile?.role]);

  const isActive = (path: string) => {
    // Highlight menu items for the exact route or any nested routes beneath it
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };
  const isGroupActive = (group: MenuGroup) => group.items.some(item => location.pathname.startsWith(item.path));

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId) // collapse if already open
        : [groupId]                          // open this one, close all others
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

  const roleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':    return 'System Administrator';
      case 'hr_admin':       return 'HR Administrator';
      case 'hod':            return 'Head of Department';
      case 'fleet_manager':  return 'Fleet Manager';
      case 'driver':         return 'Driver';
      case 'finance':        return 'Finance Officer';
      case 'ceo':            return 'Chief Executive Officer';
      case 'auditor':        return 'Auditor';
      case 'employee':       return 'Employee';
      default:               return 'User';
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

  // Define menu groups for a given role
  const getMenuGroupsForRole = (role: string | null | undefined): MenuGroup[] => {

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
            { path: '/attendance/ooo/approvals', icon: '📤', label: 'OOO Approvals' },
            { path: '/attendance/ooo/assignments', icon: '📋', label: 'OOO Assignments' },
          ]
        },
        {
          id: 'department',
          icon: '👥',
          label: 'Department',
          items: [
            { path: '/team-calendar', icon: '📅', label: 'Team Calendar' },
            { path: '/org-chart', icon: '🏛️', label: 'Org Chart' },
            { path: '/admin/employee-reports', icon: '📊', label: 'Reports' },
            { path: '/admin/attendance/dashboard',  icon: '📡', label: 'Live Dashboard' },
            { path: '/admin/attendance',            icon: '🕐', label: 'Attendance Records' },
            { path: '/admin/attendance/reports',    icon: '📥', label: 'Monthly Reports' },
            { path: '/attendance/missed-checkouts', icon: '⚠️', label: 'Missed Checkouts' },
            { path: '/admin/rota',        icon: '🗓️', label: 'Shift Roster' },
            { path: '/admin/overtime',    icon: '⏱️', label: 'Overtime Requests' },
            { path: '/admin/recruitment', icon: '🔍', label: 'Recruitment' },
            { path: '/admin/appraisals',  icon: '🌟', label: 'Appraisals' },
            { path: '/admin/exit',        icon: '🚪', label: 'Exit Requests' },
          ]
        },
        {
          id: 'attendance',
          icon: '🕐',
          label: 'Attendance',
          items: [
            { path: '/attendance/ooo/new', icon: '📤', label: 'OOO Request' },
            { path: '/attendance/ooo/my-requests', icon: '📋', label: 'My OOO' },
            { path: '/attendance/field/assignments', icon: '📍', label: 'Field Assignments' },
            { path: '/attendance/field/clock-in', icon: '⏰', label: 'Field Clock-In' },
            { path: '/attendance/field/supervisor', icon: '👁️', label: 'Supervisor View' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents', icon: '📄', label: 'My Documents' },
            { path: '/fleet/my-trips', icon: '🚗', label: 'My Trips' },
            { path: '/my-assets', icon: '💻', label: 'My Assets' },
            { path: '/my-schedule', icon: '🗓️', label: 'My Schedule' },
            { path: '/my-training', icon: '🎓', label: 'My Training' },
            { path: '/payroll/my-payslips', icon: '💵', label: 'My Payslips' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // Finance
    if (role === 'finance') {
      return [
        {
          id: 'payroll',
          icon: '💵',
          label: 'Payroll',
          items: [
            { path: '/payroll/approvals',      icon: '✅', label: 'Approval Inbox' },
            { path: '/payroll/analytics',      icon: '📈', label: 'Analytics' },
            { path: '/payroll/exports',        icon: '📤', label: 'KRA & Exports' },
            { path: '/payroll/remittances',    icon: '🏦', label: 'Remittances' },
            { path: '/payroll/salary-changes', icon: '📝', label: 'Salary Change Log' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents', icon: '📄', label: 'My Documents' },
            { path: '/payroll/my-payslips', icon: '💵', label: 'My Payslips' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // CEO
    if (role === 'ceo') {
      return [
        {
          id: 'overview',
          icon: '🏠',
          label: 'Overview',
          items: [
            { path: '/admin/dashboard',   icon: '📊', label: 'Admin Dashboard' },
            { path: '/team-calendar',     icon: '📅', label: 'Team Calendar' },
            { path: '/admin/analytics',   icon: '📈', label: 'HR Analytics' },
          ]
        },
        {
          id: 'people',
          icon: '👥',
          label: 'People',
          items: [
            { path: '/admin/employees',        icon: '👤', label: 'Employee Directory' },
            { path: '/admin/employee-reports', icon: '📊', label: 'Employee Reports' },
            { path: '/org-chart',              icon: '🏢', label: 'Org Chart' },
          ]
        },
        {
          id: 'leave',
          icon: '🏖️',
          label: 'Leave',
          items: [
            { path: '/admin/leave-balances', icon: '📋', label: 'Leave Overview' },
            { path: '/admin/reports',        icon: '📈', label: 'Leave Reports' },
          ]
        },
        {
          id: 'attendance',
          icon: '📅',
          label: 'Attendance',
          items: [
            { path: '/admin/attendance/dashboard',  icon: '📊', label: 'Attendance Dashboard' },
            { path: '/admin/attendance',            icon: '📋', label: 'Staff Attendance' },
            { path: '/admin/attendance/reports',    icon: '📥', label: 'Monthly Reports' },
            { path: '/attendance/missed-checkouts', icon: '⚠️', label: 'Missed Checkouts' },
            { path: '/admin/overtime',              icon: '⏱️', label: 'Overtime Requests' },
          ]
        },
        {
          id: 'people_ceo',
          icon: '🌟',
          label: 'People & Performance',
          items: [
            { path: '/admin/recruitment',  icon: '🔍', label: 'Recruitment' },
            { path: '/admin/appraisals',   icon: '🌟', label: 'Appraisals' },
            { path: '/admin/disciplinary', icon: '⚖️', label: 'Disciplinary & Grievance' },
          ]
        },
        {
          id: 'fleet',
          icon: '🚗',
          label: 'Fleet',
          items: [
            { path: '/fleet/dashboard',  icon: '🚗', label: 'Fleet Dashboard' },
            { path: '/fleet/analytics',  icon: '📈', label: 'Fleet Analytics' },
            { path: '/fleet/reports',    icon: '📊', label: 'Fleet Reports' },
          ]
        },
        {
          id: 'payroll',
          icon: '💵',
          label: 'Payroll',
          items: [
            { path: '/payroll/dashboard',  icon: '🏠', label: 'Payroll Dashboard' },
            { path: '/payroll/approvals',  icon: '✅', label: 'Approval Inbox' },
            { path: '/payroll/analytics',  icon: '📈', label: 'Payroll Analytics' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/documents',           icon: '📄', label: 'My Documents' },
            { path: '/payroll/my-payslips', icon: '💵', label: 'My Payslips' },
            { path: '/dashboard',           icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // Driver
    if (role === 'driver') {
      return [
        {
          id: 'driver',
          icon: '🚗',
          label: 'Driver',
          items: [
            { path: '/fleet/driver-dashboard', icon: '📊', label: 'My Dashboard' },
            { path: '/fleet/my-trips', icon: '📋', label: 'My Trips' },
            { path: '/fleet/fuel', icon: '⛽', label: 'Fuel Records' },
            { path: '/fleet/inspections', icon: '🔍', label: 'Inspections' },
          ]
        },
        {
          id: 'attendance',
          icon: '🕐',
          label: 'Attendance',
          items: [
            { path: '/attendance/ooo/new', icon: '📤', label: 'OOO Request' },
            { path: '/attendance/ooo/my-requests', icon: '📋', label: 'My OOO' },
            { path: '/attendance/field/clock-in', icon: '⏰', label: 'Field Clock-In' },
            { path: '/attendance/face-registration', icon: '🤳', label: 'Register My Face' },
          ]
        },
        {
          id: 'personal',
          icon: '👤',
          label: 'Personal',
          items: [
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
            { path: '/documents', icon: '📄', label: 'My Documents' },
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
            { path: '/fleet/inspections', icon: '🔍', label: 'Inspections' },
            { path: '/fleet/compliance', icon: '🛡️', label: 'Compliance' },
            { path: '/fleet/analytics', icon: '📈', label: 'Analytics' },
            { path: '/fleet/reports', icon: '📋', label: 'Reports & Export' },
            { path: '/fleet/budget', icon: '💰', label: 'Budget & TCO' },
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
          id: 'attendance',
          icon: '🕐',
          label: 'Attendance',
          items: [
            { path: '/attendance/ooo/new', icon: '📤', label: 'OOO Request' },
            { path: '/attendance/ooo/my-requests', icon: '📋', label: 'My OOO' },
            { path: '/attendance/field/clock-in', icon: '⏰', label: 'Field Clock-In' },
            { path: '/attendance/face-registration', icon: '🤳', label: 'Register My Face' },
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
    if (role === 'auditor') {
      return [
        { id: 'overview', icon: '🏠', label: 'Overview', items: [
          { path: '/admin/dashboard', icon: '📊', label: 'Admin Dashboard' },
        ]},
        { id: 'staff', icon: '👥', label: 'Staff Management', items: [
          { path: '/admin/users',             icon: '👤', label: 'Users' },
          { path: '/admin/employees',         icon: '🧑‍💼', label: 'Employee Profiles' },
          { path: '/admin/staff-cards',       icon: '🪪', label: 'Staff ID Cards' },
          { path: '/org-chart',               icon: '🏛️', label: 'Org Chart' },
          { path: '/admin/contracts',         icon: '📄', label: 'Contracts & Onboarding' },
          { path: '/admin/assets',            icon: '💻', label: 'Asset Management' },
          { path: '/admin/exit',              icon: '🚪', label: 'Exit Management' },
          { path: '/admin/employee-reports',  icon: '📊', label: 'Employee Reports' },
          { path: '/admin/documents',         icon: '📁', label: 'Documents' },
        ]},
        { id: 'leave', icon: '📋', label: 'Leave Management', items: [
          { path: '/approvals',              icon: '✅', label: 'Approvals' },
          { path: '/admin/leave-types',      icon: '📝', label: 'Leave Types' },
          { path: '/admin/leave-balances',   icon: '💰', label: 'Leave Balances' },
          { path: '/team-calendar',          icon: '📅', label: 'Team Calendar' },
        ]},
        { id: 'attendance', icon: '🕐', label: 'Attendance', items: [
          { path: '/admin/attendance/dashboard',   icon: '📡', label: 'Live Dashboard' },
          { path: '/admin/attendance',             icon: '📊', label: 'Records' },
          { path: '/admin/attendance/reports',     icon: '📥', label: 'Monthly Reports' },
          { path: '/admin/rota',                   icon: '🗓️', label: 'Shift Roster' },
          { path: '/admin/overtime',               icon: '⏱️', label: 'Overtime Requests' },
          { path: '/attendance/ooo/assignments',   icon: '📋', label: 'OOO Assignments' },
          { path: '/attendance/ooo/approvals',     icon: '📤', label: 'OOO Approvals' },
          { path: '/attendance/field/assignments', icon: '📍', label: 'Field Assignments' },
          { path: '/attendance/field/supervisor',  icon: '👁️', label: 'Supervisor View' },
        ]},
        { id: 'fleet', icon: '🚗', label: 'Fleet Management', items: [
          { path: '/fleet/dashboard',    icon: '📊', label: 'Dashboard' },
          { path: '/fleet/vehicles',     icon: '🚙', label: 'Vehicles' },
          { path: '/fleet/drivers',      icon: '🪪', label: 'Drivers' },
          { path: '/fleet/assignments',  icon: '📋', label: 'Assignments' },
          { path: '/fleet/requests',     icon: '📝', label: 'All Requests' },
          { path: '/fleet/fuel',         icon: '⛽', label: 'Fuel Records' },
          { path: '/fleet/maintenance',  icon: '🔧', label: 'Maintenance' },
          { path: '/fleet/inspections',  icon: '🔍', label: 'Inspections' },
          { path: '/fleet/compliance',   icon: '🛡️', label: 'Compliance' },
          { path: '/fleet/analytics',    icon: '📈', label: 'Analytics' },
          { path: '/fleet/reports',      icon: '📋', label: 'Reports & Export' },
          { path: '/fleet/budget',       icon: '💰', label: 'Budget & TCO' },
        ]},
        { id: 'payroll', icon: '💵', label: 'Payroll', items: [
          { path: '/payroll/dashboard',       icon: '📊', label: 'Payroll Runs' },
          { path: '/payroll/approvals',       icon: '✅', label: 'Approvals Inbox' },
          { path: '/payroll/employees',       icon: '👤', label: 'Employee Profiles' },
          { path: '/payroll/exports',         icon: '📤', label: 'KRA & Exports' },
          { path: '/payroll/analytics',       icon: '📈', label: 'Analytics' },
          { path: '/payroll/remittances',     icon: '🏦', label: 'Remittances' },
          { path: '/payroll/salary-changes',  icon: '📝', label: 'Salary Change Log' },
          { path: '/payroll/ghost-check',     icon: '👻', label: 'Ghost Worker Check' },
        ]},
        { id: 'benefits', icon: '🏥', label: 'Benefits', items: [
          { path: '/admin/benefits', icon: '🏥', label: 'Benefits Administration' },
        ]},
        { id: 'people', icon: '🌟', label: 'People & Performance', items: [
          { path: '/admin/recruitment',   icon: '🔍', label: 'Recruitment' },
          { path: '/admin/appraisals',    icon: '🌟', label: 'Appraisals' },
          { path: '/admin/disciplinary',  icon: '⚖️', label: 'Disciplinary & Grievance' },
          { path: '/admin/training',      icon: '🎓', label: 'Training & Development' },
          { path: '/admin/announcements', icon: '📢', label: 'Announcements' },
        ]},
        { id: 'reports', icon: '📊', label: 'Reports & Data', items: [
          { path: '/admin/reports',   icon: '📈', label: 'Analytics' },
          { path: '/admin/holidays',  icon: '🗓️', label: 'Public Holidays' },
        ]},
        { id: 'personal', icon: '👤', label: 'Personal', items: [
          { path: '/documents',           icon: '📄', label: 'My Documents' },
          { path: '/payroll/my-payslips', icon: '💵', label: 'My Payslips' },
          { path: '/dashboard',           icon: '🏠', label: 'Employee View' },
        ]},
      ];
    }

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
            { path: '/admin/employees', icon: '🧑‍💼', label: 'Employee Profiles' },
            { path: '/admin/staff-cards', icon: '🪪', label: 'Staff ID Cards' },
            { path: '/org-chart', icon: '🏛️', label: 'Org Chart' },
            { path: '/admin/contracts', icon: '📄', label: 'Contracts & Onboarding' },
            { path: '/admin/assets', icon: '💻', label: 'Asset Management' },
            { path: '/admin/exit', icon: '🚪', label: 'Exit Management' },
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
            { path: '/admin/attendance/dashboard', icon: '📡', label: 'Live Dashboard' },
            { path: '/admin/attendance', icon: '📊', label: 'Records' },
            { path: '/admin/attendance/reports',   icon: '📥', label: 'Monthly Reports' },
            { path: '/admin/rota', icon: '🗓️', label: 'Shift Roster' },
            { path: '/admin/overtime', icon: '⏱️', label: 'Overtime Requests' },
            { path: '/admin/geofence', icon: '📍', label: 'Office Locations' },
            { path: '/attendance/ooo/assignments', icon: '📋', label: 'OOO Assignments' },
            { path: '/attendance/ooo/approvals', icon: '📤', label: 'OOO Approvals' },
            { path: '/attendance/field/assignments',    icon: '📍', label: 'Field Assignments' },
            { path: '/attendance/field/supervisor',    icon: '👁️', label: 'Supervisor View' },
            { path: '/attendance/selfie-verification', icon: '🔍', label: 'Selfie Verification' },
            { path: '/attendance/face-registration',   icon: '🤳', label: 'Register My Face' },
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
            { path: '/fleet/inspections', icon: '🔍', label: 'Inspections' },
            { path: '/fleet/compliance', icon: '🛡️', label: 'Compliance' },
            { path: '/fleet/analytics', icon: '📈', label: 'Analytics' },
            { path: '/fleet/reports', icon: '📋', label: 'Reports & Export' },
            { path: '/fleet/budget', icon: '💰', label: 'Budget & TCO' },
          ]
        },
        {
          id: 'payroll',
          icon: '💵',
          label: 'Payroll',
          items: [
            { path: '/payroll/dashboard',      icon: '📊', label: 'Payroll Runs' },
            { path: '/payroll/approvals',      icon: '✅', label: 'Approvals Inbox' },
            { path: '/payroll/employees',      icon: '👤', label: 'Employee Profiles' },
            { path: '/payroll/exports',        icon: '📤', label: 'KRA & Exports' },
            { path: '/payroll/analytics',      icon: '📈', label: 'Analytics' },
            { path: '/payroll/remittances',    icon: '🏦', label: 'Remittances' },
            { path: '/payroll/salary-changes', icon: '📝', label: 'Salary Change Log' },
            { path: '/payroll/ghost-check',    icon: '👻', label: 'Ghost Worker Check' },
          ]
        },
        {
          id: 'benefits',
          icon: '🏥',
          label: 'Benefits',
          items: [
            { path: '/admin/benefits', icon: '🏥', label: 'Benefits Administration' },
          ]
        },
        {
          id: 'people',
          icon: '🌟',
          label: 'People & Performance',
          items: [
            { path: '/admin/recruitment',   icon: '🔍', label: 'Recruitment' },
            { path: '/admin/appraisals',    icon: '🌟', label: 'Appraisals' },
            { path: '/admin/disciplinary',  icon: '⚖️', label: 'Disciplinary & Grievance' },
            { path: '/admin/training',      icon: '🎓', label: 'Training & Development' },
            { path: '/admin/announcements', icon: '📢', label: 'Announcements' },
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
            { path: '/attendance/ooo/new', icon: '📤', label: 'OOO Request' },
            { path: '/attendance/ooo/my-requests', icon: '📋', label: 'My OOO' },
            { path: '/attendance/field/clock-in', icon: '⏰', label: 'Field Clock-In' },
            { path: '/payroll/my-payslips', icon: '💵', label: 'My Payslips' },
            { path: '/my-assets', icon: '💻', label: 'My Assets' },
            { path: '/my-schedule', icon: '🗓️', label: 'My Schedule' },
            { path: '/my-training', icon: '🎓', label: 'My Training' },
            { path: '/announcements', icon: '📢', label: 'Announcements' },
            { path: '/my-appraisal', icon: '🌟', label: 'My Appraisal' },
            { path: '/my-benefits', icon: '🏥', label: 'My Benefits' },
            { path: '/dashboard', icon: '🏠', label: 'Employee View' },
          ]
        }
      ];
    }

    // Default - regular employees (flat list, no collapsible groups)
    return [
      { id: 'dashboard',    icon: '🏠', label: 'Dashboard',        items: [{ path: '/dashboard',                    icon: '🏠', label: 'Dashboard' }] },
      { id: 'attendance',   icon: '🕐', label: 'Attendance',        items: [{ path: '/attendance',                   icon: '🕐', label: 'Attendance' }] },
      { id: 'leave-req',    icon: '📝', label: 'Request Leave',     items: [{ path: '/request-leave',                icon: '📝', label: 'Request Leave' }] },
      { id: 'leave-hist',   icon: '📋', label: 'Leave History',     items: [{ path: '/leave-history',                icon: '📋', label: 'Leave History' }] },
      { id: 'ooo-new',      icon: '📤', label: 'OOO Request',       items: [{ path: '/attendance/ooo/new',           icon: '📤', label: 'OOO Request' }] },
      { id: 'ooo-list',     icon: '📑', label: 'My OOO',            items: [{ path: '/attendance/ooo/my-requests',   icon: '📑', label: 'My OOO' }] },
      { id: 'field-in',     icon: '⏰', label: 'Field Clock-In',    items: [{ path: '/attendance/field/clock-in',    icon: '⏰', label: 'Field Clock-In' }] },
      { id: 'face-reg',     icon: '🤳', label: 'Face Registration',  items: [{ path: '/attendance/face-registration', icon: '🤳', label: 'Register My Face' }] },
      { id: 'my-trips',     icon: '🚗', label: 'My Trip Requests',  items: [{ path: '/fleet/my-trips',               icon: '🚗', label: 'My Trip Requests' }] },
      { id: 'req-trip',     icon: '➕', label: 'Request Trip',      items: [{ path: '/fleet/trip-request/new',       icon: '➕', label: 'Request Trip' }] },
      { id: 'documents',    icon: '📄', label: 'My Documents',      items: [{ path: '/documents',                    icon: '📄', label: 'My Documents' }] },
      { id: 'payslips',      icon: '💵', label: 'My Payslips',      items: [{ path: '/payroll/my-payslips',  icon: '💵', label: 'My Payslips' }] },
      { id: 'reports',       icon: '📊', label: 'My Reports',       items: [{ path: '/reports',              icon: '📊', label: 'My Reports' }] },
      { id: 'announcements', icon: '📢', label: 'Announcements',    items: [{ path: '/announcements',        icon: '📢', label: 'Announcements' }] },
      { id: 'my-assets',     icon: '💻', label: 'My Assets',         items: [{ path: '/my-assets',            icon: '💻', label: 'My Assets' }] },
      { id: 'my-schedule',   icon: '🗓️', label: 'My Schedule',       items: [{ path: '/my-schedule',          icon: '🗓️', label: 'My Schedule' }] },
      { id: 'my-training',   icon: '🎓', label: 'My Training',        items: [{ path: '/my-training',          icon: '🎓', label: 'My Training' }] },
      { id: 'appraisal',     icon: '🌟', label: 'My Appraisal',     items: [{ path: '/my-appraisal',         icon: '🌟', label: 'My Appraisal' }] },
      { id: 'my-benefits',   icon: '🏥', label: 'My Benefits',        items: [{ path: '/my-benefits',          icon: '🏥', label: 'My Benefits' }] },
      { id: 'exit',          icon: '🚪', label: 'Exit / Resignation',items: [{ path: '/exit/request',        icon: '🚪', label: 'Exit / Resignation' }] },
    ];
  };

  // Merge primary and secondary role menu groups
  const getMenuGroups = (): MenuGroup[] => {
    const primary = getMenuGroupsForRole(profile?.role);
    if (!profile?.secondary_role) return primary;

    const secondary = getMenuGroupsForRole(profile.secondary_role);
    const merged: MenuGroup[] = [...primary.map(g => ({ ...g, items: [...g.items] }))];

    for (const sg of secondary) {
      const existing = merged.find(g => g.id === sg.id);
      if (!existing) {
        merged.push(sg);
      } else {
        const existingPaths = new Set(existing.items.map(i => i.path));
        for (const item of sg.items) {
          if (!existingPaths.has(item.path)) {
            existing.items.push(item);
          }
        }
      }
    }
    return merged;
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
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem', borderRadius: '10px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          marginBottom: '0.75rem'
        }}>
          {/* Avatar */}
          <div style={{
            width: '2.5rem', height: '2.5rem', borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', fontWeight: 700, color: 'white',
            border: '2px solid rgba(255,255,255,0.25)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            {getUserInitials()}
          </div>

          {/* Name + Role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 700, color: 'white', fontSize: '0.875rem',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              lineHeight: 1.3
            }} title={getUserDisplayName()}>
              {getUserDisplayName()}
            </div>
            {profile?.secondary_role ? (
              <>
                <div style={{
                  fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.3, marginTop: '1px'
                }}>
                  {roleLabel(profile.role)}
                </div>
                <div style={{
                  fontSize: '0.7rem', color: 'rgba(253,230,138,0.9)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  lineHeight: 1.3
                }}>
                  {roleLabel(profile.secondary_role)}
                </div>
              </>
            ) : (
              <div style={{
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                lineHeight: 1.3, marginTop: '1px',
                textTransform: 'uppercase', letterSpacing: '0.04em'
              }}>
                {roleLabel(profile?.role || '')}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={async () => {
            await signOut();
            handleNavigation('/login');
          }}
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
    </>
  );
};
