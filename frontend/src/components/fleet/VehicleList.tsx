// Vehicle List Component
// Shows all vehicles with filtering and management options

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { getVehicles, deleteVehicle, createVehicle, updateVehicle } from '../../services/fleetService';
import { FleetVehicle, VehicleStatus, VehicleFuelType, VehicleFilters, CreateVehicleInput } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';

interface Department {
  id: string;
  name: string;
}

export function VehicleList() {
  const { profile } = useAuth();
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VehicleFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateVehicleInput>({
    plate_number: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    fuel_type: 'petrol',
    seating_capacity: 5,
    current_odometer: 0,
  });
  const [status, setStatus] = useState<VehicleStatus>('available');

  const canManage = profile?.role === 'fleet_manager' || profile?.role === 'super_admin' || profile?.role === 'hr_admin';

  useEffect(() => {
    loadData();
  }, [filters]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load departments for filter
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
      
      setDepartments(depts || []);
      
      // Load vehicles
      const data = await getVehicles(filters);
      setVehicles(data);
    } catch (err) {
      console.error('Error loading vehicles:', err);
      setError('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = async (vehicle?: FleetVehicle) => {
    if (vehicle) {
      setEditingVehicle(vehicle);
      setFormData({
        plate_number: vehicle.plate_number,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year || new Date().getFullYear(),
        color: vehicle.color || undefined,
        fuel_type: vehicle.fuel_type,
        seating_capacity: vehicle.seating_capacity,
        current_odometer: vehicle.current_odometer || 0,
        insurance_expiry: vehicle.insurance_expiry || undefined,
        next_service_date: vehicle.next_service_date || undefined,
        next_service_odometer: vehicle.next_service_odometer || undefined,
        assigned_department_id: vehicle.assigned_department_id || undefined,
        notes: vehicle.notes || undefined,
      });
      setStatus(vehicle.status);
    } else {
      setEditingVehicle(null);
      setFormData({
        plate_number: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        fuel_type: 'petrol',
        seating_capacity: 5,
        current_odometer: 0,
      });
      setStatus('available');
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingVehicle(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.plate_number?.trim()) {
      setError('Plate number is required');
      return;
    }
    if (!formData.make?.trim()) {
      setError('Make is required');
      return;
    }
    if (!formData.model?.trim()) {
      setError('Model is required');
      return;
    }

    try {
      setSaving(true);

      if (editingVehicle) {
        await updateVehicle({
          id: editingVehicle.id,
          ...formData,
          status,
        });
      } else {
        await createVehicle({
          ...formData,
          status,
        });
      }

      handleCloseModal();
      loadData();
    } catch (err: any) {
      console.error('Error saving vehicle:', err);
      setError(err.message || 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, plateNumber: string) => {
    if (!confirm(`Are you sure you want to retire vehicle ${plateNumber}?`)) {
      return;
    }

    try {
      await deleteVehicle(id);
      await loadData();
    } catch (err) {
      console.error('Error retiring vehicle:', err);
      setError('Failed to retire vehicle');
    }
  };

  const getStatusBadge = (status: VehicleStatus) => {
    const statusConfig: Record<VehicleStatus, { class: string; label: string }> = {
      available: { class: 'badge-success', label: 'Available' },
      in_use: { class: 'badge-primary', label: 'In Use' },
      maintenance: { class: 'badge-warning', label: 'Maintenance' },
      retired: { class: 'badge-secondary', label: 'Retired' },
    };
    const config = statusConfig[status] || statusConfig.available;
    return <span className={`badge ${config.class}`}>{config.label}</span>;
  };

  const getFuelTypeIcon = (fuelType: VehicleFuelType) => {
    const icons: Record<VehicleFuelType, string> = {
      petrol: '⛽',
      diesel: '🛢️',
      electric: '⚡',
      hybrid: '🔋',
    };
    return icons[fuelType] || '⛽';
  };

  const clearFilters = () => {
    setFilters({});
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <h1 className="page-title">🚙 Vehicles</h1>
            <NotificationBell />
          </div>
          <div className="header-content">
            <p className="page-subtitle">Manage fleet vehicles</p>
          </div>
          {canManage && (
            <button 
              className="btn btn-primary"
              onClick={() => handleOpenModal()}
            >
              + Add Vehicle
            </button>
          )}
        </div>

        {error && !showModal && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Filters */}
        <div className="card mb-4">
          <div className="card-header">
            <button 
              className="btn btn-link"
              onClick={() => setShowFilters(!showFilters)}
            >
              🔍 {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
            {Object.keys(filters).length > 0 && (
              <button 
                className="btn btn-sm btn-secondary"
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
          
          {showFilters && (
            <div className="card-body">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="form-group">
                  <label className="form-label">Search</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Plate, make, or model..."
                    value={filters.search || ''}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={filters.status || ''}
                    onChange={(e) => setFilters({ 
                      ...filters, 
                      status: e.target.value as VehicleStatus || undefined 
                    })}
                  >
                    <option value="">All Statuses</option>
                    <option value="available">Available</option>
                    <option value="in_use">In Use</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Fuel Type</label>
                  <select
                    className="form-select"
                    value={filters.fuel_type || ''}
                    onChange={(e) => setFilters({ 
                      ...filters, 
                      fuel_type: e.target.value as VehicleFuelType || undefined 
                    })}
                  >
                    <option value="">All Fuel Types</option>
                    <option value="petrol">Petrol</option>
                    <option value="diesel">Diesel</option>
                    <option value="electric">Electric</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select
                    className="form-select"
                    value={filters.department_id || ''}
                    onChange={(e) => setFilters({ 
                      ...filters, 
                      department_id: e.target.value || undefined 
                    })}
                  >
                    <option value="">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

          {/* Vehicle List */}
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading vehicles...</p>
            </div>
          ) : vehicles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚗</div>
              <h3>No vehicles found</h3>
              <p>
                {Object.keys(filters).length > 0 
                  ? 'Try adjusting your filters'
                  : 'Start by adding your first vehicle'}
              </p>
              {canManage && Object.keys(filters).length === 0 && (
                <button 
                  className="btn btn-primary mt-2"
                  onClick={() => handleOpenModal()}
                >
                  ➕ Add Vehicle
                </button>
              )}
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Fuel Type</th>
                        <th>Odometer</th>
                        <th>Insurance</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((vehicle) => (
                        <tr key={vehicle.id}>
                          <td>
                            <div>
                              <div className="font-semibold text-gray-900">{vehicle.plate_number}</div>
                              <div className="text-sm text-gray-600">{vehicle.make} {vehicle.model}</div>
                              {vehicle.year && (
                                <div className="text-xs text-gray-500">{vehicle.year}</div>
                              )}
                            </div>
                          </td>
                          <td>
                            {getStatusBadge(vehicle.status)}
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span>{getFuelTypeIcon(vehicle.fuel_type)}</span>
                              <span className="capitalize">{vehicle.fuel_type}</span>
                            </div>
                          </td>
                          <td>
                            {vehicle.current_odometer ? `${vehicle.current_odometer.toLocaleString()} km` : 'N/A'}
                          </td>
                          <td>
                            {vehicle.insurance_expiry ? (
                              <span className={`text-sm ${
                                new Date(vehicle.insurance_expiry) <= new Date() 
                                  ? 'text-red-600' 
                                  : new Date(vehicle.insurance_expiry) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                  ? 'text-yellow-600'
                                  : 'text-green-600'
                              }`}>
                                {new Date(vehicle.insurance_expiry).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                              </span>
                            ) : 'N/A'}
                          </td>
                          <td>
                            {canManage && (
                              <div className="flex gap-2">
                                <button 
                                  className="btn btn-sm btn-secondary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenModal(vehicle);
                                  }}
                                >
                                  Edit
                                </button>
                                {vehicle.status !== 'retired' && (
                                  <button 
                                    className="btn btn-sm btn-danger"
                                    onClick={(_e) => handleDelete(vehicle.id, vehicle.plate_number)}
                                  >
                                    Retire
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Results Summary */}
          {vehicles.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              Showing {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

      {/* Add/Edit Vehicle Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal modal-lg">
            <div className="modal-header">
              <h3>{editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
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
                  <div className="form-group">
                    <label className="form-label">Plate Number *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.plate_number}
                      onChange={(e) => setFormData({...formData, plate_number: e.target.value.toUpperCase()})}
                      placeholder="e.g., KBZ 123A"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                    >
                      <option value="available">Available</option>
                      <option value="in_use">In Use</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="retired">Retired</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Make *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.make}
                      onChange={(e) => setFormData({...formData, make: e.target.value})}
                      placeholder="e.g., Toyota"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Model *</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.model}
                      onChange={(e) => setFormData({...formData, model: e.target.value})}
                      placeholder="e.g., Hiace"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Year</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.year || ''}
                      onChange={(e) => setFormData({...formData, year: parseInt(e.target.value) || undefined})}
                      placeholder="e.g., 2020"
                      min="1900"
                      max={new Date().getFullYear() + 1}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Color</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.color || ''}
                      onChange={(e) => setFormData({...formData, color: e.target.value})}
                      placeholder="e.g., White"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Fuel Type</label>
                    <select
                      className="form-select"
                      value={formData.fuel_type}
                      onChange={(e) => setFormData({...formData, fuel_type: e.target.value as VehicleFuelType})}
                    >
                      <option value="petrol">Petrol</option>
                      <option value="diesel">Diesel</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Seating Capacity</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.seating_capacity}
                      onChange={(e) => setFormData({...formData, seating_capacity: parseInt(e.target.value) || 5})}
                      min="1"
                      max="50"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Current Odometer (km)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.current_odometer || ''}
                      onChange={(e) => setFormData({...formData, current_odometer: parseInt(e.target.value) || 0})}
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Department</label>
                    <select
                      className="form-select"
                      value={formData.assigned_department_id || ''}
                      onChange={(e) => setFormData({...formData, assigned_department_id: e.target.value || undefined})}
                    >
                      <option value="">-- No Department --</option>
                      {departments.map(dept => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Insurance Expiry</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.insurance_expiry || ''}
                      onChange={(e) => setFormData({...formData, insurance_expiry: e.target.value || undefined})}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Next Service Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={formData.next_service_date || ''}
                      onChange={(e) => setFormData({...formData, next_service_date: e.target.value || undefined})}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Next Service Odometer (km)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={formData.next_service_odometer || ''}
                      onChange={(e) => setFormData({...formData, next_service_odometer: parseInt(e.target.value) || undefined})}
                      min="0"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label className="form-label">Notes</label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      placeholder="Additional notes about this vehicle..."
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleCloseModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default VehicleList;
