// Trip Details with Fuel, Expense, and Logs Management
// Comprehensive view for managing trip-related activities

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getTripRequestById } from '../../services/fleetService';
import {
  getTripLogs,
  createTripLog,
  getFuelRecords,
  createFuelRecord,
  getTripExpenses,
  createTripExpense,
} from '../../services/fleetPhase2Service';
import { TripRequest } from '../../types/fleet';
import {
  TripLog,
  CreateTripLogInput,
  FuelRecord,
  CreateFuelRecordInput,
  TripExpense,
  CreateTripExpenseInput,
} from '../../types/fleetPhase2';
import { useAuth } from '../../hooks/useAuth';

type TabType = 'overview' | 'logs' | 'fuel' | 'expenses';

export function TripDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();

  const [trip, setTrip] = useState<TripRequest | null>(null);
  const [logs, setLogs] = useState<TripLog[]>([]);
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Log form
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState<'waypoint' | 'break' | 'incident' | 'delay' | 'note'>('waypoint');
  const [logDescription, setLogDescription] = useState('');
  const [logLocation, setLogLocation] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logOdometer, setLogOdometer] = useState('');

  // Fuel form
  const [showFuelForm, setShowFuelForm] = useState(false);
  const [fuelQuantity, setFuelQuantity] = useState('');
  const [fuelCost, setFuelCost] = useState('');
  const [fuelStation, setFuelStation] = useState('');
  const [fuelOdometer, setFuelOdometer] = useState('');
  const [fuelNotes, setFuelNotes] = useState('');

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseType, setExpenseType] = useState<'fuel' | 'toll' | 'parking' | 'meals' | 'accommodation' | 'repairs' | 'other'>('fuel');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseVendor, setExpenseVendor] = useState('');

  useEffect(() => {
    if (id) {
      loadTripData(id);
    }
  }, [id]);

  const loadTripData = async (tripId: string) => {
    try {
      setLoading(true);
      const [tripData, logsData, fuelData, expensesData] = await Promise.all([
        getTripRequestById(tripId),
        getTripLogs(tripId),
        getFuelRecords({ trip_id: tripId }),
        getTripExpenses({ trip_id: tripId }),
      ]);

      setTrip(tripData);
      setLogs(logsData);
      setFuelRecords(fuelData);
      setExpenses(expensesData);
    } catch (err) {
      console.error('Error loading trip data:', err);
      setError('Failed to load trip data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLog = async () => {
    if (!trip || !logDescription) {
      setError('Please fill required fields');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const input: CreateTripLogInput = {
        trip_request_id: trip.id,
        log_type: logType,
        description: logDescription,
        location: logLocation || undefined,
        duration_minutes: logDuration ? parseInt(logDuration) : undefined,
        odometer_reading: logOdometer ? parseFloat(logOdometer) : undefined,
      };

      await createTripLog(input);
      
      setSuccess('Log added successfully!');
      resetLogForm();
      await loadTripData(trip.id);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add log');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddFuel = async () => {
    if (!trip || !fuelQuantity || !fuelCost || !fuelOdometer) {
      setError('Please fill all required fields');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const input: CreateFuelRecordInput = {
        vehicle_id: trip.assigned_vehicle_id!,
        trip_request_id: trip.id,
        fuel_type: 'petrol',
        quantity_liters: parseFloat(fuelQuantity),
        cost_amount: parseFloat(fuelCost),
        station_name: fuelStation || undefined,
        odometer_reading: parseFloat(fuelOdometer),
        payment_method: 'company_card',
        notes: fuelNotes || undefined,
      };

      await createFuelRecord(input);
      
      setSuccess('Fuel record added successfully!');
      resetFuelForm();
      await loadTripData(trip.id);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add fuel record');
    } finally {
      setProcessing(false);
    }
  };

  const handleAddExpense = async () => {
    if (!trip || !expenseAmount || !expenseDescription) {
      setError('Please fill all required fields');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const input: CreateTripExpenseInput = {
        trip_request_id: trip.id,
        vehicle_id: trip.assigned_vehicle_id!,
        expense_type: expenseType,
        expense_date: new Date().toISOString().split('T')[0],
        amount: parseFloat(expenseAmount),
        description: expenseDescription,
        location: expenseVendor || undefined,
      };

      await createTripExpense(input);
      
      setSuccess('Expense added successfully!');
      resetExpenseForm();
      await loadTripData(trip.id);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add expense');
    } finally {
      setProcessing(false);
    }
  };

  const resetLogForm = () => {
    setShowLogForm(false);
    setLogType('waypoint');
    setLogDescription('');
    setLogLocation('');
    setLogDuration('');
    setLogOdometer('');
  };

  const resetFuelForm = () => {
    setShowFuelForm(false);
    setFuelQuantity('');
    setFuelCost('');
    setFuelStation('');
    setFuelOdometer('');
    setFuelNotes('');
  };

  const resetExpenseForm = () => {
    setShowExpenseForm(false);
    setExpenseType('fuel');
    setExpenseAmount('');
    setExpenseDescription('');
    setExpenseVendor('');
  };

  if (loading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading trip details...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="error-container">
            <h2>Trip Not Found</h2>
            <button onClick={() => navigate('/fleet/my-trips')}>← Back</button>
          </div>
        </main>
      </div>
    );
  }

  const canManage = trip.assigned_driver_id === profile?.id ||
    profile?.role === 'fleet_manager' ||
    profile?.role === 'super_admin';

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="admin-header">
            <div className="header-left">
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>
                ← Back
              </button>
              <div>
                <h1>🚗 {trip.request_number}</h1>
                <p className="admin-subtitle">
                  {trip.destination} • <span className={`status-badge status-${trip.status}`}>{trip.status}</span>
                </p>
              </div>
            </div>
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

          {/* Tabs */}
          <div className="tabs mb-4">
            <button
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            <button
              className={`tab ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              📋 Logs ({logs.length})
            </button>
            <button
              className={`tab ${activeTab === 'fuel' ? 'active' : ''}`}
              onClick={() => setActiveTab('fuel')}
            >
              ⛽ Fuel ({fuelRecords.length})
            </button>
            <button
              className={`tab ${activeTab === 'expenses' ? 'active' : ''}`}
              onClick={() => setActiveTab('expenses')}
            >
              💰 Expenses ({expenses.length})
            </button>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="card">
              <div className="detail-grid">
                <div className="detail-item">
                  <strong>Status:</strong>
                  <span className={`status-badge status-${trip.status}`}>{trip.status}</span>
                </div>
                <div className="detail-item">
                  <strong>Vehicle:</strong>
                  <span>
                    {trip.assigned_vehicle?.plate_number} - {trip.assigned_vehicle?.make} {trip.assigned_vehicle?.model}
                  </span>
                </div>
                <div className="detail-item">
                  <strong>Driver:</strong>
                  <span>{trip.assigned_driver?.email || 'Not assigned'}</span>
                </div>
                <div className="detail-item">
                  <strong>Departure:</strong>
                  <span>{new Date(trip.start_datetime).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <strong>Return:</strong>
                  <span>{new Date(trip.end_datetime).toLocaleString()}</span>
                </div>
                <div className="detail-item">
                  <strong>Passengers:</strong>
                  <span>{trip.passenger_count}</span>
                </div>
                {trip.actual_distance_km && (
                  <div className="detail-item">
                    <strong>Distance:</strong>
                    <span>{trip.actual_distance_km.toFixed(1)} km</span>
                  </div>
                )}
                {trip.trip_rating && (
                  <div className="detail-item">
                    <strong>Rating:</strong>
                    <span>⭐ {trip.trip_rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
              {trip.purpose && (
                <div className="mt-3">
                  <strong>Purpose:</strong>
                  <p>{trip.purpose}</p>
                </div>
              )}
            </div>
          )}

          {/* Logs Tab */}
          {activeTab === 'logs' && (
            <div>
              {canManage && trip.status === 'in_progress' && (
                <div className="mb-4">
                  {!showLogForm ? (
                    <button className="btn btn-primary" onClick={() => setShowLogForm(true)}>
                      + Add Log Entry
                    </button>
                  ) : (
                    <div className="card">
                      <h3>Add Log Entry</h3>
                      <div className="form-group">
                       <label className="required">Type</label>
                        <select className="form-control" value={logType} onChange={(e) => setLogType(e.target.value as any)}>
                          <option value="waypoint">Waypoint</option>
                          <option value="break">Break</option>
                          <option value="incident">Incident</option>
                          <option value="delay">Delay</option>
                          <option value="note">Note</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="required">Description</label>
                        <textarea
                          className="form-control"
                          value={logDescription}
                          onChange={(e) => setLogDescription(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <div className="form-group">
                        <label>Location</label>
                        <input
                          type="text"
                          className="form-control"
                          value={logLocation}
                          onChange={(e) => setLogLocation(e.target.value)}
                          placeholder="e.g., Rest Area KM 45"
                        />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Duration (minutes)</label>
                          <input
                            type="number"
                            className="form-control"
                            value={logDuration}
                            onChange={(e) => setLogDuration(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Odometer (km)</label>
                          <input
                            type="number"
                            step="0.1"
                            className="form-control"
                            value={logOdometer}
                            onChange={(e) => setLogOdometer(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-actions">
                        <button className="btn btn-secondary" onClick={resetLogForm}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAddLog} disabled={processing}>
                          {processing ? 'Adding...' : 'Add Log'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                {logs.length === 0 ? (
                  <p className="text-muted">No log entries yet</p>
                ) : (
                  <div className="trip-logs-timeline">
                    {logs.map((log) => (
                      <div key={log.id} className="log-entry">
                        <div className="log-icon">{getLogIcon(log.log_type)}</div>
                        <div className="log-content">
                          <div className="log-header">
                            <span className="log-type">{log.log_type}</span>
                            <span className="log-time">{new Date(log.log_datetime).toLocaleString()}</span>
                          </div>
                          <p>{log.description}</p>
                          <div className="log-meta">
                            {log.location && <span>📍 {log.location}</span>}
                            {log.odometer_reading && <span>📊 {log.odometer_reading} km</span>}
                            {log.duration_minutes && <span>⏱️ {log.duration_minutes} min</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fuel Tab */}
          {activeTab === 'fuel' && (
            <div>
              {canManage && trip.status === 'in_progress' && (
                <div className="mb-4">
                  {!showFuelForm ? (
                    <button className="btn btn-primary" onClick={() => setShowFuelForm(true)}>
                      + Record Fuel
                    </button>
                  ) : (
                    <div className="card">
                      <h3>Record Fuel Purchase</h3>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="required">Quantity (L)</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-control"
                            value={fuelQuantity}
                            onChange={(e) => setFuelQuantity(e.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="required">Total Cost</label>
                          <input
                            type="number"
                            step="0.01"
                            className="form-control"
                            value={fuelCost}
                            onChange={(e) => setFuelCost(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="required">Current Odometer (km)</label>
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          value={fuelOdometer}
                          onChange={(e) => setFuelOdometer(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>Fuel Station</label>
                        <input
                          type="text"
                          className="form-control"
                          value={fuelStation}
                          onChange={(e) => setFuelStation(e.target.value)}
                          placeholder="e.g., Shell Station - Highway"
                        />
                      </div>
                      <div className="form-group">
                        <label>Notes</label>
                        <textarea
                          className="form-control"
                          value={fuelNotes}
                          onChange={(e) => setFuelNotes(e.target.value)}
                          rows={2}
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn btn-secondary" onClick={resetFuelForm}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAddFuel} disabled={processing}>
                          {processing ? 'Adding...' : 'Record Fuel'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                {fuelRecords.length === 0 ? (
                  <p className="text-muted">No fuel records yet</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Station</th>
                        <th>Quantity</th>
                        <th>Cost</th>
                        <th>Price/L</th>
                        <th>Odometer</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelRecords.map((fuel) => (
                        <tr key={fuel.id}>
                          <td>{new Date(fuel.refuel_datetime).toLocaleString()}</td>
                          <td>{fuel.station_name || 'N/A'}</td>
                          <td>{fuel.quantity_liters.toFixed(2)} L</td>
                          <td>${fuel.cost_amount.toFixed(2)}</td>
                          <td>${fuel.cost_per_liter?.toFixed(2)}</td>
                          <td>{fuel.odometer_reading} km</td>
                          <td>
                            <span className={`status-badge status-${fuel.is_verified ? 'verified' : 'pending'}`}>
                              {fuel.is_verified ? 'Verified' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Expenses Tab */}
          {activeTab === 'expenses' && (
            <div>
              {canManage && trip.status === 'in_progress' && (
                <div className="mb-4">
                  {!showExpenseForm ? (
                    <button className="btn btn-primary" onClick={() => setShowExpenseForm(true)}>
                      + Add Expense
                    </button>
                  ) : (
                    <div className="card">
                      <h3>Add Trip Expense</h3>
                      <div className="form-group">
                        <label className="required">Type</label>
                        <select className="form-control" value={expenseType} onChange={(e) => setExpenseType(e.target.value as any)}>
                          <option value="fuel">Fuel</option>
                          <option value="toll">Toll</option>
                          <option value="parking">Parking</option>
                        <option value="meals">Meals</option>
                        <option value="accommodation">Accommodation</option>
                        <option value="repairs">Repairs</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="required">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-control"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="required">Description</label>
                        <input
                          type="text"
                          className="form-control"
                          value={expenseDescription}
                          onChange={(e) => setExpenseDescription(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                      <label>Location/Vendor</label>
                      <input
                        type="text"
                        className="form-control"
                        value={expenseVendor}
                        onChange={(e) => setExpenseVendor(e.target.value)}
                        placeholder="e.g., Shell Station, ABC Hotel"
                        />
                      </div>
                      <div className="form-actions">
                        <button className="btn btn-secondary" onClick={resetExpenseForm}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleAddExpense} disabled={processing}>
                          {processing ? 'Adding...' : 'Add Expense'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                {expenses.length === 0 ? (
                  <p className="text-muted">No expenses yet</p>
                ) : (
                  <>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Description</th>
                          <th>Location</th>
                          <th>Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td>{new Date(expense.expense_date).toLocaleDateString()}</td>
                            <td>{expense.expense_type}</td>
                            <td>{expense.description}</td>
                            <td>{expense.location || 'N/A'}</td>
                            <td>${expense.amount.toFixed(2)}</td>
                            <td>
                              <span className={`status-badge status-${expense.is_approved ? 'approved' : 'pending'}`}>
                                {expense.is_approved ? 'Approved' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="expense-total mt-3">
                      <strong>Total: ${expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}</strong>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function getLogIcon(logType: string): string {
  switch (logType) {
    case 'started': return '🚀';
    case 'waypoint': return '📍';
    case 'break': return '☕';
    case 'refuel': return '⛽';
    case 'incident': return '⚠️';
    case 'delay': return '⏰';
    case 'completed': return '🏁';
    case 'cancelled': return '🚫';
    case 'note': return '📝';
    default: return '📋';
  }
}
