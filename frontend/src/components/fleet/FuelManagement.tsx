// Fuel Management Component
// View, record, and verify fuel records

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getFuelRecords,
  createFuelRecord,
  verifyFuelRecord,
  deleteFuelRecord,
} from '../../services/fleetPhase2Service';
import { getVehicles } from '../../services/fleetService';
import { FuelRecord, CreateFuelRecordInput, FuelRecordsFilters } from '../../types/fleetPhase2';
import { FleetVehicle } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

export function FuelManagement() {
  const { profile } = useAuth();
  
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filters
  const [filterVehicle, setFilterVehicle] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  
  // Form
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [cost, setCost] = useState<string>('');
  const [station, setStation] = useState<string>('');
  const [odometer, setOdometer] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [filterVehicle, filterStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const filters: FuelRecordsFilters = {};
      if (filterVehicle) filters.vehicle_id = filterVehicle;
      if (filterStatus) filters.is_verified = filterStatus === 'verified';
      
      const [fuelData, vehiclesData] = await Promise.all([
        getFuelRecords(filters),
        getVehicles(),
      ]);
      
      setFuelRecords(fuelData);
      setVehicles(vehiclesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load fuel records');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!vehicleId || !quantity || !cost || !odometer) {
      setError('Please fill all required fields');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const input: CreateFuelRecordInput = {
        vehicle_id: vehicleId,
        fuel_type: 'petrol',
        quantity_liters: parseFloat(quantity),
        cost_amount: parseFloat(cost),
        station_name: station || undefined,
        odometer_reading: parseFloat(odometer),
        payment_method: 'company_card',
        notes: notes || undefined,
      };

      await createFuelRecord(input);
      
      setSuccess('Fuel record added successfully!');
      resetForm();
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add fuel record');
    } finally {
      setProcessing(false);
    }
  };

  const handleVerify = async (recordId: string) => {
    try {
      setProcessing(true);
      setError(null);

      await verifyFuelRecord(recordId);

      setSuccess('Fuel record verified');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to verify fuel record');
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this fuel record?')) return;

    try {
      setProcessing(true);
      await deleteFuelRecord(recordId);
      setSuccess('Fuel record deleted');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setVehicleId('');
    setQuantity('');
    setCost('');
    setStation('');
    setOdometer('');
    setNotes('');
  };

  const isFleetManager = profile?.role === 'fleet_manager' || profile?.role === 'super_admin';

  const stats = {
    total: fuelRecords.length,
    pending: fuelRecords.filter(r => !r.is_verified).length,
    totalCost: fuelRecords.reduce((sum, r) => sum + r.cost_amount, 0),
    totalLiters: fuelRecords.reduce((sum, r) => sum + r.quantity_liters, 0),
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="admin-header">
            <div>
              <h1>⛽ Fuel Management</h1>
              <p className="admin-subtitle">Track and verify fuel purchases</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Record Fuel
            </button>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {success && (
            <div className="alert alert-success mb-4">{success}</div>
          )}

          {/* Stats */}
          <div className="stats-grid mb-4">
            <div className="stat-card">
              <span className="stat-icon">📊</span>
              <div>
                <span className="stat-label">Total Records</span>
                <span className="stat-value">{stats.total}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⏳</span>
              <div>
                <span className="stat-label">Pending Verification</span>
                <span className="stat-value">{stats.pending}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">💰</span>
              <div>
                <span className="stat-label">Total Cost</span>
                <span className="stat-value">${stats.totalCost.toFixed(2)}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">⛽</span>
              <div>
                <span className="stat-label">Total Liters</span>
                <span className="stat-value">{stats.totalLiters.toFixed(1)} L</span>
              </div>
            </div>
          </div>

          {/* Form Modal */}
          {showForm && (
            <div className="modal-overlay" onClick={() => setShowForm(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Record Fuel Purchase</h2>
                  <button onClick={() => setShowForm(false)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="required">Vehicle</label>
                    <select className="form-control" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                      <option value="">Select Vehicle</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.plate_number} - {v.make} {v.model}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="required">Quantity (Liters)</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="required">Total Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={cost}
                        onChange={(e) => setCost(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="required">Odometer Reading (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Fuel Station</label>
                    <input
                      type="text"
                      className="form-control"
                      value={station}
                      onChange={(e) => setStation(e.target.value)}
                      placeholder="e.g., Shell Highway Station"
                    />
                  </div>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      className="form-control"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={processing}>
                    {processing ? 'Adding...' : 'Add Record'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="filters-bar mb-4">
            <select className="form-control" value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)}>
              <option value="">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate_number}</option>
              ))}
            </select>
            <select className="form-control" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
            </select>
          </div>

          {/* Records Table */}
          <div className="card">
            {loading ? (
              <div className="loading-spinner"></div>
            ) : fuelRecords.length === 0 ? (
              <p className="text-muted">No fuel records found</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Station</th>
                    <th>Quantity</th>
                    <th>Cost</th>
                    <th>Price/L</th>
                    <th>Odometer</th>
                    <th>Trip</th>
                    <th>Recorded By</th>
                    <th>Status</th>
                    {isFleetManager && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {fuelRecords.map((record) => (
                    <tr key={record.id}>
                      <td>{new Date(record.refuel_datetime).toLocaleDateString()}</td>
                      <td>{record.vehicle?.plate_number}</td>
                      <td>{record.station_name || 'N/A'}</td>
                      <td>{record.quantity_liters.toFixed(2)} L</td>
                      <td>${record.cost_amount.toFixed(2)}</td>
                      <td>${record.cost_per_liter?.toFixed(2)}</td>
                      <td>{record.odometer_reading} km</td>
                      <td>{record.trip?.request_number || 'N/A'}</td>
                      <td>{record.driver?.full_name || 'N/A'}</td>
                      <td>
                        <span className={`status-badge status-${record.is_verified ? 'verified' : 'pending'}`}>
                          {record.is_verified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      {isFleetManager && (
                        <td>
                          <div className="actions-cell">
                            {!record.is_verified && (
                              <>
                                <button
                                  className="btn btn-sm btn-success"
                                  onClick={() => handleVerify(record.id)}
                                  disabled={processing}
                                  title="Verify fuel record"
                                >
                                  ✓ Verify
                                </button>
                              </>
                            )}
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDelete(record.id)}
                              disabled={processing}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
