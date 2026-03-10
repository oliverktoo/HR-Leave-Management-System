import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { sendWelcomeEmail } from '../../services/emailService';
import { AdminSidebar } from './AdminSidebar';
import { PasswordResetModal } from './PasswordResetModal';
import type { Department } from '../../types';

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role: 'employee' | 'hod' | 'hr_admin';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  department_id?: string;
  departments?: { name: string };
  full_name?: string; // Computed field for display
}

interface NewUserFormData {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  department_id: string;
  role: 'employee' | 'hod' | 'hr_admin';
  is_active: boolean;
}

const UserManagement = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedRole, setSelectedRole] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
  const [userForPasswordReset, setUserForPasswordReset] = useState<UserProfile | null>(null);
  const [generatedCredentials, setGeneratedCredentials] = useState({ email: '', password: '', fullName: '' });
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  
  const [newUser, setNewUser] = useState<NewUserFormData>({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    department_id: '',
    role: 'employee',
    is_active: true
  });

  // Load data when component mounts
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [usersResult, departmentsResult] = await Promise.all([
        supabase
          .from('users_profile')
          .select(`
            id,
            email,
            first_name,
            last_name,
            phone,
            role,
            is_active,
            created_at,
            updated_at,
            department_id
          `)
          .neq('role', 'super_admin')  // Hide super_admin from list
          .order('created_at', { ascending: false }),
        
        supabase
          .from('departments')
          .select('*')
          .eq('is_active', true)
          .order('name')
      ]);

      if (usersResult.error) throw usersResult.error;
      if (departmentsResult.error) throw departmentsResult.error;

      // Create department map
      const deptMap = new Map(departmentsResult.data?.map(d => [d.id, d]) || []);
      
      // Enrich users with department data and add full_name
      const enrichedUsers = (usersResult.data || []).map(user => ({
        ...user,
        full_name: `${user.first_name} ${user.last_name}`,
        departments: deptMap.get(user.department_id) || null
      }));

      setUsers(enrichedUsers as unknown as UserProfile[] || []);
      setDepartments(departmentsResult.data || []);
      
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading data: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || 
                             u.departments?.name === selectedDepartment;
    const matchesRole = selectedRole === 'all' || u.role === selectedRole;
    
    return matchesSearch && matchesDepartment && matchesRole;
  });

  // Generate secure random password
  const generateSecurePassword = (): string => {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const allChars = uppercase + lowercase + numbers + symbols;
    
    let password = '';
    // Ensure at least one of each type
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Fill remaining characters
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      // Generate secure random password
      const generatedPassword = generateSecurePassword();
      
      // Use RPC function to create user (handles both auth and profile creation)
      const { data, error } = await supabase.rpc('create_user_admin', {
        p_email: newUser.email,
        p_password: generatedPassword,
        p_first_name: newUser.first_name,
        p_last_name: newUser.last_name,
        p_phone: newUser.phone,
        p_department_id: newUser.department_id || null,
        p_role: newUser.role,
        p_is_active: newUser.is_active
      });

      if (error) throw error;
      
      if (data && !data.success) {
        throw new Error(data.error || 'Failed to create user');
      }

      const userId = data.user_id;

      // Initialize leave balances for the new user
      const currentYear = new Date().getFullYear();
      const { data: leaveTypes } = await supabase
        .from('leave_types')
        .select('*')
        .eq('is_active', true);

      if (leaveTypes && leaveTypes.length > 0) {
        const balanceInserts = leaveTypes.map(leaveType => ({
          user_id: userId,
          leave_type_id: leaveType.id,
          year: currentYear,
          opening_balance: 0,
          annual_allocation: leaveType.default_days_per_year || 0,
          used_days: 0,
          pending_days: 0
        }));

        await supabase
          .from('leave_balances')
          .insert(balanceInserts);
      }

      // Send welcome email with credentials
      await sendWelcomeEmail({
        email: newUser.email,
        fullName: `${newUser.first_name} ${newUser.last_name}`,
        password: generatedPassword,
        role: newUser.role
      });

      // Store credentials for display
      setGeneratedCredentials({
        email: newUser.email,
        password: generatedPassword,
        fullName: `${newUser.first_name} ${newUser.last_name}`
      });

      setShowAddModal(false);
      setNewUser({
        email: '',
        first_name: '',
        last_name: '',
        phone: '',
        department_id: '',
        role: 'employee',
        is_active: true
      });
      
      loadData();
      
      // Show password modal instead of alert
      setShowPasswordModal(true);
      
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Error creating user: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const handleUpdateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('users_profile')
        .update({
          first_name: selectedUser.first_name,
          last_name: selectedUser.last_name,
          phone: selectedUser.phone,
          department_id: selectedUser.department_id,
          role: selectedUser.role,
          is_active: selectedUser.is_active
        })
        .eq('id', selectedUser.id);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedUser(null);
      loadData();
      alert('User updated successfully!');
      
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('users_profile')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      
      loadData();
      
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('Error updating user status: ' + (error as Error).message);
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete this user?\n\nEmail: ${userEmail}\n\nThis action cannot be undone. All associated leave requests and balances will also be deleted.`
    );

    if (!confirmed) return;

    try {
      setLoading(true);

      // Call the database function to delete user (handles auth checks)
      const { data, error } = await supabase.rpc('delete_user_admin', {
        user_id_to_delete: userId
      });

      if (error) throw error;

      // Check the response from the function
      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to delete user');
      }

      alert('User deleted successfully!');
      loadData();
      
    } catch (error) {
      console.error('Error deleting user:', error);
      
      // Provide user-friendly error messages
      let errorMessage = 'Error deleting user: ';
      if ((error as Error).message.includes('Permission denied')) {
        errorMessage = 'You do not have permission to delete users.';
      } else if ((error as Error).message.includes('cannot delete your own account')) {
        errorMessage = 'You cannot delete your own account.';
      } else {
        errorMessage += (error as Error).message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadgeClass = (role: string): string => {
    const classes: Record<string, string> = {
      employee: 'role-badge role-employee',
      hod: 'role-badge role-hod',
      hr_admin: 'role-badge role-admin'
    };
    return classes[role] || 'role-badge role-employee';
  };

  const getRoleDisplayName = (role: string): string => {
    const names: Record<string, string> = {
      employee: 'Employee',
      hod: 'HOD',
      hr_admin: 'HR Admin'
    };
    return names[role] || 'Employee';
  };

  if (loading && users.length === 0) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading user management...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">👥</span>
              User Management
            </h1>
            <p className="page-subtitle">Manage employee accounts, roles, and permissions</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-success action-btn"
            >
              <span className="btn-icon">+</span>
              Add User
            </button>
            <button
              onClick={() => navigate('/admin/bulk')}
              className="btn btn-warning action-btn"
            >
              <span className="btn-icon">📤</span>
              Bulk Import
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card mb-6 filters-card">
          <div className="card-header filter-header">
            <h3 className="card-title">
              <span className="filter-icon">🔍</span>
              Filter Users
            </h3>
          </div>
          <div className="filter-grid user-filter-grid">
            <div className="form-group enhanced-form-group">
              <label className="form-label">Search Users</label>
              <input
                type="text"
                className="form-input enhanced-input"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="form-group enhanced-form-group">
              <label className="form-label">Department</label>
              <select
                className="form-select enhanced-select"
                value={selectedDepartment}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedDepartment(e.target.value)}
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group enhanced-form-group">
              <label className="form-label">Role</label>
              <select
                className="form-select enhanced-select"
                value={selectedRole}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedRole(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="employee">Employee</option>
                <option value="hod">HOD</option>
                <option value="hr_admin">HR Admin</option>
              </select>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="card users-table-card" style={{ overflow: 'visible' }}>
          <div className="card-header">
            <h3 className="card-title">
              Users ({filteredUsers.length})
            </h3>
          </div>
          
          {filteredUsers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">👥</div>
              <h3>No users found</h3>
              <p>No users match your current filters</p>
            </div>
          ) : (
            <div className="table-container" style={{ overflow: 'visible' }}>
              <table className="users-table" style={{ overflow: 'visible' }}>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody style={{ overflow: 'visible' }}>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className={!u.is_active ? 'user-inactive' : ''} style={{ overflow: 'visible' }}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-small">
                            {u.full_name?.charAt(0) || '?'}
                          </div>
                          <div className="user-details">
                            <div className="user-name-small">{u.full_name}</div>
                            <div className="user-phone">{u.phone || 'No phone'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>{u.departments?.name || 'Unassigned'}</td>
                      <td>
                        <span className={getRoleBadgeClass(u.role)}>
                          {getRoleDisplayName(u.role)}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${u.is_active ? 'status-active' : 'status-inactive'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={{ position: 'relative', overflow: 'visible' }}>
                        <div className="action-dropdown" style={{ position: 'relative', display: 'inline-block' }}>
                          <button 
                            className="action-menu-btn"
                            onClick={(e) => {
                              const button = e.currentTarget;
                              const rect = button.getBoundingClientRect();
                              setDropdownPosition({
                                top: rect.bottom + window.scrollY + 4,
                                left: rect.right + window.scrollX - 200
                              });
                              setActiveDropdown(activeDropdown === u.id ? null : u.id);
                            }}
                            title="Actions"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              fontSize: '1.5rem',
                              cursor: 'pointer',
                              padding: '0.25rem 0.5rem'
                            }}
                          >
                            ⋮
                          </button>
                          {activeDropdown === u.id && (
                            <>
                              <div 
                                className="dropdown-overlay" 
                                onClick={() => setActiveDropdown(null)}
                                style={{
                                  position: 'fixed',
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  zIndex: 9998,
                                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                                }}
                              />
                              <div 
                                className="dropdown-menu"
                                style={{
                                  position: 'fixed',
                                  top: '50%',
                                  left: '50%',
                                  transform: 'translate(-50%, -50%)',
                                  zIndex: 9999,
                                  minWidth: '300px',
                                  backgroundColor: '#ffffff',
                                  border: '2px solid #d1d5db',
                                  borderRadius: '12px',
                                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
                                  padding: '1rem',
                                }}>
                                  
                                <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                                  <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
                                    {u.full_name}
                                  </h3>
                                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                                    {u.email}
                                  </p>
                                </div>

                                <button
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setShowEditModal(true);
                                    setActiveDropdown(null);
                                  }}
                                  className="dropdown-item"
                                  style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '1rem',
                                    color: '#374151',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontSize: '1.25rem' }}>✏️</span>
                                  <span style={{ fontWeight: '500' }}>Edit User</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setUserForPasswordReset(u);
                                    setShowPasswordResetModal(true);
                                    setActiveDropdown(null);
                                  }}
                                  className="dropdown-item"
                                  style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '1rem',
                                    color: '#374151',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontSize: '1.25rem' }}>🔑</span>
                                  <span style={{ fontWeight: '500' }}>Reset Password</span>
                                </button>
                                <button
                                  onClick={() => {
                                    toggleUserStatus(u.id, u.is_active);
                                    setActiveDropdown(null);
                                  }}
                                  className="dropdown-item"
                                  style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '1rem',
                                    color: '#374151',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                  <span style={{ fontSize: '1.25rem' }}>
                                    {u.is_active ? '🔒' : '✅'}
                                  </span>
                                  <span style={{ fontWeight: '500' }}>{u.is_active ? 'Deactivate' : 'Activate'}</span>
                                </button>
                                <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '0.75rem 0' }}></div>
                                <button
                                  onClick={() => {
                                    handleDeleteUser(u.id, u.email);
                                    setActiveDropdown(null);
                                  }}
                                  className="dropdown-item dropdown-item-danger"
                                  style={{
                                    width: '100%',
                                    padding: '0.875rem 1rem',
                                    border: 'none',
                                    background: 'transparent',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    fontSize: '1rem',
                                    color: '#dc2626',
                                    borderRadius: '6px',
                                    transition: 'background 0.2s',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >

                                  <span style={{ fontSize: '1.25rem' }}>🗑️</span>
                                  <span style={{ fontWeight: '500' }}>Delete User</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal user-modal">
            <div className="modal-header">
              <h2 className="modal-title">Add New User</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <div className="modal-info-banner">
              <div className="info-icon">🔐</div>
              <div className="info-content">
                <strong>Secure Password Generation:</strong>
                <p>A secure random password will be generated automatically (12 characters with uppercase, lowercase, numbers, and symbols).</p>
                <p>The password will be displayed once after creation. User must change it on first login.</p>
              </div>
            </div>
            
            <form onSubmit={handleAddUser} className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUser.first_name}
                    onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                    required
                    placeholder="John"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newUser.last_name}
                    onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                    required
                    placeholder="Doe"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    className="form-input"
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    pattern="[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$"
                    title="Please enter a valid email address (e.g., user@footballkenya.org)"
                    placeholder="user@footballkenya.org"
                    required
                  />
                  <small className="form-help">
                    Accepts any valid email format including .org, .co.ke, etc.
                  </small>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Department *</label>
                  <select
                    className="form-select"
                    value={newUser.department_id}
                    onChange={(e) => setNewUser({...newUser, department_id: e.target.value})}
                    required
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select
                    className="form-select"
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value as 'employee' | 'hod' | 'hr_admin'})}
                    required
                  >
                    <option value="employee">Employee</option>
                    <option value="hod">HOD</option>
                    <option value="hr_admin">HR Admin</option>
                  </select>
                </div>
                
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newUser.is_active}
                      onChange={(e) => setNewUser({...newUser, is_active: e.target.checked})}
                    />
                    <span className="checkbox-text">Active User</span>
                  </label>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="modal-overlay">
          <div className="modal user-modal">
            <div className="modal-header">
              <h2 className="modal-title">Edit User</h2>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedUser(null);
                }}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleUpdateUser} className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedUser.first_name}
                    onChange={(e) => setSelectedUser({...selectedUser, first_name: e.target.value})}
                    required
                    placeholder="John"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={selectedUser.last_name}
                    onChange={(e) => setSelectedUser({...selectedUser, last_name: e.target.value})}
                    required
                    placeholder="Doe"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Email (Read Only)</label>
                  <input
                    type="email"
                    className="form-input"
                    value={selectedUser.email}
                    disabled
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={selectedUser.phone || ''}
                    onChange={(e) => setSelectedUser({...selectedUser, phone: e.target.value})}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Department *</label>
                  <select
                    className="form-select"
                    value={selectedUser.department_id}
                    onChange={(e) => setSelectedUser({...selectedUser, department_id: e.target.value})}
                    required
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Role *</label>
                  <select
                    className="form-select"
                    value={selectedUser.role}
                    onChange={(e) => setSelectedUser({...selectedUser, role: e.target.value as 'employee' | 'hod' | 'hr_admin'})}
                    required
                  >
                    <option value="employee">Employee</option>
                    <option value="hod">HOD</option>
                    <option value="hr_admin">HR Admin</option>
                  </select>
                </div>
                
                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedUser.is_active}
                      onChange={(e) => setSelectedUser({...selectedUser, is_active: e.target.checked})}
                    />
                    <span className="checkbox-text">Active User</span>
                  </label>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedUser(null);
                  }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Updating...' : 'Update User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Display Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal password-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header password-modal-header">
              <h2 className="modal-title">
                <span className="success-icon">✅</span>
                User Created Successfully
              </h2>
            </div>
            
            <div className="modal-body password-modal-body">
              <div className="success-message">
                <p className="success-text">
                  Account created for <strong>{generatedCredentials.fullName}</strong>
                </p>
              </div>

              <div className="credentials-container">
                <div className="credential-item">
                  <label className="credential-label">Email Address</label>
                  <div className="credential-value-wrapper">
                    <input 
                      type="text" 
                      className="credential-value" 
                      value={generatedCredentials.email} 
                      readOnly 
                    />
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(generatedCredentials.email)}
                      title="Copy email"
                    >
                      {copySuccess ? '✓' : '📋'}
                    </button>
                  </div>
                </div>

                <div className="credential-item">
                  <label className="credential-label">Temporary Password</label>
                  <div className="credential-value-wrapper">
                    <input 
                      type="text" 
                      className="credential-value password-value" 
                      value={generatedCredentials.password} 
                      readOnly 
                    />
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(generatedCredentials.password)}
                      title="Copy password"
                    >
                      {copySuccess ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="alert alert-warning password-warning">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>Save this password now - it cannot be retrieved later</li>
                  <li>Share credentials securely with the user</li>
                  <li>User will be required to change password on first login</li>
                  <li>Welcome email has been sent to the user's email address</li>
                </ul>
              </div>

              <div className="copy-all-section">
                <button
                  className="btn btn-primary btn-copy-all"
                  onClick={() => {
                    const credentials = `Email: ${generatedCredentials.email}\nPassword: ${generatedCredentials.password}`;
                    copyToClipboard(credentials);
                  }}
                >
                  📋 Copy Both Credentials
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                onClick={() => setShowPasswordModal(false)}
                className="btn btn-success w-full"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordResetModal && userForPasswordReset && (
        <PasswordResetModal
          userId={userForPasswordReset.id}
          userEmail={userForPasswordReset.email}
          userName={`${userForPasswordReset.first_name} ${userForPasswordReset.last_name}`}
          onClose={() => {
            setShowPasswordResetModal(false);
            setUserForPasswordReset(null);
          }}
          onSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default UserManagement;
