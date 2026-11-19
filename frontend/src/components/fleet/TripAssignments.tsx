// Trip Assignment Component
// Fleet Manager assigns vehicles and drivers to approved requests

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { 
  getAwaitingAssignment, 
  getTripRequestById,
  getAvailableVehicles,
  getAvailableDrivers,
  assignTripRequest,
} from '../../services/fleetService';
import { FleetVehicle, DriverProfile, AssignTripRequestInput, TripRequest } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

export function TripAssignments() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<TripRequest | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<FleetVehicle[]>([]);
  const [availableDrivers, setAvailableDrivers] = useState<DriverProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [assignment, setAssignment] = useState<Partial<AssignTripRequestInput>>({});

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load approved requests awaiting assignment
      const pendingRequests = await getAwaitingAssignment();
      setRequests(pendingRequests);
      
      // If ID provided, load that specific request
      if (id) {
        const request = await getTripRequestById(id);
        if (request) {
          setSelectedRequest(request);
          await loadAvailability(request);
        }
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailability = async (request: TripRequest) => {
    try {
      const [vehicles, drivers] = await Promise.all([
        getAvailableVehicles(
          request.start_datetime,
          request.end_datetime,
          request.passenger_count
        ),
        getAvailableDrivers(
          request.start_datetime,
          request.end_datetime
        ),
      ]);
      setAvailableVehicles(vehicles);
      setAvailableDrivers(drivers);
    } catch (err: any) {
      console.error('Error loading availability:', err);
      setError(`Failed to load available vehicles/drivers: ${err?.message || 'Unknown error'}. Try refreshing.`);
    }
  };

  const selectRequest = async (request: TripRequest) => {
    setSelectedRequest(request);
    setAssignment({});
    navigate(`/fleet/assignments/${request.id}`);
    await loadAvailability(request);
  };

  const handleAssign = async () => {
    if (!selectedRequest) return;
    if (!assignment.assigned_vehicle_id) {
      setError('Please select a vehicle');
      return;
    }

    try {
      setAssigning(true);
      setError(null);
      // Block assignment if selected driver has expired license
      if (assignment.assigned_driver_id) {
        const selectedDriver = availableDrivers.find(d => d.user_id === assignment.assigned_driver_id);
        if (selectedDriver && isDriverLicenseExpired(selectedDriver)) {
          setError('Cannot assign a driver with an expired license. Please select a different driver.');
          setAssigning(false);
          return;
        }
      }
      await assignTripRequest({
        id: selectedRequest.id,
        assigned_vehicle_id: assignment.assigned_vehicle_id,
        assigned_driver_id: assignment.assigned_driver_id || undefined,
      });

      setSuccess(`Trip ${selectedRequest.request_number} assigned successfully!`);
      setSelectedRequest(null);
      setAssignment({});
      
      // Reload list
      await loadData();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error assigning trip:', err);
      setError(err.message || 'Failed to assign trip');
    } finally {
      setAssigning(false);
    }
  };

  const canManage = profile?.role === 'fleet_manager' || profile?.role === 'super_admin' || profile?.role === 'hr_admin';

  const isDriverLicenseExpired = (driver: DriverProfile) => {
    if (!driver.license_expiry) return false;
    return new Date(driver.license_expiry) < new Date();
  };

  const isDriverLicenseExpiringSoon = (driver: DriverProfile) => {
    if (!driver.license_expiry) return false;
    const daysUntil = (new Date(driver.license_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 30;
  };

  if (!canManage) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main">
          <div className="unauthorized">
            <h2>Access Denied</h2>
            <p>You don't have permission to manage trip assignments.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 className="page-title">Trip Assignments</h1>
          <NotificationBell />
        </div>
        <div className="page-header">
          <div className="header-content">
            <p className="page-subtitle">Assign vehicles and drivers to approved trip requests</p>
          </div>
        </div>

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

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading assignments...</p>
            </div>
          ) : (
            <div className="assignment-layout">
              {/* Request List */}
              <div className="assignment-list-panel">
                <h3>Pending Assignments ({requests.length})</h3>
                
                {requests.length === 0 ? (
                  <div className="empty-state small">
                    <p>No trips awaiting assignment</p>
                  </div>
                ) : (
                  <div className="assignment-list">
                    {requests.map((request) => (
                      <div 
                        key={request.id}
                        className={`assignment-item ${selectedRequest?.id === request.id ? 'selected' : ''}`}
                        onClick={() => selectRequest(request)}
                      >
                        <div className="item-header">
                          <span className="request-number">{request.request_number}</span>
                          <span className="passenger-count">👥 {request.passenger_count}</span>
                        </div>
                        <div className="item-route">
                          <span>{request.destination}</span>
                        </div>
                        <div className="item-datetime">
                          📅 {new Date(request.start_datetime).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}
                          {' '}
                          ⏰ {new Date(request.start_datetime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="item-requester">
                          👤 {(request.requester_profile as any)?.full_name || 'Unknown'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assignment Form */}
              <div className="assignment-form-panel">
                {selectedRequest ? (
                  <>
                    <h3>Assign Trip: {selectedRequest.request_number}</h3>
                    
                    <div className="request-details-card">
                      <div className="detail-row">
                        <strong>Route:</strong>
                        <span>{selectedRequest.destination}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Date/Time:</strong>
                        <span>
                          {new Date(selectedRequest.start_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} -
                          {new Date(selectedRequest.end_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="detail-row">
                        <strong>Passengers:</strong>
                        <span>{selectedRequest.passenger_count}</span>
                      </div>
                      <div className="detail-row">
                        <strong>Purpose:</strong>
                        <span>{selectedRequest.purpose}</span>
                      </div>
                      {selectedRequest.preferred_vehicle_id && (
                        <div className="detail-row">
                          <strong>Preferred Vehicle:</strong>
                          <span>{(selectedRequest.preferred_vehicle as any)?.plate_number || 'Specified'}</span>
                        </div>
                      )}
                    </div>

                    <div className="assignment-form">
                      <div className="form-group">
                        <label className="required">Select Vehicle</label>
                        {availableVehicles.length === 0 ? (
                          <div className="alert alert-warning">
                            No vehicles available for this time period with sufficient capacity.
                            You may need to reassign another trip or add a vehicle.
                          </div>
                        ) : (
                          <div className="vehicle-options">
                            {availableVehicles.map((vehicle) => (
                              <label 
                                key={vehicle.id}
                                className={`vehicle-option ${assignment.assigned_vehicle_id === vehicle.id ? 'selected' : ''}`}
                              >
                                <input
                                  type="radio"
                                  name="vehicle"
                                  value={vehicle.id}
                                  checked={assignment.assigned_vehicle_id === vehicle.id}
                                  onChange={() => setAssignment({ ...assignment, assigned_vehicle_id: vehicle.id })}
                                />
                                <div className="option-content">
                                  <span className="option-plate">{vehicle.plate_number}</span>
                                  <span className="option-model">{vehicle.make} {vehicle.model}</span>
                                  <span className="option-capacity">👥 {vehicle.seating_capacity} seats</span>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Select Driver <span style={{color:'#9ca3af', fontWeight:400, fontSize:'0.8rem'}}>(optional)</span></label>
                          {availableDrivers.length === 0 ? (
                            <div className="alert alert-warning">
                              <strong>No driver profiles found.</strong> To assign a driver, first go to{' '}
                              <a href="/fleet/drivers" style={{color:'#b45309', textDecoration:'underline'}}>Fleet → Drivers</a>{' '}
                              and add driver records. You can also assign just the vehicle and add a driver later.
                            </div>
                          ) : (
                            <div className="driver-options">
                              {availableDrivers.map((driver) => {
                                const expired = isDriverLicenseExpired(driver);
                                const expiringSoon = !expired && isDriverLicenseExpiringSoon(driver);
                                return (
                                  <label 
                                    key={driver.id}
                                    className={`driver-option ${assignment.assigned_driver_id === driver.user_id ? 'selected' : ''} ${expired ? 'driver-expired' : ''}`}
                                  >
                                    <input
                                      type="radio"
                                      name="driver"
                                      value={driver.user_id}
                                      checked={assignment.assigned_driver_id === driver.user_id}
                                      onChange={() => {
                                        if (expired) return;
                                        setAssignment({ ...assignment, assigned_driver_id: driver.user_id });
                                      }}
                                      disabled={expired}
                                    />
                                    <div className="option-content">
                                      <span className="option-name">{(driver.user_profile as any)?.full_name || 'Unknown'}</span>
                                      <span className="option-license">🪪 {driver.license_number}</span>
                                      {driver.driver_rating && (
                                        <span className="option-rating">⭐ {driver.driver_rating.toFixed(1)}</span>
                                      )}
                                      {expired && (
                                        <span className="badge badge-danger" style={{fontSize:'0.7rem'}}>License Expired</span>
                                      )}
                                      {expiringSoon && (
                                        <span className="badge badge-warning" style={{fontSize:'0.7rem'}}>Expires Soon</span>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>


                      <div className="form-actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            setSelectedRequest(null);
                            setAssignment({});
                            navigate('/fleet/assignments');
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleAssign}
                          disabled={
                            assigning || 
                            !assignment.assigned_vehicle_id
                          }
                        >
                          {assigning ? 'Assigning...' : '✅ Assign Trip'}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <h3>Select a Trip Request</h3>
                    <p>Click on a pending request from the list to assign a vehicle and driver</p>
                  </div>
                )}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default TripAssignments;
