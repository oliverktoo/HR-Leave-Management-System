// Fleet Analytics & Reporting Dashboard
// Fuel efficiency, maintenance costs, and trip statistics

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getFuelEfficiencySummary,
  getMaintenanceCostSummary,
  getTripStatistics,
} from '../../services/fleetPhase2Service';
import { getVehicles } from '../../services/fleetService';
import {
  FuelEfficiencySummary,
  MaintenanceCostSummary,
  TripStatistics,
} from '../../types/fleetPhase2';
import { FleetVehicle } from '../../types/fleet';

type Tab = 'fuel' | 'maintenance' | 'trips';

export function FleetAnalytics() {
  const [activeTab, setActiveTab] = useState<Tab>('fuel');

  const [fuelData, setFuelData] = useState<FuelEfficiencySummary[]>([]);
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceCostSummary[]>([]);
  const [tripData, setTripData] = useState<TripStatistics[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);

  const [loadingFuel, setLoadingFuel] = useState(false);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tripVehicle, setTripVehicle] = useState('');
  const [tripDateFrom, setTripDateFrom] = useState('');
  const [tripDateTo, setTripDateTo] = useState('');

  useEffect(() => {
    if (vehicles.length === 0) loadVehicles();
    if (activeTab === 'fuel' && fuelData.length === 0) loadFuel();
    if (activeTab === 'maintenance' && maintenanceData.length === 0) loadMaintenance();
    if (activeTab === 'trips') loadTrips();
  }, [activeTab]);

  const loadVehicles = async () => {
    try { setVehicles(await getVehicles()); } catch {}
  };

  const loadFuel = async () => {
    try {
      setLoadingFuel(true); setError(null);
      setFuelData(await getFuelEfficiencySummary());
    } catch (err: any) {
      setError('Failed to load fuel efficiency data: ' + (err.message || err));
    } finally { setLoadingFuel(false); }
  };

  const loadMaintenance = async () => {
    try {
      setLoadingMaintenance(true); setError(null);
      setMaintenanceData(await getMaintenanceCostSummary());
    } catch (err: any) {
      setError('Failed to load maintenance data: ' + (err.message || err));
    } finally { setLoadingMaintenance(false); }
  };

  const loadTrips = async () => {
    try {
      setLoadingTrips(true); setError(null);
      const filters: { date_from?: string; date_to?: string; vehicle_id?: string } = {};
      if (tripDateFrom) filters.date_from = tripDateFrom;
      if (tripDateTo) filters.date_to = tripDateTo;
      if (tripVehicle) filters.vehicle_id = tripVehicle;
      setTripData(await getTripStatistics(filters));
    } catch (err: any) {
      setError('Failed to load trip statistics: ' + (err.message || err));
    } finally { setLoadingTrips(false); }
  };

  const fmt = (n: number, decimals = 0) =>
    isNaN(n) ? '—' : n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fmtKes = (n: number) => `KES ${fmt(n, 2)}`;

  // ── Fuel KPIs
  const totalFuelLiters = fuelData.reduce((s, r) => s + (r.total_fuel_liters || 0), 0);
  const totalFuelCost   = fuelData.reduce((s, r) => s + (r.total_fuel_cost || 0), 0);
  const effRows = fuelData.filter(r => r.fuel_efficiency_km_per_liter > 0);
  const avgEfficiency = effRows.length > 0
    ? effRows.reduce((s, r) => s + r.fuel_efficiency_km_per_liter, 0) / effRows.length : 0;

  // ── Maintenance KPIs
  const totalMaintCost  = maintenanceData.reduce((s, r) => s + (r.total_maintenance_cost || 0), 0);
  const totalCompleted  = maintenanceData.reduce((s, r) => s + (r.completed_services || 0), 0);

  // ── Trip KPIs
  const completedTrips  = tripData.filter(t => t.status === 'completed');
  const totalDistance   = completedTrips.reduce((s, t) => s + (t.actual_distance_km || 0), 0);
  const ratedTrips      = completedTrips.filter(t => t.trip_rating);
  const avgRating       = ratedTrips.length > 0
    ? ratedTrips.reduce((s, t) => s + (t.trip_rating || 0), 0) / ratedTrips.length : 0;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'badge-success', in_progress: 'badge-info', assigned: 'badge-warning',
      approved: 'badge-warning', pending: 'badge-secondary', rejected: 'badge-danger', cancelled: 'badge-danger',
    };
    return <span className={`badge ${map[status] || 'badge-secondary'}`}>{status.replace(/_/g, ' ')}</span>;
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div className="admin-container">

          {/* Page Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <h1>📈 Fleet Analytics</h1>
              <p className="page-subtitle">Fuel efficiency, maintenance costs, and trip performance</p>
            </div>
            <NotificationBell />
          </div>

          {error && (
            <div className="alert alert-error mb-4" onClick={() => setError(null)} style={{ cursor: 'pointer' }}>
              ⚠ {error} <span style={{ float: 'right', opacity: 0.6 }}>click to dismiss</span>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="tabs">
            <button className={`tab ${activeTab === 'fuel' ? 'active' : ''}`} onClick={() => setActiveTab('fuel')}>
              ⛽ Fuel Efficiency
            </button>
            <button className={`tab ${activeTab === 'maintenance' ? 'active' : ''}`} onClick={() => setActiveTab('maintenance')}>
              🔧 Maintenance Costs
            </button>
            <button className={`tab ${activeTab === 'trips' ? 'active' : ''}`} onClick={() => setActiveTab('trips')}>
              🗺️ Trip Statistics
            </button>
          </div>

          {/* ── FUEL TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'fuel' && (
            <>
              <div className="stats-grid mb-4">
                <div className="stat-card">
                  <div className="stat-value">{fuelData.length}</div>
                  <div className="stat-label">Vehicles Tracked</div>
                </div>
                <div className="stat-card stat-card-info">
                  <div className="stat-value">{fmt(totalFuelLiters, 1)} L</div>
                  <div className="stat-label">Total Fuel Used</div>
                </div>
                <div className="stat-card stat-card-warning">
                  <div className="stat-value">{fmtKes(totalFuelCost)}</div>
                  <div className="stat-label">Total Fuel Cost</div>
                </div>
                <div className="stat-card stat-card-success">
                  <div className="stat-value">{fmt(avgEfficiency, 1)} km/L</div>
                  <div className="stat-label">Fleet Avg Efficiency</div>
                </div>
              </div>

              {loadingFuel ? (
                <div className="loading-container"><div className="loading-spinner" /></div>
              ) : fuelData.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">⛽</div>
                  <h3>No fuel data yet</h3>
                  <p>Fuel records will appear here once drivers log refuels</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Refills</th>
                        <th>Fuel Used (L)</th>
                        <th>Total Cost (KES)</th>
                        <th>Avg KES/L</th>
                        <th>Distance (km)</th>
                        <th>Efficiency (km/L)</th>
                        <th>Cost/km (KES)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelData.map(row => (
                        <tr key={row.vehicle_id}>
                          <td>
                            <strong>{row.plate_number}</strong>
                            <div className="text-muted text-sm">{row.make} {row.model}</div>
                          </td>
                          <td>{row.total_refills}</td>
                          <td>{fmt(row.total_fuel_liters, 1)}</td>
                          <td>{fmt(row.total_fuel_cost, 2)}</td>
                          <td>{fmt(row.avg_cost_per_liter, 2)}</td>
                          <td>{fmt(row.total_distance_km)}</td>
                          <td>
                            <span className={
                              row.fuel_efficiency_km_per_liter > 0
                                ? row.fuel_efficiency_km_per_liter >= 12 ? 'text-success'
                                : row.fuel_efficiency_km_per_liter >= 8  ? 'text-warning'
                                : 'text-danger'
                                : 'text-muted'
                            }>
                              {row.fuel_efficiency_km_per_liter > 0 ? fmt(row.fuel_efficiency_km_per_liter, 2) : '—'}
                            </span>
                          </td>
                          <td className="text-muted">{row.cost_per_km > 0 ? fmt(row.cost_per_km, 2) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── MAINTENANCE TAB ───────────────────────────────────────────── */}
          {activeTab === 'maintenance' && (
            <>
              <div className="stats-grid mb-4">
                <div className="stat-card">
                  <div className="stat-value">{maintenanceData.length}</div>
                  <div className="stat-label">Vehicles</div>
                </div>
                <div className="stat-card stat-card-success">
                  <div className="stat-value">{totalCompleted}</div>
                  <div className="stat-label">Completed Services</div>
                </div>
                <div className="stat-card stat-card-warning">
                  <div className="stat-value">{fmtKes(totalMaintCost)}</div>
                  <div className="stat-label">Total Maintenance Cost</div>
                </div>
                <div className="stat-card stat-card-info">
                  <div className="stat-value">
                    {(() => {
                      const withCost = maintenanceData.filter(r => r.completed_services > 0);
                      return withCost.length > 0
                        ? fmtKes(totalMaintCost / withCost.length)
                        : '—';
                    })()}
                  </div>
                  <div className="stat-label">Avg Cost per Vehicle</div>
                </div>
              </div>

              {loadingMaintenance ? (
                <div className="loading-container"><div className="loading-spinner" /></div>
              ) : maintenanceData.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🔧</div>
                  <h3>No maintenance data yet</h3>
                  <p>Maintenance records will appear here once added</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Vehicle</th>
                        <th>Records</th>
                        <th>Completed</th>
                        <th>Labor (KES)</th>
                        <th>Parts (KES)</th>
                        <th>Total Cost (KES)</th>
                        <th>Avg/Service</th>
                        <th>Last Service</th>
                        <th>Next Due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenanceData.map(row => {
                        const nextDue = row.next_service_due ? new Date(row.next_service_due) : null;
                        const daysUntil = nextDue
                          ? Math.ceil((nextDue.getTime() - Date.now()) / 86400000) : null;
                        return (
                          <tr key={row.vehicle_id}>
                            <td>
                              <strong>{row.plate_number}</strong>
                              <div className="text-muted text-sm">{row.make} {row.model}</div>
                            </td>
                            <td>{row.total_maintenance_records}</td>
                            <td>{row.completed_services}</td>
                            <td>{fmt(row.total_labor_cost, 2)}</td>
                            <td>{fmt(row.total_parts_cost, 2)}</td>
                            <td><strong>{fmt(row.total_maintenance_cost, 2)}</strong></td>
                            <td className="text-muted">
                              {row.avg_maintenance_cost > 0 ? fmt(row.avg_maintenance_cost, 2) : '—'}
                            </td>
                            <td className="text-muted">
                              {row.last_service_date ? new Date(row.last_service_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </td>
                            <td>
                              {nextDue ? (
                                <span className={
                                  daysUntil !== null && daysUntil <= 7  ? 'text-danger' :
                                  daysUntil !== null && daysUntil <= 30 ? 'text-warning' : ''
                                }>
                                  {nextDue.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                                  {daysUntil !== null && daysUntil <= 30 && (
                                    <div className="text-sm text-muted">({daysUntil}d)</div>
                                  )}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── TRIPS TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'trips' && (
            <>
              {/* Filters */}
              <div className="filters-row">
                <select value={tripVehicle} onChange={e => setTripVehicle(e.target.value)} className="filter-select">
                  <option value="">All Vehicles</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>
                  ))}
                </select>
                <input
                  type="date" value={tripDateFrom} onChange={e => setTripDateFrom(e.target.value)}
                  className="filter-select" title="From date"
                />
                <input
                  type="date" value={tripDateTo} onChange={e => setTripDateTo(e.target.value)}
                  className="filter-select" title="To date"
                />
                <button className="btn btn-primary" onClick={loadTrips}>Apply</button>
                <button className="btn btn-secondary" onClick={() => {
                  setTripVehicle(''); setTripDateFrom(''); setTripDateTo('');
                  setTimeout(loadTrips, 0);
                }}>Clear</button>
              </div>

              {/* Trip KPIs */}
              <div className="stats-grid mb-4">
                <div className="stat-card">
                  <div className="stat-value">{tripData.length}</div>
                  <div className="stat-label">Total Trips</div>
                </div>
                <div className="stat-card stat-card-success">
                  <div className="stat-value">{completedTrips.length}</div>
                  <div className="stat-label">Completed</div>
                </div>
                <div className="stat-card stat-card-info">
                  <div className="stat-value">{fmt(totalDistance)} km</div>
                  <div className="stat-label">Distance Covered</div>
                </div>
                <div className="stat-card stat-card-warning">
                  <div className="stat-value">{avgRating > 0 ? `${fmt(avgRating, 1)} ★` : '—'}</div>
                  <div className="stat-label">Avg Trip Rating</div>
                </div>
              </div>

              {loadingTrips ? (
                <div className="loading-container"><div className="loading-spinner" /></div>
              ) : tripData.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🗺️</div>
                  <h3>No trips found</h3>
                  <p>Adjust filters or complete some trips to see statistics</p>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Request #</th>
                        <th>Vehicle</th>
                        <th>Status</th>
                        <th>Planned Start</th>
                        <th>Actual Start</th>
                        <th>Distance (km)</th>
                        <th>Duration (hrs)</th>
                        <th>Expenses (KES)</th>
                        <th>Logs</th>
                        <th>Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tripData.map(row => (
                        <tr key={row.trip_id}>
                          <td><strong style={{ color: '#2563eb' }}>{row.request_number}</strong></td>
                          <td>
                            <strong>{row.plate_number}</strong>
                            <div className="text-muted text-sm">
                              {row.vehicle_name !== row.plate_number ? row.vehicle_name : ''}
                            </div>
                          </td>
                          <td>{statusBadge(row.status)}</td>
                          <td className="text-sm">{new Date(row.planned_start).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="text-sm text-muted">
                            {row.actual_start_datetime
                              ? new Date(row.actual_start_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td>
                            {row.actual_distance_km != null ? fmt(row.actual_distance_km, 1)
                              : row.distance_by_odometer != null ? fmt(row.distance_by_odometer, 1)
                              : '—'}
                          </td>
                          <td className="text-muted">
                            {row.actual_duration_hours != null ? fmt(row.actual_duration_hours, 1) : '—'}
                          </td>
                          <td className="text-muted">
                            {row.total_expenses != null && row.total_expenses > 0
                              ? fmt(row.total_expenses, 2) : '—'}
                          </td>
                          <td>{row.log_entries_count}</td>
                          <td>{row.trip_rating ? `${row.trip_rating} ★` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

        </div>{/* admin-container */}
      </div>
    </div>
  );
}
