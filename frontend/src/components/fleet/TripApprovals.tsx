// Trip Approvals Component (for HOD)
// HOD approves/rejects trip requests from their department

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { 
  getPendingDepartmentApprovals, 
  approveTripRequest, 
  rejectTripRequest 
} from '../../services/fleetService';
import { TripRequest } from '../../types/fleet';
import { useAuth } from '../../hooks/useAuth';

export function TripApprovals() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<TripRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null); // Request ID being processed
  
  const [rejectModal, setRejectModal] = useState<{ open: boolean; requestId: string; requestNumber: string }>({
    open: false,
    requestId: '',
    requestNumber: '',
  });
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await getPendingDepartmentApprovals();
      setRequests(data);
    } catch (err) {
      console.error('Error loading approvals:', err);
      setError('Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: TripRequest) => {
    try {
      setProcessing(request.id);
      setError(null);

      await approveTripRequest({
        id: request.id,
        approval_comments: 'Approved',
      });

      setSuccess(`Trip ${request.request_number} approved successfully!`);
      await loadRequests();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error approving request:', err);
      setError(err.message || 'Failed to approve request');
    } finally {
      setProcessing(null);
    }
  };

  const openRejectModal = (request: TripRequest) => {
    setRejectModal({
      open: true,
      requestId: request.id,
      requestNumber: request.request_number,
    });
    setRejectionReason('');
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection');
      return;
    }

    try {
      setProcessing(rejectModal.requestId);
      setError(null);

      await rejectTripRequest({
        id: rejectModal.requestId,
        rejection_reason: rejectionReason,
      });

      setSuccess(`Trip ${rejectModal.requestNumber} rejected.`);
      setRejectModal({ open: false, requestId: '', requestNumber: '' });
      setRejectionReason('');
      await loadRequests();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Error rejecting request:', err);
      setError(err.message || 'Failed to reject request');
    } finally {
      setProcessing(null);
    }
  };

  const canApprove = profile?.role === 'hod' || profile?.role === 'fleet_manager' || profile?.role === 'super_admin' || profile?.role === 'hr_admin';

  if (!canApprove) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <div className="admin-main">
          <div className="unauthorized">
            <h2>Access Denied</h2>
            <p>You don't have permission to approve trip requests.</p>
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
          <h1 className="page-title">Trip Request Approvals</h1>
          <NotificationBell />
        </div>
        <div className="page-header">
          <div className="header-content">
            <p className="page-subtitle">
              {profile?.role === 'hod' 
                ? 'Review and approve trip requests from your department'
                : 'Review and approve all pending trip requests'}
            </p>
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
              <p>Loading pending approvals...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✅</div>
              <h3>All caught up!</h3>
              <p>No trip requests pending your approval</p>
            </div>
          ) : (
            <div className="approval-list">
              {requests.map((request) => (
                <div key={request.id} className="approval-card">
                  <div className="approval-header">
                    <span className="request-number">{request.request_number}</span>
                    <span className="badge badge-warning">⏳ Pending</span>
                  </div>
                  
                  <div className="approval-body">
                    <div className="requester-info">
                      <span className="requester-name">
                        👤 {(request.requester_profile as any)?.full_name || 'Unknown'}
                      </span>
                      <span className="requester-dept">
                        🏢 {(request.department as any)?.name || 'Unknown Department'}
                      </span>
                    </div>

                    <div className="route-info">
                      {(() => {
                        const fromMatch = request.destination?.match(/From:\s*(.+?)\s*\|/i);
                        const toMatch = request.destination?.match(/To:\s*(.+)$/i);
                        const from = fromMatch?.[1]?.trim();
                        const to = toMatch?.[1]?.trim() ?? request.destination;
                        return from ? (
                          <>
                            <div className="route-point">
                              <span className="point-icon">📍</span>
                              <span className="point-value">{from}</span>
                            </div>
                            <div className="route-arrow">↓</div>
                            <div className="route-point">
                              <span className="point-icon">🎯</span>
                              <span className="point-value">{to}</span>
                            </div>
                          </>
                        ) : (
                          <div className="route-point">
                            <span className="point-icon">🎯</span>
                            <span className="point-value">{to}</span>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="trip-details">
                      <div className="detail-item">
                        <span className="detail-icon">📅</span>
                        <span>{new Date(request.start_datetime).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-icon">⏰</span>
                        <span>
                          {new Date(request.start_datetime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
                          {' - '}
                          {new Date(request.end_datetime).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-icon">👥</span>
                        <span>{request.passenger_count} passengers</span>
                      </div>
                    </div>

                    <div className="purpose-section">
                      <strong>Purpose:</strong>
                      <p>{request.purpose}</p>
                    </div>

                    {request.passengers && request.passengers.length > 0 && (
                      <div className="passengers-section">
                        <strong>Passengers:</strong>
                        <ul>
                          {request.passengers.map((p, i) => (
                            <li key={i}>{typeof p === 'string' ? p : p.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {request.vehicle_requirements && (
                      <div className="notes-section">
                        <strong>Special Requirements:</strong>
                        <p>{request.vehicle_requirements}</p>
                      </div>
                    )}
                  </div>

                  <div className="approval-footer">
                    <span className="submitted-date">
                      Submitted: {new Date(request.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="approval-actions">
                      <button
                        className="btn btn-danger"
                        onClick={() => openRejectModal(request)}
                        disabled={processing === request.id}
                      >
                        ❌ Reject
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(request)}
                        disabled={processing === request.id}
                      >
                        {processing === request.id ? 'Processing...' : '✅ Approve'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Rejection Modal */}
          {rejectModal.open && (
            <div className="modal-overlay">
              <div className="modal">
                <div className="modal-header">
                  <h3>Reject Trip Request</h3>
                  <button 
                    className="modal-close"
                    onClick={() => setRejectModal({ open: false, requestId: '', requestNumber: '' })}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    You are rejecting trip request <strong>{rejectModal.requestNumber}</strong>.
                    Please provide a reason for the rejection.
                  </p>
                  <div className="form-group">
                    <label className="form-label required">Reason for Rejection</label>
                    <textarea
                      className="form-input"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Please explain why this request is being rejected..."
                      rows={4}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setRejectModal({ open: false, requestId: '', requestNumber: '' })}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleReject}
                    disabled={!rejectionReason.trim() || processing === rejectModal.requestId}
                  >
                    {processing === rejectModal.requestId ? 'Rejecting...' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

export default TripApprovals;
