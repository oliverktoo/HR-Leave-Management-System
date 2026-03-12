// My Trip Requests Component
// Shows user's trip requests and allows creating new ones

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { getMyTripRequests, cancelTripRequest } from '../../services/fleetService';
import { TripRequest, TripRequestStatus } from '../../types/fleet';
import { TripRequestModal } from './TripRequestModal';

export function MyTripRequests() {
  const navigate = useNavigate();
  const location = useLocation();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TripRequestStatus | 'all'>('all');
  const [showModal, setShowModal] = useState(
    (location.state as { openModal?: boolean } | null)?.openModal === true
  );

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getMyTripRequests();
      setRequests(data);
    } catch (err) {
      console.error('Error loading trip requests:', err);
      setError('Failed to load trip requests');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string, requestNumber: string) => {
    if (!confirm(`Are you sure you want to cancel trip request ${requestNumber}?`)) {
      return;
    }

    try {
      await cancelTripRequest(id);
      await loadRequests();
    } catch (err) {
      console.error('Error cancelling request:', err);
      setError('Failed to cancel request');
    }
  };

  const getStatusBadge = (status: TripRequestStatus) => {
    const statusConfig: Record<TripRequestStatus, { class: string; label: string }> = {
      pending: { class: 'badge-warning', label: '⏳ Pending' },
      approved: { class: 'badge-info', label: '✅ Approved' },
      rejected: { class: 'badge-danger', label: '❌ Rejected' },
      assigned: { class: 'badge-primary', label: '🚗 Assigned' },
      in_progress: { class: 'badge-success', label: '🚀 In Progress' },
      completed: { class: 'badge-secondary', label: '✔️ Completed' },
      cancelled: { class: 'badge-secondary', label: '🚫 Cancelled' },
    };
    const config = statusConfig[status] || statusConfig.pending;
    return <span className={`badge ${config.class}`}>{config.label}</span>;
  };

  const filteredRequests = filter === 'all' 
    ? requests 
    : requests.filter(r => r.status === filter);

  const canCancel = (status: TripRequestStatus) => 
    ['pending', 'approved', 'assigned'].includes(status);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">
          <header className="admin-header">
            <div className="header-content">
              <h1>My Trip Requests</h1>
              <p className="admin-subtitle">View and manage your vehicle booking requests</p>
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => setShowModal(true)}
            >
              🚗 Request a Trip
            </button>
          </header>

          {error && (
            <div className="alert alert-error mb-4">
              <span>{error}</span>
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="filter-tabs mb-4">
            <button 
              className={`tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({requests.length})
            </button>
            <button 
              className={`tab ${filter === 'pending' ? 'active' : ''}`}
              onClick={() => setFilter('pending')}
            >
              Pending ({requests.filter(r => r.status === 'pending').length})
            </button>
            <button 
              className={`tab ${filter === 'approved' ? 'active' : ''}`}
              onClick={() => setFilter('approved')}
            >
              Approved ({requests.filter(r => r.status === 'approved').length})
            </button>
            <button 
              className={`tab ${filter === 'assigned' ? 'active' : ''}`}
              onClick={() => setFilter('assigned')}
            >
              Assigned ({requests.filter(r => r.status === 'assigned').length})
            </button>
            <button 
              className={`tab ${filter === 'completed' ? 'active' : ''}`}
              onClick={() => setFilter('completed')}
            >
              Completed ({requests.filter(r => r.status === 'completed').length})
            </button>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading trip requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🚗</div>
              <h3>No trip requests</h3>
              <p>
                {filter === 'all' 
                  ? "You haven't made any trip requests yet"
                  : `No ${filter} requests`}
              </p>
              {filter === 'all' && (
                <button 
                  className="btn btn-primary mt-2"
                  onClick={() => setShowModal(true)}
                >
                  🚗 Request a Trip
                </button>
              )}
            </div>
          ) : (
            <div className="trip-request-list">
              {filteredRequests.map((request) => (
                <div key={request.id} className="trip-request-card">
                  <div className="request-header">
                    <span className="request-number">{request.request_number}</span>
                    {getStatusBadge(request.status)}
                  </div>
                  
                  <div className="request-body">
                    <div className="request-route">
                      <div className="route-point">
                        <span className="point-icon">🎯</span>
                        <span className="point-label">Route</span>
                        <span className="point-value">{request.destination}</span>
                      </div>
                    </div>
                    
                    <div className="request-details">
                      <div className="detail-item">
                        <span className="detail-icon">📅</span>
                        <span className="detail-label">Date</span>
                        <span className="detail-value">
                          {new Date(request.start_datetime).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-icon">⏰</span>
                        <span className="detail-label">Time</span>
                        <span className="detail-value">
                          {new Date(request.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-icon">👥</span>
                        <span className="detail-label">Passengers</span>
                        <span className="detail-value">{request.passenger_count}</span>
                      </div>
                    </div>
                    
                    <p className="request-purpose">{request.purpose}</p>
                    
                    {/* Assignment Info */}
                    {request.status === 'assigned' && request.assigned_vehicle && (
                      <div className="assignment-info">
                        <div className="assignment-item">
                          <span className="assignment-icon">🚗</span>
                          <span>
                            {(request.assigned_vehicle as any).plate_number} - 
                            {(request.assigned_vehicle as any).make} {(request.assigned_vehicle as any).model}
                          </span>
                        </div>
                        {request.assigned_driver_profile && (
                          <div className="assignment-item">
                            <span className="assignment-icon">🪪</span>
                            <span>Driver: {(request.assigned_driver_profile as any).full_name}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Rejection Reason */}
                    {request.status === 'rejected' && request.rejection_reason && (
                      <div className="rejection-reason">
                        <strong>Reason:</strong> {request.rejection_reason}
                      </div>
                    )}
                  </div>
                  
                  <div className="request-footer">
                    <span className="request-date">
                      Submitted: {new Date(request.created_at).toLocaleDateString()}
                    </span>
                    <div className="request-actions">
                      {canCancel(request.status) && (
                        <button 
                          className="btn btn-sm btn-danger"
                          onClick={() => handleCancel(request.id, request.request_number)}
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        className="btn btn-sm btn-secondary"
                        onClick={() => navigate(`/fleet/trip-request/${request.id}`)}
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Trip Request Modal */}
      <TripRequestModal 
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          loadRequests();
          setShowModal(false);
        }}
      />
    </div>
  );
}

export default MyTripRequests;
