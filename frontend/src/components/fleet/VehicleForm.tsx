// Vehicle Form Component
// Add or edit a vehicle

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { createVehicle, getVehicleById, updateVehicle } from '../../services/fleetService';
import { CreateVehicleInput, VehicleFuelType, VehicleStatus } from '../../types/fleet';
import { supabase } from '../../lib/supabaseClient';

interface Department {
  id: string;
  name: string;
}

export function VehicleForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = !!id;

  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    loadInitialData();
  }, [id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load departments
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name')
        .order('name');
      setDepartments(depts || []);

      // Load vehicle if editing
      if (id) {
        const vehicle = await getVehicleById(id);
        if (vehicle) {
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
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.plate_number.trim()) {
      setError('Plate number is required');
      return;
    }
    if (!formData.make.trim()) {
      setError('Make is required');
      return;
    }
    if (!formData.model.trim()) {
      setError('Model is required');
      return;
    }

    try {
      setSaving(true);

      if (isEditing && id) {
        await updateVehicle({
          id,
          ...formData,
          status,
        });
      } else {
        await createVehicle(formData);
      }

      navigate('/fleet/vehicles');
    } catch (err: any) {
      console.error('Error saving vehicle:', err);
      setError(err.message || 'Failed to save vehicle');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof CreateVehicleInput, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="page-header">
            <div className="header-content">
              <button 
                className="btn btn-link"
                onClick={() => navigate('/fleet/vehicles')}
                style={{ padding: 0, marginBottom: '0.5rem' }}
              >
                ← Back to Vehicles
              </button>
              <h1>{isEditing ? '✏️ Edit Vehicle' : '🚙 Add New Vehicle'}</h1>
              <p className="header-subtitle">
                {isEditing ? 'Update vehicle information' : 'Register a new vehicle to the fleet'}
              </p>
            </div>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="admin-card">
              <div className="card-header">
                <h2 className="card-title">Vehicle Details</h2>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label className="required">Plate Number</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.plate_number}
                      onChange={(e) => handleChange('plate_number', e.target.value.toUpperCase())}
                      placeholder="e.g., KBZ 123A"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="required">Make</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.make}
                      onChange={(e) => handleChange('make', e.target.value)}
                      placeholder="e.g., Toyota"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="required">Model</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.model}
                      onChange={(e) => handleChange('model', e.target.value)}
                      placeholder="e.g., Land Cruiser"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Year</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.year || ''}
                      onChange={(e) => handleChange('year', parseInt(e.target.value) || undefined)}
                      min="1990"
                      max={new Date().getFullYear() + 1}
                    />
                  </div>

                  <div className="form-group">
                    <label>Color</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.color || ''}
                      onChange={(e) => handleChange('color', e.target.value || undefined)}
                      placeholder="e.g., White"
                    />
                  </div>

                  <div className="form-group">
                    <label className="required">Fuel Type</label>
                    <select
                      className="form-control"
                      value={formData.fuel_type}
                      onChange={(e) => handleChange('fuel_type', e.target.value as VehicleFuelType)}
                      required
                    >
                      <option value="petrol">Petrol</option>
                      <option value="diesel">Diesel</option>
                      <option value="electric">Electric</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="required">Seating Capacity</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.seating_capacity}
                      onChange={(e) => handleChange('seating_capacity', parseInt(e.target.value) || 5)}
                      min="1"
                      max="50"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Current Odometer (km)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.current_odometer || ''}
                      onChange={(e) => handleChange('current_odometer', parseInt(e.target.value) || undefined)}
                      min="0"
                    />
                  </div>

                  {isEditing && (
                    <div className="form-group">
                      <label>Status</label>
                      <select
                        className="form-control"
                        value={status}
                        onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                      >
                        <option value="available">Available</option>
                        <option value="in_use">In Use</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="retired">Retired</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-card mt-4">
              <div className="card-header">
                <h2 className="card-title">Maintenance & Insurance</h2>
              </div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Insurance Expiry Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={formData.insurance_expiry || ''}
                      onChange={(e) => handleChange('insurance_expiry', e.target.value || undefined)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Next Service Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={formData.next_service_date || ''}
                      onChange={(e) => handleChange('next_service_date', e.target.value || undefined)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Next Service Odometer (km)</label>
                    <input
                      type="number"
                      className="form-control"
                      value={formData.next_service_odometer || ''}
                      onChange={(e) => handleChange('next_service_odometer', parseInt(e.target.value) || undefined)}
                      min="0"
                    />
                  </div>

                  <div className="form-group">
                    <label>Assigned Department</label>
                    <select
                      className="form-control"
                      value={formData.assigned_department_id || ''}
                      onChange={(e) => handleChange('assigned_department_id', e.target.value || undefined)}
                    >
                      <option value="">-- Pool Vehicle --</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                      ))}
                    </select>
                    <small className="form-help">
                      Pool vehicles are available to all departments
                    </small>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-card mt-4">
              <div className="card-header">
                <h2 className="card-title">Additional Notes</h2>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <textarea
                    className="form-control"
                    value={formData.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value || undefined)}
                    placeholder="Any additional notes about this vehicle..."
                    rows={4}
                  />
                </div>
              </div>
            </div>

            <div className="form-actions mt-4">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => navigate('/fleet/vehicles')}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : isEditing ? 'Update Vehicle' : 'Add Vehicle'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default VehicleForm;
