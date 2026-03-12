// Maintenance Management Component
// Schedule, track, and manage vehicle maintenance

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getMaintenanceRecords,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  getUpcomingMaintenance,
  deleteMaintenanceRecord,
} from '../../services/fleetPhase2Service';
import { getVehicles } from '../../services/fleetService';
import { MaintenanceRecord, CreateMaintenanceInput, MaintenanceFilters } from '../../types/fleetPhase2';
import { FleetVehicle } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

export function MaintenanceManagement() {
  
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [upcoming, setUpcoming] = useState<MaintenanceRecord[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Filters
  const [filterVehicle, setFilterVehicle] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  
  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string>('');
  const [maintenanceType, setMaintenanceType] = useState<'service' | 'repair' | 'inspection' | 'tire_change' | 'other'>('service');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [laborCost, setLaborCost] = useState<string>('');
  const [partsCost, setPartsCost] = useState<string>('');
  const [serviceProvider, setServiceProvider] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    loadData();
  }, [filterVehicle, filterStatus, filterType]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const filters: MaintenanceFilters = {};
      if (filterVehicle) filters.vehicle_id = filterVehicle;
      if (filterStatus) filters.status = filterStatus as any;
      if (filterType) filters.maintenance_type = filterType as any;
      
      const [recordsData, upcomingData, vehiclesData] = await Promise.all([
        getMaintenanceRecords(filters),
        getUpcomingMaintenance(),
        getVehicles(),
      ]);
      
      setRecords(recordsData);
      setUpcoming(upcomingData);
      setVehicles(vehiclesData);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load maintenance records');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!vehicleId || !maintenanceType || !description || !scheduledDate) {
      setError('Please fill all required fields');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      if (editingId) {
        await updateMaintenanceRecord({
          id: editingId,
          maintenance_type: maintenanceType,
          description,
          priority,
          scheduled_date: scheduledDate,
          labor_cost: laborCost ? parseFloat(laborCost) : undefined,
          parts_cost: partsCost ? parseFloat(partsCost) : undefined,
          service_provider: serviceProvider || undefined,
          notes: notes || undefined,
        });
        setSuccess('Maintenance updated successfully!');
      } else {
        const input: CreateMaintenanceInput = {
          vehicle_id: vehicleId,
          maintenance_type: maintenanceType,
          description,
          priority,
          scheduled_date: scheduledDate,
          notes: notes || undefined,
        };
        await createMaintenanceRecord(input);
        setSuccess('Maintenance scheduled successfully!');
      }
      
      resetForm();
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save maintenance record');
    } finally {
      setProcessing(false);
    }
  };

  const handleComplete = async (recordId: string) => {
    try {
      setProcessing(true);
      await updateMaintenanceRecord({
        id: recordId,
        status: 'completed',
        completed_date: new Date().toISOString().split('T')[0],
      });
      setSuccess('Maintenance marked as completed');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to complete maintenance');
    } finally {
      setProcessing(false);
    }
  };

  const handleEdit = (record: MaintenanceRecord) => {
    setEditingId(record.id);
    setVehicleId(record.vehicle_id);
    setMaintenanceType(record.maintenance_type as any);
    setDescription(record.description);
    setPriority(record.priority as any);
    setScheduledDate(record.scheduled_date || '');
    setLaborCost(record.labor_cost?.toString() || '');
    setPartsCost(record.parts_cost?.toString() || '');
    setServiceProvider(record.service_provider || '');
    setNotes(record.notes || '');
    setShowForm(true);
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this maintenance record?')) return;

    try {
      setProcessing(true);
      await deleteMaintenanceRecord(recordId);
      setSuccess('Maintenance record deleted');
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
    setEditingId(null);
    setVehicleId('');
    setMaintenanceType('service');
    setDescription('');
    setPriority('normal');
    setScheduledDate('');
    setLaborCost('');
    setPartsCost('');
    setServiceProvider('');
    setNotes('');
  };

  const stats = {
    total: records.length,
    pending: records.filter(r => r.status === 'scheduled').length,
    inProgress: records.filter(r => r.status === 'in_progress').length,
    totalCost: records.reduce((sum, r) => sum + (r.total_cost || 0), 0),
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="admin-header">
            <div>
              <h1>🔧 Maintenance Management</h1>
              <p className="admin-subtitle">Schedule and track vehicle maintenance</p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Schedule Maintenance
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
                <span className="stat-label">Scheduled</span>
                <span className="stat-value">{stats.pending}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">🔄</span>
              <div>
                <span className="stat-label">In Progress</span>
                <span className="stat-value">{stats.inProgress}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon">💰</span>
              <div>
                <span className="stat-label">Total Cost</span>
                <span className="stat-value">${stats.totalCost.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Upcoming Maintenance Alert */}
          {upcoming.length > 0 && (
            <div className="alert alert-warning mb-4">
              <strong>⚠️ {upcoming.length} vehicle(s) due for maintenance within 30 days</strong>
              <ul className="mt-2">
                {upcoming.slice(0, 3).map(m => (
                  <li key={m.id}>
                    {m.vehicle?.plate_number}: {m.description} (Due: {m.scheduled_date ? new Date(m.scheduled_date).toLocaleDateString() : 'TBD'})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Form Modal */}
          {showForm && (
            <div className="modal-overlay" onClick={() => setShowForm(false)}>
              <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>{editingId ? 'Edit Maintenance' : 'Schedule Maintenance'}</h2>
                  <button onClick={resetForm}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="required">Vehicle</label>
                    <select
                      className="form-control"
                      value={vehicleId}
                      onChange={(e) => setVehicleId(e.target.value)}
                      disabled={!!editingId}
                    >
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
                      <label className="required">Type</label>
                      <select className="form-control" value={maintenanceType} onChange={(e) => setMaintenanceType(e.target.value as any)}>
                        <option value="service">Routine Service</option>
                        <option value="repair">Repair</option>
                        <option value="inspection">Inspection</option>
                        <option value="tire_change">Tire Change</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="required">Priority</label>
                      <select className="form-control" value={priority} onChange={(e) => setPriority(e.target.value as any)}>
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="required">Description</label>
                    <textarea
                      className="form-control"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="form-group">
                    <label className="required">Scheduled Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Labor Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={laborCost}
                        onChange={(e) => setLaborCost(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Parts Cost</label>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={partsCost}
                        onChange={(e) => setPartsCost(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Service Provider</label>
                    <input
                      type="text"
                      className="form-control"
                      value={serviceProvider}
                      onChange={(e) => setServiceProvider(e.target.value)}
                      placeholder="e.g., ABC Auto Service"
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
                    {processing ? 'Saving...' : editingId ? 'Update' : 'Schedule'}
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
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select className="form-control" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All Types</option>
              <option value="service">Routine Service</option>
              <option value="repair">Repair</option>
              <option value="inspection">Inspection</option>
              <option value="tire_change">Tire Change</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Records Table */}
          <div className="card">
            {loading ? (
              <div className="loading-spinner"></div>
            ) : records.length === 0 ? (
              <p className="text-muted">No maintenance records found</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Priority</th>
                    <th>Scheduled</th>
                    <th>Completed</th>
                    <th>Cost</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{record.vehicle?.plate_number}</td>
                      <td>{record.maintenance_type}</td>
                      <td>{record.description}</td>
                      <td>
                        <span className={`badge priority-${record.priority}`}>
                          {record.priority}
                        </span>
                      </td>
                      <td>{record.scheduled_date ? new Date(record.scheduled_date).toLocaleDateString() : 'TBD'}</td>
                      <td>{record.completed_date ? new Date(record.completed_date).toLocaleDateString() : '-'}</td>
                      <td>${record.total_cost?.toFixed(2) || '0.00'}</td>
                      <td>{record.service_provider || 'N/A'}</td>
                      <td>
                        <span className={`status-badge status-${record.status}`}>
                          {record.status}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          {record.status === 'scheduled' && (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleComplete(record.id)}
                              disabled={processing}
                            >
                              ✓ Done
                            </button>
                          )}
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleEdit(record)}
                            disabled={processing}
                          >
                            ✏️
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(record.id)}
                            disabled={processing}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
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
