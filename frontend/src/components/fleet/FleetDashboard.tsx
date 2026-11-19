// Fleet Management Dashboard
// Shows overview of vehicles, drivers, and trip requests

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
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
      <div className="admin-main">
        <div className="page-header">
          <div className="header-content">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h1 className="page-title">🚗 Fleet Dashboard</h1>
              <NotificationBell />
            </div>
            <p className="page-subtitle">Overview of fleet management operations</p>
          </div>
          {(profile?.role === 'fleet_manager' || profile?.role === 'super_admin' || profile?.role === 'hr_admin') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate('/fleet/vehicles/new')}
              >
                + Add Vehicle
              </button>
              <button
                className="btn btn-outline"
                onClick={() => navigate('/fleet/trip-request/new')}
              >
                + Request Trip
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-error mb-4">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading fleet data…</p>
          </div>
        ) : stats && (
          <>
            {/* Stats Cards */}
            <div className="dashboard-grid">
              <div className="stats-card" onClick={() => navigate('/fleet/vehicles')}>
                <div className="stats-header">
                  <div className="stats-icon stats-icon-primary">🚗</div>
                  <div>
                    <p className="stats-title">Total Vehicles</p>
                    <p className="stats-value">{stats.total_vehicles}</p>
                  </div>
                </div>
                <p className="stats-change">{stats.available_vehicles} available</p>
              </div>

              <div className="stats-card" onClick={() => navigate('/fleet/drivers')}>
                <div className="stats-header">
                  <div className="stats-icon stats-icon-success">🪪</div>
                  <div>
                    <p className="stats-title">Drivers</p>
                    <p className="stats-value">{stats.total_drivers}</p>
                  </div>
                </div>
                <p className="stats-change">{stats.active_drivers} active</p>
              </div>

              <div className="stats-card highlight" onClick={() => navigate('/fleet/assignments')}>
                <div className="stats-header">
                  <div className="stats-icon stats-icon-warning">📋</div>
                  <div>
                    <p className="stats-title">Pending Requests</p>
                    <p className="stats-value">{stats.pending_requests}</p>
                  </div>
                </div>
                <p className="stats-change">Awaiting approval or assignment</p>
              </div>

              <div className="stats-card">
                <div className="stats-header">
                  <div className="stats-icon stats-icon-primary">📅</div>
                  <div>
                    <p className="stats-title">Today's Trips</p>
                    <p className="stats-value">{stats.todays_trips}</p>
                  </div>
                </div>
                <p className="stats-change">Active and scheduled</p>
              </div>
            </div>

            {/* Vehicle Status Breakdown */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Vehicle Status</h2>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { label: 'Available',    count: stats.available_vehicles,   color: '#16a34a' },
                    { label: 'In Use',       count: stats.in_use_vehicles,       color: '#2563eb' },
                    { label: 'Maintenance',  count: stats.maintenance_vehicles,  color: '#d97706' },
                  ].map(({ label, count, color }) => {
                    const pct = stats.total_vehicles > 0 ? (count / stats.total_vehicles) * 100 : 0;
                    return (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', minWidth: 80 }}>{label}</span>
                        <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, background: color, height: '100%', borderRadius: 99, transition: 'width 0.4s ease' }} />
                        </div>
                        <span style={{ fontSize: 13, color: '#6b7280', minWidth: 20, textAlign: 'right' }}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pending Assignments */}
            {pendingAssignments.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">Awaiting Assignment</h2>
                  <span style={{ display: 'inline-flex', padding: '2px 8px', fontSize: 12, fontWeight: 600, borderRadius: 99, background: '#fef9c3', color: '#92400e' }}>{pendingAssignments.length}</span>
                </div>
                <div className="card-body">
                  <div className="table-responsive">
                    <table className="table">
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
                            <td>{new Date(request.start_datetime).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}</td>
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
                    <div className="mt-4 text-center">
                      <button 
                        className="btn btn-outline"
                        onClick={() => navigate('/fleet/assignments')}
                      >
                        View all {pendingAssignments.length} pending assignments →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upcoming Alerts */}
            {stats.upcoming_alerts.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">⚠️ Upcoming Alerts</h2>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stats.upcoming_alerts.slice(0, 10).map((alert, index) => {
                      const urgent  = alert.days_until <= 7;
                      const warning = alert.days_until <= 14;
                      const borderColor = urgent ? '#ef4444' : warning ? '#f59e0b' : '#3b82f6';
                      const bgColor     = urgent ? '#fef2f2' : warning ? '#fffbeb' : '#eff6ff';
                      return (
                        <div
                          key={index}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', borderRadius: 8,
                            borderLeft: `4px solid ${borderColor}`, background: bgColor,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{getAlertIcon(alert.type)}</span>
                            <div>
                              <p style={{ fontWeight: 600, color: '#111827', margin: 0, fontSize: 14 }}>{alert.entity_name}</p>
                              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{getAlertLabel(alert.type)}</p>
                            </div>
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: urgent ? '#dc2626' : '#6b7280', whiteSpace: 'nowrap' }}>
                            {alert.days_until <= 0 ? 'Overdue!' : `${alert.days_until}d`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FleetDashboard;

