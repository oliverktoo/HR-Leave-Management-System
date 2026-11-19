// Fleet Phase 4: Fleet Reports Component
// Trip history, fuel costs, maintenance costs, compliance summary

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getTripHistoryReport,
  getFuelCostReport,
  getMaintenanceCostReport,
  exportToCSV,
  exportToPDF,
} from '../../services/fleetReportService';
import { getComplianceSummary, getComplianceAlerts } from '../../services/complianceService';
import { getVehicles } from '../../services/fleetService';
import {
  TripHistoryRow,
  FuelCostRow,
  MaintenanceCostRow,
  ReportFilters,
} from '../../types/fleetPhase4';
import { ComplianceSummary, ComplianceAlert } from '../../types/fleetPhase3';
import { FleetVehicle } from '../../types/fleet';

type ReportTab = 'trips' | 'fuel' | 'maintenance' | 'compliance';

const fmtKES = (v: number | null | undefined) =>
  v == null ? '—' : `KES ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtNum = (v: number | null | undefined, dp = 1) =>
  v == null ? '—' : Number(v).toFixed(dp);
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export function FleetReports() {
  const [activeTab, setActiveTab] = useState<ReportTab>('trips');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);

  // Data state
  const [tripRows, setTripRows] = useState<TripHistoryRow[]>([]);
  const [fuelRows, setFuelRows] = useState<FuelCostRow[]>([]);
  const [maintRows, setMaintRows] = useState<MaintenanceCostRow[]>([]);
  const [compSummary, setCompSummary] = useState<ComplianceSummary | null>(null);
  const [compAlerts, setCompAlerts] = useState<ComplianceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load vehicles for filter dropdowns
  useEffect(() => {
    getVehicles().then(setVehicles).catch(console.error);
  }, []);

  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'trips') {
        setTripRows(await getTripHistoryReport(filters));
      } else if (activeTab === 'fuel') {
        setFuelRows(await getFuelCostReport(filters));
      } else if (activeTab === 'maintenance') {
        setMaintRows(await getMaintenanceCostReport(filters));
      } else if (activeTab === 'compliance') {
        const [summary, alerts] = await Promise.all([
          getComplianceSummary(),
          getComplianceAlerts({ status: 'active' }),
        ]);
        setCompSummary(summary);
        setCompAlerts(alerts);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, filters]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // ── Export handlers ──────────────────────────────────────────────────────

  const handleExportCSV = () => {
    if (activeTab === 'trips') {
      exportToCSV(
        ['Request#', 'Requester', 'Department', 'Driver', 'Vehicle', 'Destination', 'Start', 'Distance(km)', 'Duration(h)', 'Expenses(KES)', 'Rating', 'Status'],
        tripRows.map(r => [r.request_number, r.requester_name, r.department_name, r.driver_name, r.vehicle_plate, r.destination, fmtDate(r.planned_start), r.distance_km ?? '', r.duration_hours ?? '', r.total_expenses ?? '', r.trip_rating ?? '', r.status]),
        `trip-history-${new Date().toISOString().split('T')[0]}.csv`
      );
    } else if (activeTab === 'fuel') {
      exportToCSV(
        ['Vehicle', 'Plate', 'Refills', 'Liters', 'Total Cost(KES)', 'Avg/L', 'Distance(km)', 'Efficiency(km/L)', 'Cost/km'],
        fuelRows.map(r => [r.vehicle_name, r.plate_number, r.total_refills, r.total_liters, r.total_cost, r.avg_cost_per_liter, r.total_distance_km, r.efficiency_km_l, r.cost_per_km]),
        `fuel-costs-${new Date().toISOString().split('T')[0]}.csv`
      );
    } else if (activeTab === 'maintenance') {
      exportToCSV(
        ['Vehicle', 'Plate', 'Total Records', 'Completed', 'Labor(KES)', 'Parts(KES)', 'Total(KES)', 'Avg/Service', 'Last Service', 'Next Due'],
        maintRows.map(r => [r.make + ' ' + r.model, r.plate_number, r.total_records, r.completed_services, r.total_labor_cost, r.total_parts_cost, r.total_cost, r.avg_cost_per_service, r.last_service_date ?? '', r.next_service_due ?? '']),
        `maintenance-costs-${new Date().toISOString().split('T')[0]}.csv`
      );
    }
  };

  const handleExportPDF = () => {
    if (activeTab === 'trips') {
      exportToPDF('Trip History Report',
        ['Request#', 'Requester', 'Driver', 'Vehicle', 'Destination', 'Start', 'Dist.km', 'Dur.h', 'Expenses', 'Status'],
        tripRows.map(r => [r.request_number, r.requester_name, r.driver_name, r.vehicle_plate, r.destination, fmtDate(r.planned_start), r.distance_km ?? '', r.duration_hours ?? '', r.total_expenses ?? '', r.status]),
        `trip-history-${new Date().toISOString().split('T')[0]}.pdf`
      );
    } else if (activeTab === 'fuel') {
      exportToPDF('Fuel Cost Report',
        ['Vehicle', 'Plate', 'Refills', 'Liters', 'Cost(KES)', 'Eff.km/L', 'Cost/km'],
        fuelRows.map(r => [r.vehicle_name, r.plate_number, r.total_refills, r.total_liters, r.total_cost, r.efficiency_km_l, r.cost_per_km]),
        `fuel-costs-${new Date().toISOString().split('T')[0]}.pdf`
      );
    } else if (activeTab === 'maintenance') {
      exportToPDF('Maintenance Cost Report',
        ['Vehicle', 'Plate', 'Completed', 'Total(KES)', 'Avg/Service', 'Last Service'],
        maintRows.map(r => [r.make + ' ' + r.model, r.plate_number, r.completed_services, r.total_cost, r.avg_cost_per_service, r.last_service_date ?? '']),
        `maintenance-costs-${new Date().toISOString().split('T')[0]}.pdf`
      );
    }
  };

  const tabs: { id: ReportTab; label: string; icon: string }[] = [
    { id: 'trips', label: 'Trip History', icon: '🚗' },
    { id: 'fuel', label: 'Fuel Costs', icon: '⛽' },
    { id: 'maintenance', label: 'Maintenance', icon: '🔧' },
    { id: 'compliance', label: 'Compliance', icon: '🛡️' },
  ];

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          <header className="admin-header">
            <div>
              <h1>📋 Fleet Reports</h1>
              <p className="admin-subtitle">Generate and export fleet management reports</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <NotificationBell />
              {activeTab !== 'compliance' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline" onClick={handleExportCSV}>⬇ CSV</button>
                  <button className="btn btn-outline" onClick={handleExportPDF}>⬇ PDF</button>
                  <button className="btn btn-outline" onClick={() => window.print()}>🖨 Print</button>
                </div>
              )}
            </div>
          </header>

          {/* Tab bar */}
          <div className="card mb-4">
            <div className="card-body" style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setFilters({}); }}
                    className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'} btn-sm`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filters */}
          {activeTab !== 'compliance' && (
            <div className="card mb-4">
              <div className="card-body">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {(activeTab === 'trips' || activeTab === 'fuel') && (
                    <>
                      <div className="form-group" style={{ minWidth: 140 }}>
                        <label className="form-label">Date From</label>
                        <input type="date" className="form-input" value={filters.date_from || ''} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value || undefined }))} />
                      </div>
                      <div className="form-group" style={{ minWidth: 140 }}>
                        <label className="form-label">Date To</label>
                        <input type="date" className="form-input" value={filters.date_to || ''} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value || undefined }))} />
                      </div>
                    </>
                  )}
                  <div className="form-group" style={{ minWidth: 180 }}>
                    <label className="form-label">Vehicle</label>
                    <select className="form-select" value={filters.vehicle_id || ''} onChange={e => setFilters(f => ({ ...f, vehicle_id: e.target.value || undefined }))}>
                      <option value="">All vehicles</option>
                      {vehicles.map(v => (
                        <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={loadReport} style={{ marginBottom: 1 }}>
                    {isLoading ? 'Loading...' : 'Run Report'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => setFilters({})} style={{ marginBottom: 1 }}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {isLoading ? (
            <div className="text-center py-8 text-muted">Loading report...</div>
          ) : (
            <>
              {/* Trip History */}
              {activeTab === 'trips' && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Trip History ({tripRows.length} trips)</h3>
                  </div>
                  <div className="card-body">
                    {tripRows.length === 0 ? (
                      <p className="text-muted text-center py-4">No trips found for the selected filters.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Request#</th>
                              <th>Requester</th>
                              <th>Driver</th>
                              <th>Vehicle</th>
                              <th>Destination</th>
                              <th>Start</th>
                              <th>Dist.</th>
                              <th>Dur.</th>
                              <th>Expenses</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tripRows.map(row => (
                              <tr key={row.trip_id}>
                                <td><code>{row.request_number}</code></td>
                                <td>{row.requester_name}</td>
                                <td>{row.driver_name || '—'}</td>
                                <td>{row.vehicle_plate || '—'}</td>
                                <td>{row.destination}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(row.planned_start)}</td>
                                <td>{row.distance_km != null ? `${fmtNum(row.distance_km)} km` : '—'}</td>
                                <td>{row.duration_hours != null ? `${fmtNum(row.duration_hours)}h` : '—'}</td>
                                <td>{row.total_expenses ? fmtKES(row.total_expenses) : '—'}</td>
                                <td><span className={`status-badge status-${row.status}`}>{row.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fuel Costs */}
              {activeTab === 'fuel' && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Fuel Cost Report</h3>
                  </div>
                  <div className="card-body">
                    {/* KPI row */}
                    {fuelRows.length > 0 && (
                      <div className="dashboard-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                        <div className="stats-card">
                          <p className="stats-title">Total Cost</p>
                          <p className="stats-value">{fmtKES(fuelRows.reduce((s, r) => s + r.total_cost, 0))}</p>
                        </div>
                        <div className="stats-card">
                          <p className="stats-title">Total Liters</p>
                          <p className="stats-value">{fmtNum(fuelRows.reduce((s, r) => s + r.total_liters, 0), 0)} L</p>
                        </div>
                        <div className="stats-card">
                          <p className="stats-title">Fleet Avg km/L</p>
                          <p className="stats-value">
                            {fmtNum(
                              fuelRows.reduce((s, r) => s + r.total_distance_km, 0) /
                              Math.max(fuelRows.reduce((s, r) => s + r.total_liters, 0), 1)
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                    {fuelRows.length === 0 ? (
                      <p className="text-muted text-center py-4">No fuel data found.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Vehicle</th>
                              <th>Plate</th>
                              <th>Refills</th>
                              <th>Liters</th>
                              <th>Total Cost</th>
                              <th>Avg/L</th>
                              <th>Distance</th>
                              <th>km/L</th>
                              <th>Cost/km</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fuelRows.map(row => (
                              <tr key={row.vehicle_id}>
                                <td>{row.vehicle_name}</td>
                                <td>{row.plate_number}</td>
                                <td>{row.total_refills}</td>
                                <td>{fmtNum(row.total_liters, 0)} L</td>
                                <td>{fmtKES(row.total_cost)}</td>
                                <td>{fmtKES(row.avg_cost_per_liter)}</td>
                                <td>{fmtNum(row.total_distance_km, 0)} km</td>
                                <td>{fmtNum(row.efficiency_km_l)}</td>
                                <td>{fmtKES(row.cost_per_km)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Maintenance Costs */}
              {activeTab === 'maintenance' && (
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Maintenance Cost Report</h3>
                  </div>
                  <div className="card-body">
                    {maintRows.length === 0 ? (
                      <p className="text-muted text-center py-4">No maintenance data found.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Vehicle</th>
                              <th>Plate</th>
                              <th>Records</th>
                              <th>Completed</th>
                              <th>Labor</th>
                              <th>Parts</th>
                              <th>Total Cost</th>
                              <th>Avg/Service</th>
                              <th>Last Service</th>
                              <th>Next Due</th>
                            </tr>
                          </thead>
                          <tbody>
                            {maintRows.map(row => (
                              <tr key={row.vehicle_id}>
                                <td>{row.make} {row.model}</td>
                                <td>{row.plate_number}</td>
                                <td>{row.total_records}</td>
                                <td>{row.completed_services}</td>
                                <td>{fmtKES(row.total_labor_cost)}</td>
                                <td>{fmtKES(row.total_parts_cost)}</td>
                                <td>{fmtKES(row.total_cost)}</td>
                                <td>{fmtKES(row.avg_cost_per_service)}</td>
                                <td>{fmtDate(row.last_service_date)}</td>
                                <td>{fmtDate(row.next_service_due)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Compliance Summary */}
              {activeTab === 'compliance' && compSummary && (
                <div className="space-y-4">
                  <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Active Alerts', value: compSummary.active_alerts, cls: 'text-danger' },
                      { label: 'Critical', value: compSummary.critical_alerts, cls: 'text-danger' },
                      { label: 'High Priority', value: compSummary.high_priority_alerts, cls: 'text-warning' },
                      { label: 'Expiring This Week', value: compSummary.expiring_this_week, cls: 'text-warning' },
                      { label: 'Expiring This Month', value: compSummary.expiring_this_month, cls: '' },
                      { label: 'Acknowledged', value: compSummary.acknowledged_alerts, cls: '' },
                    ].map(stat => (
                      <div key={stat.label} className="stats-card">
                        <p className="stats-title">{stat.label}</p>
                        <p className={`stats-value ${stat.cls}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {compAlerts.length > 0 && (
                    <div className="card">
                      <div className="card-header"><h3 className="card-title">Active Compliance Alerts</h3></div>
                      <div className="card-body">
                        <div className="table-responsive">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Type</th>
                                <th>Title</th>
                                <th>Priority</th>
                                <th>Vehicle/Driver</th>
                                <th>Due Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {compAlerts.map(alert => (
                                <tr key={alert.id}>
                                  <td className="capitalize">{alert.alert_type.replace(/_/g, ' ')}</td>
                                  <td>{alert.title}</td>
                                  <td>
                                    <span className={`status-badge ${alert.alert_priority === 'critical' ? 'status-rejected' : alert.alert_priority === 'high' ? 'status-pending' : 'status-warning'}`}>
                                      {alert.alert_priority}
                                    </span>
                                  </td>
                                  <td>
                                    {alert.vehicle ? `${alert.vehicle.make} ${alert.vehicle.model} (${alert.vehicle.plate_number})` :
                                     alert.driver ? `${alert.driver.first_name} ${alert.driver.last_name}` : '—'}
                                  </td>
                                  <td>{fmtDate(alert.due_date)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </main>

      <style>{`@media print { .sidebar, .admin-header button, .card:first-child { display: none !important; } }`}</style>
    </div>
  );
}
