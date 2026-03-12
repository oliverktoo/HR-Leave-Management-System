// Fleet Management Dashboard
// Shows overview of vehicles, drivers, and trip requests

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getFleetDashboardStats, getAwaitingAssignment } from '../../services/fleetService';
import { FleetDashboardStats, TripRequest } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

export function FleetDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [stats, setStats] = useState<FleetDashboardStats | null>(null);
  const [pendingAssignments, setPendingAssignments] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [dashboardStats, awaiting] = await Promise.all([
        getFleetDashboardStats(),
        getAwaitingAssignment(),
      ]);
      setStats(dashboardStats);
      setPendingAssignments(awaiting);
    } catch (err) {
      console.error('Error loading fleet dashboard:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'license_expiry': return '🪪';
      case 'insurance_expiry': return '📋';
      case 'service_due': return '🔧';
      default: return '⚠️';
    }
  };

  const getAlertLabel = (type: string) => {
    switch (type) {
      case 'license_expiry': return 'License Expiry';
      case 'insurance_expiry': return 'Insurance Expiry';
      case 'service_due': return 'Service Due';
      default: return 'Alert';
    }
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="page-header">
            <div className="header-content">
              <h1>🚗 Fleet Dashboard</h1>
              <p className="header-subtitle">Overview of fleet management operations</p>
            </div>
            {(profile?.role === 'fleet_manager' || profile?.role === 'super_admin' || profile?.role === 'hr_admin') && (
              <div className="button-group">
                <button 
                  className="btn btn-primary"
                  onClick={() => navigate('/fleet/vehicles/new')}
                >
                  + Add Vehicle
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => navigate('/fleet/trip-request/new')}
                >
                  + Request Trip
                </button>
              </div>
            )}
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading fleet data...</p>
            </div>
          ) : stats && (
            <>
              {/* Stats Cards */}
              <div className="stats-grid">
                <div className="stat-card" onClick={() => navigate('/fleet/vehicles')}>
                  <div className="stat-icon">🚗</div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.total_vehicles}</div>
                    <div className="stat-label">Total Vehicles</div>
                    <div className="stat-detail">
                      {stats.available_vehicles} available
                    </div>
                  </div>
                </div>

                <div className="stat-card" onClick={() => navigate('/fleet/drivers')}>
                  <div className="stat-icon">🪪</div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.total_drivers}</div>
                    <div className="stat-label">Drivers</div>
                    <div className="stat-detail">
                      {stats.active_drivers} active
                    </div>
                  </div>
                </div>

                <div className="stat-card highlight" onClick={() => navigate('/fleet/assignments')}>
                  <div className="stat-icon">📋</div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.pending_requests}</div>
                    <div className="stat-label">Pending Requests</div>
                    <div className="stat-detail">
                      Awaiting approval or assignment
                    </div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">📅</div>
                  <div className="stat-content">
                    <div className="stat-value">{stats.todays_trips}</div>
                    <div className="stat-label">Today's Trips</div>
                    <div className="stat-detail">
                      Active and scheduled
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Status Breakdown */}
              <div className="admin-card mt-4">
                <div className="card-header">
                  <h2 className="card-title">Vehicle Status</h2>
                </div>
                <div className="card-body">
                  <div className="status-bars">
                    <div className="status-bar">
                      <span className="status-label">Available</span>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill success"
                          style={{ width: `${stats.total_vehicles > 0 ? (stats.available_vehicles / stats.total_vehicles) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="status-count">{stats.available_vehicles}</span>
                    </div>
                    <div className="status-bar">
                      <span className="status-label">In Use</span>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill primary"
                          style={{ width: `${stats.total_vehicles > 0 ? (stats.in_use_vehicles / stats.total_vehicles) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="status-count">{stats.in_use_vehicles}</span>
                    </div>
                    <div className="status-bar">
                      <span className="status-label">Maintenance</span>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill warning"
                          style={{ width: `${stats.total_vehicles > 0 ? (stats.maintenance_vehicles / stats.total_vehicles) * 100 : 0}%` }}
                        ></div>
                      </div>
                      <span className="status-count">{stats.maintenance_vehicles}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending Assignments */}
              {pendingAssignments.length > 0 && (
                <div className="admin-card mt-4">
                  <div className="card-header">
                    <h2 className="card-title">Awaiting Assignment</h2>
                    <span className="badge badge-warning">{pendingAssignments.length}</span>
                  </div>
                  <div className="card-body">
                    <div className="table-responsive">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Request #</th>
                            <th>Requester</th>
                            <th>Destination</th>
                            <th>Date</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingAssignments.slice(0, 5).map((request) => (
                            <tr key={request.id}>
                              <td>{request.request_number}</td>
                              <td>{(request.requester_profile as any)?.full_name || 'Unknown'}</td>
                              <td>{request.destination}</td>
                              <td>{new Date(request.start_datetime).toLocaleDateString()}</td>
                              <td>
                                <button 
                                  className="btn btn-sm btn-primary"
                                  onClick={() => navigate(`/fleet/assignments/${request.id}`)}
                                >
                                  Assign
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {pendingAssignments.length > 5 && (
                      <button 
                        className="btn btn-link mt-2"
                        onClick={() => navigate('/fleet/assignments')}
                      >
                        View all {pendingAssignments.length} pending assignments →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Upcoming Alerts */}
              {stats.upcoming_alerts.length > 0 && (
                <div className="admin-card mt-4">
                  <div className="card-header">
                    <h2 className="card-title">⚠️ Upcoming Alerts</h2>
                  </div>
                  <div className="card-body">
                    <div className="alert-list">
                      {stats.upcoming_alerts.slice(0, 10).map((alert, index) => (
                        <div 
                          key={index} 
                          className={`alert-item ${alert.days_until <= 7 ? 'urgent' : alert.days_until <= 14 ? 'warning' : ''}`}
                        >
                          <span className="alert-icon">{getAlertIcon(alert.type)}</span>
                          <span className="alert-entity">{alert.entity_name}</span>
                          <span className="alert-type">{getAlertLabel(alert.type)}</span>
                          <span className={`alert-days ${alert.days_until <= 7 ? 'text-danger' : ''}`}>
                            {alert.days_until <= 0 
                              ? 'Overdue!' 
                              : `${alert.days_until} days`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default FleetDashboard;
