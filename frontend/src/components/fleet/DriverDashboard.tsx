// Fleet Phase 4: Driver Dashboard
// Mobile-optimized dashboard for drivers

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getTripRequestsByDriver } from '../../services/fleetService';
import { getComplianceAlerts } from '../../services/complianceService';
import { syncOfflineGpsQueue, getOfflineQueueSize } from '../../services/gpsService';
import { initPushNotifications } from '../../services/pushNotificationService';
import { TripRequest } from '../../types/fleet';
import { ComplianceAlert } from '../../types/fleetPhase3';
import { useAuth } from '../../hooks/useAuth';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function DriverDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [trips, setTrips] = useState<TripRequest[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [offlineQueueSize, setOfflineQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setIsLoading(true);
    try {
      const [tripData, alertData] = await Promise.all([
        getTripRequestsByDriver(profile.id),
        getComplianceAlerts({ driver_id: profile.id, status: 'active' }),
      ]);
      setTrips(tripData || []);
      setAlerts(alertData);
      setOfflineQueueSize(getOfflineQueueSize());
    } catch (err) {
      console.error('Error loading driver dashboard:', err);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadData();
    initPushNotifications();
  }, [loadData]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflineGpsQueue();
      setSyncResult(`Synced ${result.synced} GPS points.`);
      setOfflineQueueSize(getOfflineQueueSize());
      setTimeout(() => setSyncResult(null), 4000);
    } finally {
      setIsSyncing(false);
    }
  };

  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

  const todayTrips = trips.filter(t => {
    const start = t.start_datetime ? new Date(t.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) : undefined;
    return start === todayStr && ['assigned', 'in_progress'].includes(t.status);
  });

  const upcomingTrips = trips.filter(t => {
    const start = t.start_datetime ? new Date(t.start_datetime).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) : undefined;
    return start && start > todayStr && start <= weekFromNow && t.status === 'assigned';
  });

  const inProgressTrip = trips.find(t => t.status === 'in_progress');

  const licenseExpiry = profile?.license_expiry_date
    ? Math.ceil((new Date(profile.license_expiry_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress': return '#22c55e';
      case 'assigned': return '#3b82f6';
      case 'completed': return '#6b7280';
      default: return '#9ca3af';
    }
  };

  if (isLoading) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading your dashboard...</p>
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

          <header className="admin-header">
            <div>
              <h1>🚗 Driver Dashboard</h1>
              <p className="admin-subtitle">
                {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button className="btn btn-outline" onClick={loadData}>↻ Refresh</button>
          </header>

          {/* Offline GPS queue banner */}
          {offlineQueueSize > 0 && (
            <div className="alert mb-4" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>📡 {offlineQueueSize} GPS point{offlineQueueSize !== 1 ? 's' : ''} queued offline.</span>
              <button className="btn btn-primary btn-sm" onClick={handleSync} disabled={isSyncing}>
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}
          {syncResult && (
            <div className="alert alert-success mb-4">{syncResult}</div>
          )}

          {/* Active trip banner */}
          {inProgressTrip && (
            <div className="card mb-4" style={{ borderLeft: '4px solid #22c55e', background: '#f0fdf4' }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#15803d', marginBottom: 2 }}>🟢 Trip In Progress</div>
                  <div style={{ fontSize: 14 }}>
                    {inProgressTrip.request_number} → {inProgressTrip.destination}
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate(`/fleet/trip/${inProgressTrip.id}/execute`)}
                >
                  Continue Trip
                </button>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div className="dashboard-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div className="stats-card">
              <p className="stats-title">Today's Trips</p>
              <p className="stats-value">{todayTrips.length}</p>
            </div>
            <div className="stats-card">
              <p className="stats-title">Upcoming (7d)</p>
              <p className="stats-value">{upcomingTrips.length}</p>
            </div>
            <div className="stats-card">
              <p className="stats-title">Active Alerts</p>
              <p className={`stats-value ${alerts.length > 0 ? 'text-danger' : 'text-success'}`}>
                {alerts.length}
              </p>
            </div>
            {licenseExpiry != null && (
              <div className="stats-card">
                <p className="stats-title">License Expires</p>
                <p className={`stats-value ${licenseExpiry < 0 ? 'text-danger' : licenseExpiry <= 30 ? 'text-warning' : 'text-success'}`}>
                  {licenseExpiry < 0 ? 'Expired' : `${licenseExpiry}d`}
                </p>
              </div>
            )}
          </div>

          {/* Today's trips */}
          <div className="card mb-4">
            <div className="card-header">
              <h3 className="card-title">Today's Trips</h3>
            </div>
            <div className="card-body">
              {todayTrips.length === 0 ? (
                <p className="text-muted" style={{ textAlign: 'center', padding: 16 }}>No trips scheduled for today.</p>
              ) : (
                <div className="space-y-3">
                  {todayTrips.map(trip => (
                    <div key={trip.id} className="card" style={{ marginBottom: 0, borderLeft: `4px solid ${getStatusColor(trip.status)}` }}>
                      <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{trip.request_number}</div>
                          <div style={{ fontSize: 13, color: '#4b5563' }}>
                            📍 {trip.destination}<br />
                            🕐 {new Date(trip.start_datetime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
                            {trip.assigned_vehicle && (
                              <> · 🚙 {trip.assigned_vehicle.plate_number}</>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {trip.status === 'assigned' && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/fleet/trip/${trip.id}/execute`)}
                            >
                              Start
                            </button>
                          )}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => navigate(`/fleet/trip/${trip.id}/details`)}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Upcoming trips */}
          {upcomingTrips.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title">Upcoming This Week</h3>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Trip</th>
                        <th>Date</th>
                        <th>Destination</th>
                        <th>Vehicle</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingTrips.map(trip => {
                        const d = new Date(trip.start_datetime);
                        return (
                          <tr key={trip.id}>
                            <td>{trip.request_number}</td>
                            <td>{d.getDate()} {MONTH_NAMES[d.getMonth()]} {d.toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}</td>
                            <td>{trip.destination}</td>
                            <td>{trip.assigned_vehicle?.plate_number ?? '—'}</td>
                            <td>
                              <button className="btn btn-outline btn-sm" onClick={() => navigate(`/fleet/trip/${trip.id}/details`)}>
                                View
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Compliance alerts */}
          {alerts.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title" style={{ color: '#dc2626' }}>⚠️ Compliance Alerts</h3>
              </div>
              <div className="card-body space-y-3">
                {alerts.map(alert => (
                  <div key={alert.id} style={{
                    borderLeft: `4px solid ${alert.alert_priority === 'critical' ? '#ef4444' : '#f59e0b'}`,
                    padding: '10px 14px', borderRadius: '0 8px 8px 0',
                    background: alert.alert_priority === 'critical' ? '#fef2f2' : '#fffbeb'
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.title}</div>
                    {alert.description && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{alert.description}</div>}
                    {alert.due_date && (
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
                        Due: {new Date(alert.due_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All my trips link */}
          <div style={{ textAlign: 'center', paddingBottom: 24 }}>
            <button className="btn btn-outline" onClick={() => navigate('/fleet/my-trips')}>
              View All My Trips →
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
