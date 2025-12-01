// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';

interface PolicySettings {
  // Leave Policies
  max_annual_leave_days: number;
  max_sick_leave_days: number;
  max_maternity_leave_days: number;
  max_paternity_leave_days: number;
  leave_year_start_month: number;
  carry_forward_limit: number;
  minimum_notice_days: number;
  
  // Approval Workflows
  auto_approve_limit: number;
  require_hod_approval: boolean;
  require_hr_approval: boolean;
  escalation_days: number;
  
  // Notification Settings
  email_notifications: boolean;
  reminder_notifications: boolean;
  approval_notifications: boolean;
  deadline_notifications: boolean;
  
  // Working Days
  working_days: string[];
  exclude_weekends: boolean;
  exclude_holidays: boolean;
  
  // System Settings
  allow_backdated_requests: boolean;
  max_future_booking_months: number;
  require_manager_coverage: boolean;
  block_overlapping_requests: boolean;
}

const PolicySettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<PolicySettings>({
    // Leave Policies
    max_annual_leave_days: 21,
    max_sick_leave_days: 10,
    max_maternity_leave_days: 90,
    max_paternity_leave_days: 14,
    leave_year_start_month: 1,
    carry_forward_limit: 5,
    minimum_notice_days: 7,
    
    // Approval Workflows
    auto_approve_limit: 0,
    require_hod_approval: true,
    require_hr_approval: true,
    escalation_days: 3,
    
    // Notification Settings
    email_notifications: true,
    reminder_notifications: true,
    approval_notifications: true,
    deadline_notifications: true,
    
    // Working Days
    working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    exclude_weekends: true,
    exclude_holidays: true,
    
    // System Settings
    allow_backdated_requests: false,
    max_future_booking_months: 12,
    require_manager_coverage: true,
    block_overlapping_requests: true
  });

  const [departments, setDepartments] = useState<any[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);
  const [departmentForm, setDepartmentForm] = useState({
    name: '',
    description: '',
    head_of_department_id: ''
  });

  // Load settings when component mounts
  useEffect(() => {
    loadSettings();
    loadDepartments();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      // Load system settings from database
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') { // Ignore "no rows" and "table doesn't exist" errors
        console.warn('System settings table not found, using default settings');
        return;
      }

      if (data) {
        setSettings(prevSettings => ({
          ...prevSettings,
          ...data.settings
        }));
      }
      
    } catch (error) {
      console.warn('Error loading settings (table may not exist):', error);
      // Continue with default settings
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setDepartments(data || []);
      
    } catch (error) {
      console.error('Error loading departments:', error);
    }
  };

  const handleSettingChange = (key: keyof PolicySettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleWorkingDayToggle = (day: string) => {
    setSettings(prev => ({
      ...prev,
      working_days: prev.working_days.includes(day)
        ? prev.working_days.filter(d => d !== day)
        : [...prev.working_days, day]
    }));
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      
      const settingsData = {
        id: 1, // Singleton settings record
        settings: settings,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('system_settings')
        .upsert(settingsData);

      if (error) throw error;
      
      setShowSaveModal(false);
      alert('Settings saved successfully');
      
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const resetToDefaults = () => {
    if (!confirm('Are you sure you want to reset all settings to default values?')) {
      return;
    }

    setSettings({
      max_annual_leave_days: 21,
      max_sick_leave_days: 10,
      max_maternity_leave_days: 90,
      max_paternity_leave_days: 14,
      leave_year_start_month: 1,
      carry_forward_limit: 5,
      minimum_notice_days: 7,
      auto_approve_limit: 0,
      require_hod_approval: true,
      require_hr_approval: true,
      escalation_days: 3,
      email_notifications: true,
      reminder_notifications: true,
      approval_notifications: true,
      deadline_notifications: true,
      working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      exclude_weekends: true,
      exclude_holidays: true,
      allow_backdated_requests: false,
      max_future_booking_months: 12,
      require_manager_coverage: true,
      block_overlapping_requests: true
    });
  };

  // Department Management Functions
  const openDepartmentModal = (department: any = null) => {
    if (department) {
      setEditingDepartment(department);
      setDepartmentForm({
        name: department.name,
        description: department.description || '',
        head_of_department_id: department.head_of_department_id || ''
      });
    } else {
      setEditingDepartment(null);
      setDepartmentForm({
        name: '',
        description: '',
        head_of_department_id: ''
      });
    }
    setShowDepartmentModal(true);
  };

  const closeDepartmentModal = () => {
    setShowDepartmentModal(false);
    setEditingDepartment(null);
    setDepartmentForm({
      name: '',
      description: '',
      head_of_department_id: ''
    });
  };

  const saveDepartment = async () => {
    if (!departmentForm.name.trim()) {
      alert('Department name is required');
      return;
    }

    try {
      setLoading(true);

      if (editingDepartment) {
        // Update existing department
        const { error } = await supabase
          .from('departments')
          .update({
            name: departmentForm.name,
            description: departmentForm.description,
            head_of_department_id: departmentForm.head_of_department_id || null
          })
          .eq('id', editingDepartment.id);

        if (error) throw error;
        alert('Department updated successfully');
      } else {
        // Create new department
        const { error } = await supabase
          .from('departments')
          .insert([{
            name: departmentForm.name,
            description: departmentForm.description,
            head_of_department_id: departmentForm.head_of_department_id || null,
            is_active: true
          }]);

        if (error) throw error;
        alert('Department created successfully');
      }

      closeDepartmentModal();
      loadDepartments();
    } catch (error) {
      console.error('Error saving department:', error);
      alert('Error saving department: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const deleteDepartment = async (departmentId: string) => {
    if (!confirm('Are you sure you want to delete this department? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase
        .from('departments')
        .update({ is_active: false })
        .eq('id', departmentId);

      if (error) throw error;
      
      alert('Department deleted successfully');
      loadDepartments();
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Error deleting department: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const workingDayLabels = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
  };

  const monthLabels = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading && Object.keys(settings).length === 0) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading settings...</p>
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
              <span className="title-icon">⚙️</span>
              Policy & System Settings
            </h1>
            <p className="page-subtitle">Configure organizational policies and system parameters</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={resetToDefaults}
              className="btn btn-secondary action-btn"
            >
              <span className="btn-icon">🔄</span>
              Reset Defaults
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              className="btn btn-primary action-btn"
            >
              <span className="btn-icon">💾</span>
              Save Settings
            </button>
          </div>
        </div>

        <div className="settings-container">
          {/* Leave Policies Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">📋</span>
                Leave Policies
              </h2>
              <p className="section-desc">Configure maximum allowances and rules for different leave types</p>
            </div>
            
            <div className="settings-grid">
              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🏖️</span>
                  Annual Leave Days
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="365"
                    className="form-input enhanced-input"
                    value={settings.max_annual_leave_days}
                    onChange={(e) => handleSettingChange('max_annual_leave_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days/year</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🏥</span>
                  Sick Leave Days
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="365"
                    className="form-input enhanced-input"
                    value={settings.max_sick_leave_days}
                    onChange={(e) => handleSettingChange('max_sick_leave_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days/year</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">👶</span>
                  Maternity Leave
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="365"
                    className="form-input enhanced-input"
                    value={settings.max_maternity_leave_days}
                    onChange={(e) => handleSettingChange('max_maternity_leave_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">👨‍👶</span>
                  Paternity Leave
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="90"
                    className="form-input enhanced-input"
                    value={settings.max_paternity_leave_days}
                    onChange={(e) => handleSettingChange('max_paternity_leave_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">📅</span>
                  Leave Year Starts
                </label>
                <div className="setting-control">
                  <select
                    className="form-select enhanced-select"
                    value={settings.leave_year_start_month}
                    onChange={(e) => handleSettingChange('leave_year_start_month', parseInt(e.target.value))}
                  >
                    {monthLabels.map((month, index) => (
                      <option key={index + 1} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">📦</span>
                  Carry Forward Limit
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    className="form-input enhanced-input"
                    value={settings.carry_forward_limit}
                    onChange={(e) => handleSettingChange('carry_forward_limit', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">⏰</span>
                  Minimum Notice
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="90"
                    className="form-input enhanced-input"
                    value={settings.minimum_notice_days}
                    onChange={(e) => handleSettingChange('minimum_notice_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
              </div>
            </div>
          </div>

          {/* Approval Workflow Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">✅</span>
                Approval Workflow
              </h2>
              <p className="section-desc">Configure approval requirements and escalation rules</p>
            </div>
            
            <div className="settings-grid">
              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🚀</span>
                  Auto-Approve Limit
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="0"
                    max="30"
                    className="form-input enhanced-input"
                    value={settings.auto_approve_limit}
                    onChange={(e) => handleSettingChange('auto_approve_limit', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
                <p className="setting-help">Leave requests for this many days or fewer will be auto-approved (0 = disabled)</p>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">👔</span>
                  HOD Approval Required
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.require_hod_approval}
                      onChange={(e) => handleSettingChange('require_hod_approval', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🏢</span>
                  HR Approval Required
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.require_hr_approval}
                      onChange={(e) => handleSettingChange('require_hr_approval', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">⏱️</span>
                  Escalation Time
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="form-input enhanced-input"
                    value={settings.escalation_days}
                    onChange={(e) => handleSettingChange('escalation_days', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">days</span>
                </div>
                <p className="setting-help">Escalate to next level if no response within this time</p>
              </div>
            </div>
          </div>

          {/* Working Days Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">📅</span>
                Working Days & Calendar
              </h2>
              <p className="section-desc">Define working days and calendar calculation rules</p>
            </div>
            
            <div className="working-days-grid">
              <div className="working-days-card">
                <h4 className="card-subtitle">Working Days</h4>
                <div className="days-selector">
                  {Object.entries(workingDayLabels).map(([key, label]) => (
                    <label key={key} className="day-option">
                      <input
                        type="checkbox"
                        checked={settings.working_days.includes(key)}
                        onChange={() => handleWorkingDayToggle(key)}
                      />
                      <span className={`day-label ${settings.working_days.includes(key) ? 'active' : ''}`}>
                        {label.slice(0, 3)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="calendar-options">
                <div className="setting-card">
                  <label className="setting-label">
                    <span className="label-icon">🚫</span>
                    Exclude Weekends
                  </label>
                  <div className="setting-control">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.exclude_weekends}
                        onChange={(e) => handleSettingChange('exclude_weekends', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-card">
                  <label className="setting-label">
                    <span className="label-icon">🎄</span>
                    Exclude Holidays
                  </label>
                  <div className="setting-control">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.exclude_holidays}
                        onChange={(e) => handleSettingChange('exclude_holidays', e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* System Settings Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🔧</span>
                System Settings
              </h2>
              <p className="section-desc">Configure system behavior and restrictions</p>
            </div>
            
            <div className="settings-grid">
              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">⏪</span>
                  Allow Backdated Requests
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.allow_backdated_requests}
                      onChange={(e) => handleSettingChange('allow_backdated_requests', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">📅</span>
                  Max Future Booking
                </label>
                <div className="setting-control">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    className="form-input enhanced-input"
                    value={settings.max_future_booking_months}
                    onChange={(e) => handleSettingChange('max_future_booking_months', parseInt(e.target.value))}
                  />
                  <span className="setting-unit">months</span>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🛡️</span>
                  Require Manager Coverage
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.require_manager_coverage}
                      onChange={(e) => handleSettingChange('require_manager_coverage', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">🚫</span>
                  Block Overlapping Requests
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.block_overlapping_requests}
                      onChange={(e) => handleSettingChange('block_overlapping_requests', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Notifications Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🔔</span>
                Notification Settings
              </h2>
              <p className="section-desc">Configure email and system notification preferences</p>
            </div>
            
            <div className="settings-grid">
              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">📧</span>
                  Email Notifications
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.email_notifications}
                      onChange={(e) => handleSettingChange('email_notifications', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">⏰</span>
                  Reminder Notifications
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.reminder_notifications}
                      onChange={(e) => handleSettingChange('reminder_notifications', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">✅</span>
                  Approval Notifications
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.approval_notifications}
                      onChange={(e) => handleSettingChange('approval_notifications', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-card">
                <label className="setting-label">
                  <span className="label-icon">⏰</span>
                  Deadline Notifications
                </label>
                <div className="setting-control">
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={settings.deadline_notifications}
                      onChange={(e) => handleSettingChange('deadline_notifications', e.target.checked)}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Department Management Section */}
          <div className="settings-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🏢</span>
                Department Management
              </h2>
              <p className="section-desc">Manage organizational departments and department heads</p>
              <button
                onClick={() => openDepartmentModal()}
                className="btn btn-primary"
              >
                <span className="btn-icon">➕</span>
                Add Department
              </button>
            </div>
            
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Department Name</th>
                    <th>Description</th>
                    <th>Head of Department</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center">
                        No departments found. Add your first department to get started.
                      </td>
                    </tr>
                  ) : (
                    departments.map((dept) => (
                      <tr key={dept.id}>
                        <td>
                          <strong>{dept.name}</strong>
                        </td>
                        <td>{dept.description || '-'}</td>
                        <td>
                          {dept.head_of_department_id ? (
                            <span className="badge badge-success">Assigned</span>
                          ) : (
                            <span className="badge badge-warning">Not Assigned</span>
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              onClick={() => openDepartmentModal(dept)}
                              className="btn btn-sm btn-secondary"
                              title="Edit Department"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteDepartment(dept.id)}
                              className="btn btn-sm btn-danger"
                              title="Delete Department"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Department Modal */}
        {showDepartmentModal && (
          <div className="modal-overlay">
            <div className="modal">
              <div className="modal-header">
                <h2 className="modal-title">
                  <span className="modal-icon">🏢</span>
                  {editingDepartment ? 'Edit Department' : 'Add New Department'}
                </h2>
                <button
                  onClick={closeDepartmentModal}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-content">
                <form onSubmit={(e) => { e.preventDefault(); saveDepartment(); }}>
                  <div className="form-group">
                    <label htmlFor="dept-name" className="form-label">
                      Department Name *
                    </label>
                    <input
                      id="dept-name"
                      type="text"
                      className="form-input"
                      placeholder="e.g., Human Resources"
                      value={departmentForm.name}
                      onChange={(e) => setDepartmentForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="dept-desc" className="form-label">
                      Description
                    </label>
                    <textarea
                      id="dept-desc"
                      className="form-input"
                      rows={3}
                      placeholder="Brief description of the department"
                      value={departmentForm.description}
                      onChange={(e) => setDepartmentForm(prev => ({ ...prev, description: e.target.value }))}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="dept-hod" className="form-label">
                      Head of Department
                    </label>
                    <select
                      id="dept-hod"
                      className="form-input"
                      value={departmentForm.head_of_department_id}
                      onChange={(e) => setDepartmentForm(prev => ({ ...prev, head_of_department_id: e.target.value }))}
                    >
                      <option value="">Select HOD (Optional)</option>
                      {/* This will be populated from users with HOD role */}
                      <option value="">Not Assigned</option>
                    </select>
                    <p className="form-help">
                      Note: HOD can be assigned later from User Management
                    </p>
                  </div>
                </form>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={closeDepartmentModal}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDepartment}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  <span className="btn-icon">
                    {loading ? '⏳' : '💾'}
                  </span>
                  {loading ? 'Saving...' : editingDepartment ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save Confirmation Modal */}
        {showSaveModal && (
          <div className="modal-overlay">
            <div className="modal save-modal">
              <div className="modal-header">
                <h2 className="modal-title">
                  <span className="modal-icon">💾</span>
                  Save Settings
                </h2>
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-content">
                <p className="save-warning">
                  Are you sure you want to save these settings? Changes will affect all users and leave calculations.
                </p>
                
                <div className="settings-summary">
                  <h4>Key Changes:</h4>
                  <ul>
                    <li>Annual leave allowance: {settings.max_annual_leave_days} days</li>
                    <li>Sick leave allowance: {settings.max_sick_leave_days} days</li>
                    <li>Minimum notice period: {settings.minimum_notice_days} days</li>
                    <li>Carry forward limit: {settings.carry_forward_limit} days</li>
                  </ul>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={saveSettings}
                  className="btn btn-primary"
                  disabled={loading}
                >
                  <span className="btn-icon">
                    {loading ? '⏳' : '💾'}
                  </span>
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolicySettings;