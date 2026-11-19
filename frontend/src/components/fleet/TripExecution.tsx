// Trip Execution Component
// Interface for drivers to start and end trips

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import {
  getTripRequestById,
} from '../../services/fleetService';
import {
  startTrip,
  endTrip,
  getTripLogs,
} from '../../services/fleetPhase2Service';
import { startGpsTracking, syncOfflineGpsQueue } from '../../services/gpsService';
import { TripRequest } from '../../types/fleet';
import { TripLog } from '../../types/fleetPhase2';
import { useAuth } from '../../hooks/useAuth';

export function TripExecution() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();

  const [trip, setTrip] = useState<TripRequest | null>(null);
  const [tripLogs, setTripLogs] = useState<TripLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const gpsStopFnRef = useRef<(() => void) | null>(null);
  
  // Start trip form
  const [startOdometer, setStartOdometer] = useState<string>('');
  const [showStartForm, setShowStartForm] = useState(false);
  
  // End trip form
  const [endOdometer, setEndOdometer] = useState<string>('');
  const [tripRating, setTripRating] = useState<number>(5);
  const [tripFeedback, setTripFeedback] = useState<string>('');
  const [showEndForm, setShowEndForm] = useState(false);

  useEffect(() => {
    if (id) {
      loadTripData(id);
    }
  }, [id]);

  const loadTripData = async (tripId: string) => {
    try {
      setLoading(true);
      const [tripData, logs] = await Promise.all([
        getTripRequestById(tripId),
        getTripLogs(tripId),
      ]);
      
      if (!tripData) {
        setError('Trip not found');
        return;
      }
      
      setTrip(tripData);
      setTripLogs(logs);
    } catch (err) {
      console.error('Error loading trip:', err);
      setError('Failed to load trip data');
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrip = async () => {
    if (!trip || !startOdometer) {
      setError('Please enter odometer reading');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await startTrip({
        trip_id: trip.id,
        start_odometer: parseFloat(startOdometer),
      });

      // Start GPS tracking (30-second intervals)
      gpsStopFnRef.current = startGpsTracking(trip.id, 30000);
      await syncOfflineGpsQueue();

      setSuccess('Trip started successfully!');
      setShowStartForm(false);
      await loadTripData(trip.id);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error starting trip:', err);
      setError(err.message || 'Failed to start trip');
    } finally {
      setProcessing(false);
    }
  };

  const handleEndTrip = async () => {
    if (!trip || !endOdometer) {
      setError('Please enter odometer reading');
      return;
    }

    if (trip.start_odometer && parseFloat(endOdometer) < trip.start_odometer) {
      setError('End odometer must be greater than start odometer');
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      await endTrip({
        trip_id: trip.id,
        end_odometer: parseFloat(endOdometer),
        trip_rating: tripRating,
        trip_feedback: tripFeedback || undefined,
      });

      // Stop GPS tracking and sync any queued points
      if (gpsStopFnRef.current) {
        gpsStopFnRef.current();
        gpsStopFnRef.current = null;
      }
      await syncOfflineGpsQueue();

      setSuccess('Trip completed successfully!');
      setShowEndForm(false);
      await loadTripData(trip.id);

      setTimeout(() => {
        setSuccess(null);
        navigate('/fleet/my-trips');
      }, 2000);
    } catch (err: any) {
      console.error('Error ending trip:', err);
      setError(err.message || 'Failed to end trip');
    } finally {
      setProcessing(false);
    }
  };

  const canExecute = trip && (
    trip.assigned_driver_id === profile?.id || 
    profile?.role === 'fleet_manager' || 
    profile?.role === 'super_admin'
  );

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
            <button onClick={() => navigate('/fleet/my-trips')}>
              ← Back to My Trips
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!canExecute) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="unauthorized">
            <h2>Access Denied</h2>
            <p>You are not assigned as the driver for this trip.</p>
            <button onClick={() => navigate('/fleet/my-trips')}>
              ← Back to My Trips
            </button>
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
            <div className="header-left">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => navigate('/fleet/my-trips')}
              >
                ← Back
              </button>
              <div>
                <h1>🚗 Trip Execution: {trip.request_number}</h1>
                <p className="admin-subtitle">
                  Status: <span className={`status-badge status-${trip.status}`}>{trip.status}</span>
                </p>
              </div>
            </div>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {success && (
            <div className="alert alert-success mb-4">
              <span>{success}</span>
            </div>
          )}

          {/* Trip Details Card */}
          <div className="card mb-4">
            <h3>Trip Details</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <strong>Destination:</strong>
                <span>{trip.destination}</span>
              </div>
              <div className="detail-item">
                <strong>Vehicle:</strong>
                <span>
                  {trip.assigned_vehicle?.plate_number} - {trip.assigned_vehicle?.make} {trip.assigned_vehicle?.model}
                </span>
              </div>
              <div className="detail-item">
                <strong>Planned Departure:</strong>
                <span>{new Date(trip.start_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="detail-item">
                <strong>Planned Return:</strong>
                <span>{new Date(trip.end_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="detail-item">
                <strong>Passengers:</strong>
                <span>{trip.passenger_count}</span>
              </div>
              <div className="detail-item">
                <strong>Purpose:</strong>
                <span>{trip.purpose}</span>
              </div>
            </div>
          </div>

          {/* Trip Execution Panel */}
          {trip.status === 'assigned' && (
            <div className="card mb-4 card-action">
              <h3>✅ Ready to Start Trip</h3>
              {!showStartForm ? (
                <button 
                  className="btn btn-success btn-lg"
                  onClick={() => setShowStartForm(true)}
                >
                  🚀 Start Trip
                </button>
              ) : (
                <div className="execution-form">
                  <div className="form-group">
                    <label className="required">Current Odometer Reading (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={startOdometer}
                      onChange={(e) => setStartOdometer(e.target.value)}
                      placeholder="e.g., 45320.5"
                      autoFocus
                    />
                    <small className="form-text">
                      Current vehicle odometer: {trip.assigned_vehicle?.current_odometer || 'Not recorded'} km
                    </small>
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowStartForm(false);
                        setStartOdometer('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      onClick={handleStartTrip}
                      disabled={processing || !startOdometer}
                    >
                      {processing ? 'Starting...' : '🚀 Confirm Start'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {trip.status === 'in_progress' && (
            <div className="card mb-4 card-info">
              <h3>🔄 Trip In Progress</h3>
              <div className="trip-progress-stats">
                <div className="stat-item">
                  <span className="stat-label">Started At</span>
                  <span className="stat-value">
                    {trip.actual_start_datetime 
                      ? new Date(trip.actual_start_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'N/A'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Start Odometer</span>
                  <span className="stat-value">{trip.start_odometer || 'N/A'} km</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Duration</span>
                  <span className="stat-value">
                    {trip.actual_start_datetime 
                      ? Math.round((Date.now() - new Date(trip.actual_start_datetime).getTime()) / (1000 * 60))
                      : 0} minutes
                  </span>
                </div>
              </div>

              {!showEndForm ? (
                <button 
                  className="btn btn-primary btn-lg mt-3"
                  onClick={() => setShowEndForm(true)}
                >
                  🏁 End Trip
                </button>
              ) : (
                <div className="execution-form mt-3">
                  <div className="form-group">
                    <label className="required">Final Odometer Reading (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      className="form-control"
                      value={endOdometer}
                      onChange={(e) => setEndOdometer(e.target.value)}
                      placeholder="e.g., 45520.8"
                      autoFocus
                    />
                    <small className="form-text">
                      Start reading: {trip.start_odometer} km
                      {endOdometer && trip.start_odometer && (
                        <> · Distance: {(parseFloat(endOdometer) - trip.start_odometer).toFixed(1)} km</>
                      )}
                    </small>
                  </div>

                  <div className="form-group">
                    <label>Rate This Trip</label>
                    <div className="rating-input">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          className={`star-btn ${star <= tripRating ? 'active' : ''}`}
                          onClick={() => setTripRating(star)}
                        >
                          ⭐
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Trip Feedback (Optional)</label>
                    <textarea
                      className="form-control"
                      value={tripFeedback}
                      onChange={(e) => setTripFeedback(e.target.value)}
                      placeholder="Any issues, delays, or comments about the trip?"
                      rows={3}
                    />
                  </div>

                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowEndForm(false);
                        setEndOdometer('');
                        setTripRating(5);
                        setTripFeedback('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleEndTrip}
                      disabled={processing || !endOdometer}
                    >
                      {processing ? 'Completing...' : '🏁 Complete Trip'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {trip.status === 'completed' && (
            <div className="card mb-4 card-success">
              <h3>✅ Trip Completed</h3>
              <div className="trip-summary-stats">
                <div className="stat-card">
                  <span className="stat-icon">📍</span>
                  <div className="stat-content">
                    <span className="stat-label">Distance</span>
                    <span className="stat-value">
                      {trip.actual_distance_km?.toFixed(1) || 'N/A'} km
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">⏱️</span>
                  <div className="stat-content">
                    <span className="stat-label">Duration</span>
                    <span className="stat-value">
                      {trip.actual_start_datetime && trip.actual_end_datetime
                        ? Math.round(
                            (new Date(trip.actual_end_datetime).getTime() - 
                             new Date(trip.actual_start_datetime).getTime()) / (1000 * 60 * 60)
                          )
                        : 'N/A'} hours
                    </span>
                  </div>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">🛣️</span>
                  <div className="stat-content">
                    <span className="stat-label">Odometer</span>
                    <span className="stat-value">
                      {trip.start_odometer} → {trip.end_odometer} km
                    </span>
                  </div>
                </div>
                {trip.trip_rating && (
                  <div className="stat-card">
                    <span className="stat-icon">⭐</span>
                    <div className="stat-content">
                      <span className="stat-label">Rating</span>
                      <span className="stat-value">{trip.trip_rating.toFixed(1)}</span>
                    </div>
                  </div>
                )}
              </div>
              {trip.trip_feedback && (
                <div className="feedback-section mt-3">
                  <strong>Feedback:</strong>
                  <p>{trip.trip_feedback}</p>
                </div>
              )}
            </div>
          )}

          {/* Trip Logs */}
          {tripLogs.length > 0 && (
            <div className="card">
              <h3>📋 Trip Activity Log</h3>
              <div className="trip-logs-timeline">
                {tripLogs.map((log) => (
                  <div key={log.id} className={`log-entry log-type-${log.log_type}`}>
                    <div className="log-icon">
                      {getLogIcon(log.log_type)}
                    </div>
                    <div className="log-content">
                      <div className="log-header">
                        <span className="log-type">{formatLogType(log.log_type)}</span>
                        <span className="log-time">
                          {new Date(log.log_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="log-description">{log.description}</p>
                      {log.odometer_reading && (
                        <span className="log-meta">📊 {log.odometer_reading} km</span>
                      )}
                      {log.location && (
                        <span className="log-meta">📍 {log.location}</span>
                      )}
                      {log.duration_minutes && (
                        <span className="log-meta">⏱️ {log.duration_minutes} minutes</span>
                      )}
                      {log.logger && (
                        <span className="log-meta">👤 {log.logger.full_name}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          {trip.status === 'in_progress' && (
            <div className="quick-actions">
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/fleet/trip/${trip.id}/log`)}
              >
                📝 Add Log Entry
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/fleet/trip/${trip.id}/expenses`)}
              >
                💰 Add Expense
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/fleet/trip/${trip.id}/fuel`)}
              >
                ⛽ Record Fuel
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// Helper functions
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

function formatLogType(logType: string): string {
  return logType.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}
