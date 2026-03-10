// @ts-nocheck
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  department_id: string;
  department?: { name: string };
}

interface LeaveType {
  id: string;
  name: string;
  max_days_per_year: number;
  color?: string;
}

interface LeaveBalance {
  id?: string;
  user_id: string;
  leave_type_id: string;
  year: number;
  annual_allocation: number;
  used_days: number;
  pending_days: number;
  carryforward_days: number;
}

interface PolicySettings {
  max_annual_leave_days: number;
  max_sick_leave_days: number;
  max_maternity_leave_days: number;
  max_paternity_leave_days: number;
  carry_forward_limit: number;
}

const LeaveBalanceManagement = () => {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Record<string, LeaveBalance[]>>({});
  const [policySettings, setPolicySettings] = useState<PolicySettings | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBalances, setEditingBalances] = useState<LeaveBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [applyingDefaults, setApplyingDefaults] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [departments, setDepartments] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all data in parallel
      const [usersResult, leaveTypesResult, balancesResult, settingsResult, departmentsResult] = await Promise.all([
        supabase
          .from('users_profile')
          .select('id, email, first_name, last_name, department_id')
          .eq('is_active', true)
          .neq('role', 'super_admin')
          .order('first_name'),
        
        supabase
          .from('leave_types')
          .select('id, name, max_days_per_year')
          .eq('is_active', true)
          .order('name'),
        
        supabase
          .from('leave_balances')
          .select('*')
          .eq('year', selectedYear),
        
        supabase
          .from('system_settings')
          .select('settings')
          .single(),
        
        supabase
          .from('departments')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
      ]);

      if (usersResult.error) throw usersResult.error;
      if (leaveTypesResult.error) throw leaveTypesResult.error;
      
      // Fetch department names for users
      const usersWithDepts = usersResult.data?.map(user => {
        const dept = departmentsResult.data?.find(d => d.id === user.department_id);
        return { ...user, department: dept ? { name: dept.name } : undefined };
      }) || [];

      setUsers(usersWithDepts);
      setLeaveTypes(leaveTypesResult.data || []);
      setDepartments(departmentsResult.data || []);

      // Group balances by user
      const balancesByUser: Record<string, LeaveBalance[]> = {};
      (balancesResult.data || []).forEach(balance => {
        if (!balancesByUser[balance.user_id]) {
          balancesByUser[balance.user_id] = [];
        }
        balancesByUser[balance.user_id].push(balance);
      });
      setBalances(balancesByUser);

      // Load policy settings
      if (settingsResult.data?.settings) {
        setPolicySettings(settingsResult.data.settings);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      alert('Error loading data: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultAllocation = (leaveTypeName: string): number => {
    if (!policySettings) return 0;
    
    const name = leaveTypeName.toLowerCase();
    if (name.includes('annual')) return policySettings.max_annual_leave_days || 21;
    if (name.includes('sick')) return policySettings.max_sick_leave_days || 10;
    if (name.includes('maternity')) return policySettings.max_maternity_leave_days || 90;
    if (name.includes('paternity')) return policySettings.max_paternity_leave_days || 14;
    if (name.includes('compassionate')) return 7;
    if (name.includes('study')) return 5;
    return 0;
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    
    // Create balances array for this user
    const userBalances = balances[user.id] || [];
    const editBalances: LeaveBalance[] = leaveTypes.map(lt => {
      const existing = userBalances.find(b => b.leave_type_id === lt.id);
      return existing || {
        user_id: user.id,
        leave_type_id: lt.id,
        year: selectedYear,
        annual_allocation: getDefaultAllocation(lt.name),
        used_days: 0,
        pending_days: 0,
        carryforward_days: 0
      };
    });
    
    setEditingBalances(editBalances);
    setShowEditModal(true);
  };

  const handleAllocationChange = (leaveTypeId: string, field: keyof LeaveBalance, value: number) => {
    setEditingBalances(prev => 
      prev.map(balance => 
        balance.leave_type_id === leaveTypeId 
          ? { ...balance, [field]: Math.max(0, value) }
          : balance
      )
    );
  };

  const saveBalances = async () => {
    if (!selectedUser) return;

    try {
      setSaving(true);

      for (const balance of editingBalances) {
        const { error } = await supabase
          .from('leave_balances')
          .upsert({
            user_id: balance.user_id,
            leave_type_id: balance.leave_type_id,
            year: balance.year,
            annual_allocation: balance.annual_allocation,
            used_days: balance.used_days,
            pending_days: balance.pending_days,
            carryforward_days: balance.carryforward_days
          }, {
            onConflict: 'user_id,leave_type_id,year'
          });

        if (error) throw error;
      }

      alert('Leave balances saved successfully!');
      setShowEditModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving balances:', error);
      alert('Error saving balances: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const applyDefaultsToAll = async () => {
    if (!confirm('This will apply default leave allocations to ALL employees for ' + selectedYear + '. Continue?')) {
      return;
    }

    try {
      setApplyingDefaults(true);

      for (const user of users) {
        for (const leaveType of leaveTypes) {
          const defaultAllocation = getDefaultAllocation(leaveType.name);
          
          // Check if balance already exists
          const existing = balances[user.id]?.find(b => b.leave_type_id === leaveType.id);
          
          const { error } = await supabase
            .from('leave_balances')
            .upsert({
              user_id: user.id,
              leave_type_id: leaveType.id,
              year: selectedYear,
              annual_allocation: defaultAllocation,
              used_days: existing?.used_days || 0,
              pending_days: existing?.pending_days || 0,
              carryforward_days: existing?.carryforward_days || 0
            }, {
              onConflict: 'user_id,leave_type_id,year'
            });

          if (error) throw error;
        }
      }

      alert(`Default allocations applied to ${users.length} employees!`);
      loadData();
    } catch (error) {
      console.error('Error applying defaults:', error);
      alert('Error applying defaults: ' + (error as Error).message);
    } finally {
      setApplyingDefaults(false);
    }
  };

  const applyDefaultsToUser = async (user: User) => {
    try {
      for (const leaveType of leaveTypes) {
        const defaultAllocation = getDefaultAllocation(leaveType.name);
        const existing = balances[user.id]?.find(b => b.leave_type_id === leaveType.id);
        
        const { error } = await supabase
          .from('leave_balances')
          .upsert({
            user_id: user.id,
            leave_type_id: leaveType.id,
            year: selectedYear,
            annual_allocation: defaultAllocation,
            used_days: existing?.used_days || 0,
            pending_days: existing?.pending_days || 0,
            carryforward_days: existing?.carryforward_days || 0
          }, {
            onConflict: 'user_id,leave_type_id,year'
          });

        if (error) throw error;
      }

      alert(`Defaults applied to ${user.first_name} ${user.last_name}!`);
      loadData();
    } catch (error) {
      console.error('Error applying defaults:', error);
      alert('Error: ' + (error as Error).message);
    }
  };

  const getUserBalance = (userId: string, leaveTypeId: string) => {
    return balances[userId]?.find(b => b.leave_type_id === leaveTypeId);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = selectedDepartment === 'all' || user.department_id === selectedDepartment;
    
    return matchesSearch && matchesDepartment;
  });

  if (loading) {
    return (
      <div className="app">
        <AdminSidebar />
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading leave balances...</p>
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
              <span className="title-icon">📊</span>
              Leave Balance Management
            </h1>
            <p className="page-subtitle">Set employee leave allocations based on policy settings</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button 
              className="btn btn-primary"
              onClick={applyDefaultsToAll}
              disabled={applyingDefaults}
            >
              {applyingDefaults ? 'Applying...' : '⚡ Apply Defaults to All'}
            </button>
          </div>
        </div>

        {/* Policy Settings Summary */}
        {policySettings && (
          <div className="card mb-6">
            <div className="card-header">
              <h3 className="card-title">📋 Current Policy Settings (Default Allocations)</h3>
            </div>
            <div className="stats-grid admin-stats-grid">
              <div className="stat-card">
                <div className="stat-value">{policySettings.max_annual_leave_days}</div>
                <div className="stat-label">Annual Leave</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{policySettings.max_sick_leave_days}</div>
                <div className="stat-label">Sick Leave</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{policySettings.max_maternity_leave_days}</div>
                <div className="stat-label">Maternity Leave</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{policySettings.max_paternity_leave_days}</div>
                <div className="stat-label">Paternity Leave</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card mb-6 filters-card">
          <div className="report-controls">
            <div className="control-group">
              <label className="form-label">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="form-select enhanced-select"
              >
                {[2024, 2025, 2026, 2027].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label className="form-label">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="form-select enhanced-select"
              >
                <option value="all">All Departments</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
            <div className="control-group" style={{ flex: 2 }}>
              <label className="form-label">Search Employee</label>
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input enhanced-select"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        </div>

        {/* Employees Table */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">👥 Employee Leave Allocations ({filteredUsers.length} employees)</h3>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  {leaveTypes.map(lt => (
                    <th key={lt.id} style={{ textAlign: 'center' }}>
                      {lt.name.replace(' Leave', '')}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div>
                        <strong>{user.first_name} {user.last_name}</strong>
                        <br />
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{user.email}</span>
                      </div>
                    </td>
                    <td>{user.department?.name || '-'}</td>
                    {leaveTypes.map(lt => {
                      const balance = getUserBalance(user.id, lt.id);
                      const hasBalance = balance !== undefined;
                      const available = balance 
                        ? balance.annual_allocation + balance.carryforward_days - balance.used_days - balance.pending_days
                        : 0;
                      return (
                        <td key={lt.id} style={{ textAlign: 'center' }}>
                          {hasBalance ? (
                            <span title={`Allocated: ${balance.annual_allocation}, Used: ${balance.used_days}, Pending: ${balance.pending_days}`}>
                              {available} / {balance.annual_allocation}
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Not set</span>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openEditModal(user)}
                          title="Edit allocations"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => applyDefaultsToUser(user)}
                          title="Apply default allocations"
                        >
                          ⚡ Defaults
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {showEditModal && selectedUser && (
          <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
            <div 
              className="modal-content"
              onClick={(e) => e.stopPropagation()}
              style={{ 
                maxWidth: '700px',
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
            >
              <div className="modal-header" style={{ 
                padding: '1.5rem',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb'
              }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                  Edit Leave Balances - {selectedUser.first_name} {selectedUser.last_name}
                </h2>
                <p style={{ margin: '0.5rem 0 0 0', color: '#6b7280', fontSize: '0.9rem' }}>
                  Year: {selectedYear}
                </p>
              </div>
              
              <div className="modal-body" style={{ padding: '1.5rem' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th style={{ textAlign: 'center', width: '100px' }}>Allocation</th>
                      <th style={{ textAlign: 'center', width: '80px' }}>Used</th>
                      <th style={{ textAlign: 'center', width: '80px' }}>Pending</th>
                      <th style={{ textAlign: 'center', width: '100px' }}>Carryforward</th>
                      <th style={{ textAlign: 'center', width: '80px' }}>Available</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingBalances.map(balance => {
                      const leaveType = leaveTypes.find(lt => lt.id === balance.leave_type_id);
                      const available = balance.annual_allocation + balance.carryforward_days - balance.used_days - balance.pending_days;
                      return (
                        <tr key={balance.leave_type_id}>
                          <td>
                            <span style={{ 
                              display: 'inline-block',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              backgroundColor: leaveType?.color || '#6b7280',
                              marginRight: '0.5rem'
                            }}></span>
                            {leaveType?.name || 'Unknown'}
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={balance.annual_allocation}
                              onChange={(e) => handleAllocationChange(balance.leave_type_id, 'annual_allocation', parseInt(e.target.value) || 0)}
                              className="form-input"
                              style={{ width: '80px', textAlign: 'center', padding: '0.5rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={balance.used_days}
                              onChange={(e) => handleAllocationChange(balance.leave_type_id, 'used_days', parseInt(e.target.value) || 0)}
                              className="form-input"
                              style={{ width: '60px', textAlign: 'center', padding: '0.5rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={balance.pending_days}
                              onChange={(e) => handleAllocationChange(balance.leave_type_id, 'pending_days', parseInt(e.target.value) || 0)}
                              className="form-input"
                              style={{ width: '60px', textAlign: 'center', padding: '0.5rem' }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              value={balance.carryforward_days}
                              onChange={(e) => handleAllocationChange(balance.leave_type_id, 'carryforward_days', parseInt(e.target.value) || 0)}
                              className="form-input"
                              style={{ width: '80px', textAlign: 'center', padding: '0.5rem' }}
                            />
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: available > 0 ? '#059669' : '#dc2626' }}>
                            {available}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              <div className="modal-footer" style={{ 
                padding: '1rem 1.5rem',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem'
              }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={saveBalances}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveBalanceManagement;
