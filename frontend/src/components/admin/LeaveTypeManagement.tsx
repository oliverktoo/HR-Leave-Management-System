import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';
import type { LeaveType } from '../../types';

interface LeaveTypeFormData {
  name: string;
  description: string;
  max_days_per_year: number;
  default_days_per_year: number;
  is_carried_forward: boolean;
  max_carryforward_days: number;
  requires_documentation: boolean;
  min_notice_days: number;
  max_consecutive_days: number;
  color: string;
  is_active: boolean;
  is_paid: boolean;
}

const LeaveTypeManagement = () => {
  const [loading, setLoading] = useState(true);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLeaveType, setSelectedLeaveType] = useState<(LeaveType & Partial<LeaveTypeFormData>) | null>(null);
  
  const [newLeaveType, setNewLeaveType] = useState<LeaveTypeFormData>({
    name: '',
    description: '',
    max_days_per_year: 30,
    default_days_per_year: 30,
    is_carried_forward: false,
    max_carryforward_days: 0,
    requires_documentation: false,
    min_notice_days: 1,
    max_consecutive_days: 365,
    color: '#3b82f6',
    is_active: true,
    is_paid: true,
  });

  // Load leave types when component mounts
  useEffect(() => {
    loadLeaveTypes();
  }, []);

  const loadLeaveTypes = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('leave_types')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setLeaveTypes(data || []);
      
    } catch (error) {
      console.error('Error loading leave types:', error);
      alert('Error loading leave types: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLeaveType = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('leave_types')
        .insert([newLeaveType]);

      if (error) throw error;

      setShowAddModal(false);
      setNewLeaveType({
        name: '',
        description: '',
        max_days_per_year: 30,
        default_days_per_year: 30,
        is_carried_forward: false,
        max_carryforward_days: 0,
        requires_documentation: false,
        min_notice_days: 1,
        max_consecutive_days: 365,
        color: '#3b82f6',
        is_active: true,
        is_paid: true,
      });

      loadLeaveTypes();
      alert('Leave type created successfully!');
      
    } catch (error) {
      console.error('Error adding leave type:', error);
      alert('Error creating leave type: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLeaveType = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLeaveType) return;

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('leave_types')
        .update({
          name: selectedLeaveType.name,
          description: selectedLeaveType.description,
          max_days_per_year: selectedLeaveType.max_days_per_year,
          default_days_per_year: selectedLeaveType.default_days_per_year,
          is_carried_forward: selectedLeaveType.is_carried_forward,
          max_carryforward_days: selectedLeaveType.max_carryforward_days,
          requires_documentation: selectedLeaveType.requires_documentation,
          min_notice_days: selectedLeaveType.min_notice_days,
          max_consecutive_days: selectedLeaveType.max_consecutive_days,
          color: selectedLeaveType.color,
          is_active: selectedLeaveType.is_active
        })
        .eq('id', selectedLeaveType.id);

      if (error) throw error;

      setShowEditModal(false);
      setSelectedLeaveType(null);
      loadLeaveTypes();
      alert('Leave type updated successfully!');
      
    } catch (error) {
      console.error('Error updating leave type:', error);
      alert('Error updating leave type: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleLeaveTypeStatus = async (leaveTypeId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('leave_types')
        .update({ is_active: !currentStatus })
        .eq('id', leaveTypeId);

      if (error) throw error;
      
      loadLeaveTypes();
      
    } catch (error) {
      console.error('Error toggling leave type status:', error);
      alert('Error updating leave type status: ' + (error as Error).message);
    }
  };

  const duplicateLeaveType = (leaveType: LeaveType) => {
    setNewLeaveType({
      name: `${leaveType.name} (Copy)`,
      description: leaveType.description || '',
      max_days_per_year: leaveType.max_days_per_year,
      default_days_per_year: leaveType.default_days_per_year,
      is_carried_forward: leaveType.is_carried_forward,
      max_carryforward_days: leaveType.max_carryforward_days,
      requires_documentation: leaveType.requires_documentation,
      min_notice_days: leaveType.min_notice_days,
      max_consecutive_days: leaveType.max_consecutive_days,
      color: leaveType.color ?? '',
      is_active: true,
      is_paid: (leaveType as any).is_paid ?? true
    });
    setShowAddModal(true);
  };

  const predefinedColors = [
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Yellow
    '#ef4444', // Red
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#f97316', // Orange
    '#84cc16', // Lime
    '#ec4899', // Pink
    '#6b7280'  // Gray
  ];

  if (loading && leaveTypes.length === 0) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading leave types...</p>
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
              <span className="title-icon">📋</span>
              Leave Type Management
            </h1>
            <p className="page-subtitle">Configure leave policies, allocations, and business rules</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-success action-btn"
            >
              <span className="btn-icon">+</span>
              Add Leave Type
            </button>
          </div>
        </div>

        {/* Leave Types Grid */}
        <div className="leave-types-grid">
          {leaveTypes.map((leaveType) => (
            <div 
              key={leaveType.id} 
              className={`leave-type-card ${!leaveType.is_active ? 'leave-type-inactive' : ''}`}
            >
              {/* Color Bar */}
              <div 
                className="leave-type-color-bar"
                style={{ backgroundColor: leaveType.color }}
              ></div>
              
              {/* Header */}
              <div className="leave-type-header">
                <div className="leave-type-title-section">
                  <h3 className="leave-type-title">{leaveType.name}</h3>
                  <p className="leave-type-description">{leaveType.description}</p>
                </div>
                <div className="leave-type-status">
                  <span className={`status-badge ${leaveType.is_active ? 'status-active' : 'status-inactive'}`}>
                    {leaveType.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Policy Details */}
              <div className="leave-type-details">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Annual Allocation</span>
                    <span className="detail-value">{leaveType.default_days_per_year} days</span>
                  </div>
                  
                  <div className="detail-item">
                    <span className="detail-label">Maximum per Year</span>
                    <span className="detail-value">{leaveType.max_days_per_year} days</span>
                  </div>
                  
                  <div className="detail-item">
                    <span className="detail-label">Carryforward</span>
                    <span className="detail-value">
                      {leaveType.is_carried_forward 
                        ? `${leaveType.max_carryforward_days} days`
                        : 'No'
                      }
                    </span>
                  </div>
                  
                  <div className="detail-item">
                    <span className="detail-label">Min Notice</span>
                    <span className="detail-value">{leaveType.min_notice_days} day(s)</span>
                  </div>
                  
                  <div className="detail-item">
                    <span className="detail-label">Max Consecutive</span>
                    <span className="detail-value">
                      {leaveType.max_consecutive_days >= 365 ? 'Unlimited' : `${leaveType.max_consecutive_days} days`}
                    </span>
                  </div>
                  
                  <div className="detail-item">
                    <span className="detail-label">Documentation</span>
                    <span className="detail-value">
                      {leaveType.requires_documentation ? 'Required' : 'Optional'}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="leave-type-features">
                  {leaveType.is_carried_forward && (
                    <span className="feature-badge feature-carryforward">
                      📅 Carryforward
                    </span>
                  )}
                  {leaveType.requires_documentation && (
                    <span className="feature-badge feature-docs">
                      📎 Docs Required
                    </span>
                  )}
                  {leaveType.min_notice_days > 1 && (
                    <span className="feature-badge feature-notice">
                      ⏰ {leaveType.min_notice_days}d Notice
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="leave-type-actions">
                <button
                  onClick={() => {
                    setSelectedLeaveType(leaveType);
                    setShowEditModal(true);
                  }}
                  className="btn btn-sm btn-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => duplicateLeaveType(leaveType)}
                  className="btn btn-sm btn-secondary"
                >
                  Duplicate
                </button>
                <button
                  onClick={() => toggleLeaveTypeStatus(leaveType.id, leaveType.is_active)}
                  className={`btn btn-sm ${leaveType.is_active ? 'btn-warning' : 'btn-success'}`}
                >
                  {leaveType.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {leaveTypes.length === 0 && (
            <div className="leave-types-empty">
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <h3>No leave types configured</h3>
                <p>Create your first leave type to get started</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="btn btn-primary"
                >
                  Add Leave Type
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Leave Type Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal leave-type-modal">
            <div className="modal-header">
              <h2 className="modal-title">Add New Leave Type</h2>
              <button 
                onClick={() => setShowAddModal(false)}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleAddLeaveType} className="modal-body">
              <div className="form-grid">
                {/* Basic Information */}
                <div className="form-section">
                  <h4 className="form-section-title">Basic Information</h4>
                  
                  <div className="form-group">
                    <label className="form-label">Leave Type Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newLeaveType.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, name: e.target.value})}
                      placeholder="e.g., Annual Leave, Sick Leave, Maternity Leave"
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={newLeaveType.description}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNewLeaveType({...newLeaveType, description: e.target.value})}
                      placeholder="Describe when this leave type should be used"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Color Theme</label>
                    <div className="color-picker">
                      {predefinedColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-option ${newLeaveType.color === color ? 'color-selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setNewLeaveType({...newLeaveType, color})}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Allocation Settings */}
                <div className="form-section">
                  <h4 className="form-section-title">Allocation Settings</h4>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Default Annual Allocation *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={newLeaveType.default_days_per_year}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, default_days_per_year: Number(e.target.value)})}
                        min="0"
                        max="365"
                        required
                      />
                      <small className="form-help">Days allocated to new employees per year</small>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Maximum per Year *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={newLeaveType.max_days_per_year}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, max_days_per_year: Number(e.target.value)})}
                        min="0"
                        max="365"
                        required
                      />
                      <small className="form-help">Maximum days an employee can take per year</small>
                    </div>
                  </div>
                </div>

                {/* Policy Rules */}
                <div className="form-section">
                  <h4 className="form-section-title">Policy Rules</h4>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Minimum Notice (days)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={newLeaveType.min_notice_days}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, min_notice_days: Number(e.target.value)})}
                        min="0"
                        max="90"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Max Consecutive Days</label>
                      <input
                        type="number"
                        className="form-input"
                        value={newLeaveType.max_consecutive_days}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, max_consecutive_days: Number(e.target.value)})}
                        min="1"
                        max="365"
                      />
                      <small className="form-help">Set to 365 for unlimited</small>
                    </div>
                  </div>

                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newLeaveType.requires_documentation}
                        onChange={(e) => setNewLeaveType({...newLeaveType, requires_documentation: e.target.checked})}
                      />
                      <span className="checkbox-text">Requires Supporting Documentation</span>
                    </label>
                  </div>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newLeaveType.is_paid}
                        onChange={(e) => setNewLeaveType({...newLeaveType, is_paid: e.target.checked})}
                      />
                      <span className="checkbox-text">Paid Leave (no salary deduction)</span>
                    </label>
                    <small className="form-help">Uncheck for unpaid leave — payroll will prorate salary</small>
                  </div>
                </div>

                {/* Carryforward Rules */}
                <div className="form-section">
                  <h4 className="form-section-title">Carryforward Rules</h4>
                  
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={newLeaveType.is_carried_forward}
                        onChange={(e) => setNewLeaveType({...newLeaveType, is_carried_forward: e.target.checked})}
                      />
                      <span className="checkbox-text">Allow unused days to carry forward to next year</span>
                    </label>
                  </div>

                  {newLeaveType.is_carried_forward && (
                    <div className="form-group">
                      <label className="form-label">Maximum Carryforward Days</label>
                      <input
                        type="number"
                        className="form-input"
                        value={newLeaveType.max_carryforward_days}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewLeaveType({...newLeaveType, max_carryforward_days: Number(e.target.value)})}
                        min="0"
                        max="365"
                      />
                    </div>
                  )}
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newLeaveType.is_active}
                      onChange={(e) => setNewLeaveType({...newLeaveType, is_active: e.target.checked})}
                    />
                    <span className="checkbox-text">Active Leave Type</span>
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
                  {loading ? 'Creating...' : 'Create Leave Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Leave Type Modal */}
      {showEditModal && selectedLeaveType && (
        <div className="modal-overlay">
          <div className="modal leave-type-modal">
            <div className="modal-header">
              <h2 className="modal-title">Edit Leave Type</h2>
              <button 
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedLeaveType(null);
                }}
                className="modal-close"
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleUpdateLeaveType} className="modal-body">
              <div className="form-grid">
                <div className="form-section">
                  <h4 className="form-section-title">Basic Information</h4>
                  
                  <div className="form-group">
                    <label className="form-label">Leave Type Name *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={selectedLeaveType.name}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, name: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={selectedLeaveType.description || ''}
                      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSelectedLeaveType({...selectedLeaveType, description: e.target.value})}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Color Theme</label>
                    <div className="color-picker">
                      {predefinedColors.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`color-option ${selectedLeaveType.color === color ? 'color-selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() => setSelectedLeaveType({...selectedLeaveType, color})}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Allocation Settings */}
                <div className="form-section">
                  <h4 className="form-section-title">Allocation Settings</h4>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Default Annual Allocation *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={selectedLeaveType.default_days_per_year || 0}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, default_days_per_year: Number(e.target.value)})}
                        min="0"
                        max="365"
                        required
                      />
                      <small className="form-help">Days allocated to new employees per year</small>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Maximum per Year *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={selectedLeaveType.max_days_per_year || 0}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, max_days_per_year: Number(e.target.value)})}
                        min="0"
                        max="365"
                        required
                      />
                      <small className="form-help">Maximum days an employee can take per year</small>
                    </div>
                  </div>
                </div>

                {/* Business Rules */}
                <div className="form-section">
                  <h4 className="form-section-title">Business Rules</h4>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Minimum Notice (days) *</label>
                      <input
                        type="number"
                        className="form-input"
                        value={selectedLeaveType.min_notice_days || 0}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, min_notice_days: Number(e.target.value)})}
                        min="0"
                        max="90"
                        required
                      />
                      <small className="form-help">Days before leave start date</small>
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Max Consecutive Days</label>
                      <input
                        type="number"
                        className="form-input"
                        value={selectedLeaveType.max_consecutive_days || 365}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, max_consecutive_days: Number(e.target.value)})}
                        min="1"
                        max="365"
                        placeholder="365 for unlimited"
                      />
                      <small className="form-help">Maximum consecutive days allowed (365 = unlimited)</small>
                    </div>
                  </div>
                  
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedLeaveType.requires_documentation || false}
                        onChange={(e) => setSelectedLeaveType({...selectedLeaveType, requires_documentation: e.target.checked})}
                      />
                      <span className="checkbox-text">Requires Documentation</span>
                    </label>
                    <small className="form-help">Employee must upload supporting documents</small>
                  </div>
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(selectedLeaveType as LeaveType & { is_paid?: boolean }).is_paid ?? true}
                        onChange={(e) => setSelectedLeaveType({...selectedLeaveType, is_paid: e.target.checked} as typeof selectedLeaveType)}
                      />
                      <span className="checkbox-text">Paid Leave (no salary deduction)</span>
                    </label>
                    <small className="form-help">Uncheck for unpaid leave — payroll will prorate salary</small>
                  </div>
                </div>

                {/* Carryforward Settings */}
                <div className="form-section">
                  <h4 className="form-section-title">Carryforward Settings</h4>
                  
                  <div className="form-group checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedLeaveType.is_carried_forward || false}
                        onChange={(e) => setSelectedLeaveType({...selectedLeaveType, is_carried_forward: e.target.checked})}
                      />
                      <span className="checkbox-text">Allow Carryforward</span>
                    </label>
                    <small className="form-help">Enable unused days to roll over to next year</small>
                  </div>
                  
                  {selectedLeaveType.is_carried_forward && (
                    <div className="form-group">
                      <label className="form-label">Maximum Carryforward Days</label>
                      <input
                        type="number"
                        className="form-input"
                        value={selectedLeaveType.max_carryforward_days || 0}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedLeaveType({...selectedLeaveType, max_carryforward_days: Number(e.target.value)})}
                        min="0"
                        max="365"
                      />
                      <small className="form-help">Maximum days that can be carried forward</small>
                    </div>
                  )}
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedLeaveType.is_active}
                      onChange={(e) => setSelectedLeaveType({...selectedLeaveType, is_active: e.target.checked})}
                    />
                    <span className="checkbox-text">Active Leave Type</span>
                  </label>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedLeaveType(null);
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
                  {loading ? 'Updating...' : 'Update Leave Type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveTypeManagement;
