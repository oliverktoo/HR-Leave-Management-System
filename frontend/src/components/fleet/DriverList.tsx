// Driver List Component
// Displays all registered drivers

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getDrivers, createDriverProfile, updateDriverProfile } from '../../services/fleetService';
import { DriverProfile } from '../../types/fleet';
import { supabase } from '../../lib/supabaseClient';

interface User {
  id: string;
  email: string;
  full_name: string;
  department_id: string;
}

export function DriverList() {
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<DriverProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [formData, setFormData] = useState({
    user_id: '',
    license_number: '',
    license_class: '',
    license_expiry: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    notes: '',
    is_active: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load drivers
      const driversData = await getDrivers();
      setDrivers(driversData);

      // Load users for adding new drivers
      const { data: usersData, error: usersError } = await supabase
        .from('users_profile')
        .select('id, first_name, last_name, department_id')
        .eq('is_active', true)
        .order('first_name');
      
      if (usersError) {
        console.error('Error loading users:', usersError);
      }
      
      // Transform to add full_name
      const transformedUsers = (usersData || []).map((user: any) => ({
        ...user,
        full_name: `${user.first_name} ${user.last_name}`
      }));
      
      setUsers(transformedUsers);
    } catch (err) {
      console.error('Error loading drivers:', err);
      setError('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (driver?: DriverProfile) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        user_id: driver.user_id,
        license_number: driver.license_number,
        license_class: driver.license_class || '',
        license_expiry: driver.license_expiry,
        emergency_contact_name: driver.emergency_contact_name || '',
        emergency_contact_phone: driver.emergency_contact_phone || '',
        notes: driver.notes || '',
        is_active: driver.is_active,
      });
    } else {
      setEditingDriver(null);
      setFormData({
        user_id: '',
        license_number: '',
        license_class: '',
        license_expiry: '',
        emergency_contact_name: '',
        emergency_contact_phone: '',
        notes: '',
        is_active: true,
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingDriver(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.user_id) {
      setError('Please select an employee');
      return;
    }
    if (!formData.license_number) {
      setError('License number is required');
      return;
    }
    if (!formData.license_expiry) {
      setError('License expiry date is required');
      return;
    }

    try {
      setSaving(true);

      if (editingDriver) {
        await updateDriverProfile({
          id: editingDriver.id,
          license_number: formData.license_number,
          license_class: formData.license_class || undefined,
          license_expiry: formData.license_expiry,
          emergency_contact_name: formData.emergency_contact_name || undefined,
          emergency_contact_phone: formData.emergency_contact_phone || undefined,
          notes: formData.notes || undefined,
          is_active: formData.is_active,
        });
      } else {
        await createDriverProfile({
          user_id: formData.user_id,
          license_number: formData.license_number,
          license_class: formData.license_class || undefined,
          license_expiry: formData.license_expiry,
          emergency_contact_name: formData.emergency_contact_name || undefined,
          emergency_contact_phone: formData.emergency_contact_phone || undefined,
          notes: formData.notes || undefined,
        });
      }

      handleCloseModal();
      loadData();
    } catch (err: any) {
      console.error('Error saving driver:', err);
      setError(err.message || 'Failed to save driver');
    } finally {
      setSaving(false);
    }
  };

  const filteredDrivers = drivers.filter(d => {
    if (filter === 'active') return d.is_active;
    if (filter === 'inactive') return !d.is_active;
    return true;
  });

  const isLicenseExpiringSoon = (expiry: string) => {
    const expiryDate = new Date(expiry);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  };

  const isLicenseExpired = (expiry: string) => {
    return new Date(expiry) < new Date();
  };

  // Filter out users who are already drivers
  const availableUsers = users.filter(
    user => !drivers.some(d => d.user_id === user.id)
  );

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="page-header">
            <div className="header-content">
              <h1>🪪 Driver Management</h1>
              <p className="header-subtitle">Manage registered drivers and their licenses</p>
            </div>
            <button className="btn btn-primary" onClick={() => handleOpenModal()}>
              + Add Driver
            </button>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="filter-tabs mb-4">
            <button 
              className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({drivers.length})
            </button>
            <button 
              className={`filter-tab ${filter === 'active' ? 'active' : ''}`}
              onClick={() => setFilter('active')}
            >
              Active ({drivers.filter(d => d.is_active).length})
            </button>
            <button 
              className={`filter-tab ${filter === 'inactive' ? 'active' : ''}`}
              onClick={() => setFilter('inactive')}
            >
              Inactive ({drivers.filter(d => !d.is_active).length})
            </button>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading drivers...</p>
            </div>
          ) : filteredDrivers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🪪</div>
              <h3>No Drivers Found</h3>
              <p>
                {filter === 'all' 
                  ? 'No drivers have been registered yet.' 
                  : `No ${filter} drivers found.`}
              </p>
              {filter === 'all' && (
                <button className="btn btn-primary" onClick={() => handleOpenModal()}>
                  Add First Driver
                </button>
              )}
            </div>
          ) : (
            <div className="driver-grid">
              {filteredDrivers.map(driver => (
                <div key={driver.id} className={`driver-card ${!driver.is_active ? 'inactive' : ''}`}>
                  <div className="driver-header">
                    <div className="driver-avatar">
                      {driver.user_profile?.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="driver-info">
                      <h3>{driver.user_profile?.full_name || 'Unknown'}</h3>
                      <span className={`status-badge ${driver.is_active ? 'status-active' : 'status-inactive'}`}>
                        {driver.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>

                  <div className="driver-details">
                    <div className="detail-row">
                      <span className="detail-label">License #</span>
                      <span className="detail-value">{driver.license_number}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Class</span>
                      <span className="detail-value">{driver.license_class || 'N/A'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Expiry</span>
                      <span className={`detail-value ${isLicenseExpired(driver.license_expiry) ? 'text-danger' : isLicenseExpiringSoon(driver.license_expiry) ? 'text-warning' : ''}`}>
                        {new Date(driver.license_expiry).toLocaleDateString()}
                        {isLicenseExpired(driver.license_expiry) && ' ⚠️ Expired'}
                        {!isLicenseExpired(driver.license_expiry) && isLicenseExpiringSoon(driver.license_expiry) && ' ⚠️ Expiring Soon'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Total Trips</span>
                      <span className="detail-value">{driver.total_trips || 0}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Rating</span>
                      <span className="detail-value">
                        {'⭐'.repeat(Math.round(driver.driver_rating || 5))} ({driver.driver_rating?.toFixed(1) || '5.0'})
                      </span>
                    </div>
                  </div>

                  {driver.emergency_contact_name && (
                    <div className="emergency-contact">
                      <small>Emergency: {driver.emergency_contact_name} ({driver.emergency_contact_phone})</small>
                    </div>
                  )}

                  <div className="driver-actions">
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleOpenModal(driver)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Driver Modal */}
        {showModal && (
          <div className="modal-overlay">
            <div className="modal modal-lg">
              <div className="modal-header">
                <h3>{editingDriver ? 'Edit Driver' : 'Add New Driver'}</h3>
                <button className="modal-close" onClick={handleCloseModal}>×</button>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="modal-body">
                  {error && (
                    <div className="alert alert-error mb-3">
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="form-grid-2">
                    {!editingDriver && (
                      <div className="form-group full-width">
                        <label className="required">Select Employee</label>
                        <select
                          className="form-control"
                          value={formData.user_id}
                          onChange={(e) => setFormData({...formData, user_id: e.target.value})}
                          required
                        >
                          <option value="">-- Select Employee --</option>
                          {availableUsers.map(user => (
                            <option key={user.id} value={user.id}>
                              {user.full_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="required">License Number</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.license_number}
                        onChange={(e) => setFormData({...formData, license_number: e.target.value})}
                        placeholder="e.g., DL123456"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>License Class</label>
                      <select
                        className="form-control"
                        value={formData.license_class}
                        onChange={(e) => setFormData({...formData, license_class: e.target.value})}
                      >
                        <option value="">Select Class</option>
                        <option value="A">Class A - Motorcycles</option>
                        <option value="B">Class B - Light Vehicles</option>
                        <option value="C">Class C - Medium Vehicles</option>
                        <option value="D">Class D - Heavy Vehicles</option>
                        <option value="E">Class E - Articulated</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="required">License Expiry</label>
                      <input
                        type="date"
                        className="form-control"
                        value={formData.license_expiry}
                        onChange={(e) => setFormData({...formData, license_expiry: e.target.value})}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Emergency Contact Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={formData.emergency_contact_name}
                        onChange={(e) => setFormData({...formData, emergency_contact_name: e.target.value})}
                        placeholder="Contact person name"
                      />
                    </div>

                    <div className="form-group">
                      <label>Emergency Contact Phone</label>
                      <input
                        type="tel"
                        className="form-control"
                        value={formData.emergency_contact_phone}
                        onChange={(e) => setFormData({...formData, emergency_contact_phone: e.target.value})}
                        placeholder="+254..."
                      />
                    </div>

                    {editingDriver && (
                      <div className="form-group">
                        <label>Status</label>
                        <select
                          className="form-control"
                          value={formData.is_active ? 'active' : 'inactive'}
                          onChange={(e) => setFormData({...formData, is_active: e.target.value === 'active'})}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    )}

                    <div className="form-group full-width">
                      <label>Notes</label>
                      <textarea
                        className="form-control"
                        value={formData.notes}
                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                        rows={3}
                        placeholder="Additional notes..."
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleCloseModal}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : (editingDriver ? 'Update Driver' : 'Add Driver')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default DriverList;
