import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getLeaveRequests, cancelLeaveRequest } from '../../services/leaveService';
import { generateLeaveCertificate } from '../../services/pdfService';
import { supabase } from '../../lib/supabaseClient';
import type { LeaveRequest, LeaveRequestStatus } from '../../types';

export const LeaveHistory = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LeaveRequestStatus | 'all'>('all');
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadRequests();
    }
  }, [user?.id, filterStatus, filterYear]);

  const loadRequests = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const filters: { status?: LeaveRequestStatus; year?: number } = {};
      if (filterStatus !== 'all') filters.status = filterStatus;
      if (filterYear) filters.year = filterYear;

      const { data, error } = await getLeaveRequests(user.id, filters);
      
      if (error) {
        console.error('Error loading requests:', error);
      } else if (data) {
        setRequests(data);
      }
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this leave request?')) return;

    setCancellingId(requestId);
    const { error } = await cancelLeaveRequest(requestId);

    if (error) {
      alert('Failed to cancel request: ' + error.message);
    } else {
      // Refresh the list
      await loadRequests();
    }
    setCancellingId(null);
  };

  const handleDownloadDocument = async (documentUrl: string) => {
    if (!documentUrl) return;

    try {
      // Extract the file path from the full URL
      // URL format: https://{project}.supabase.co/storage/v1/object/public/leave-documents/{path}
      const urlParts = documentUrl.split('/leave-documents/');
      if (urlParts.length < 2) {
        throw new Error('Invalid document URL');
      }
      const filePath = urlParts[1];

      // Download the file using Supabase Storage
      const { data, error } = await supabase.storage
        .from('leave-documents')
        .download(filePath);

      if (error) throw error;

      // Create a download link
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filePath.split('/').pop() || 'document'; // Get filename from path
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download document: ' + (error as Error).message);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: 'status-badge status-pending',
      hod_approved: 'status-badge status-info',
      approved: 'status-badge status-approved',
      rejected: 'status-badge status-rejected',
      cancelled: 'status-badge status-cancelled'
    };
    return badges[status] || 'status-badge';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pending HOD',
      hod_approved: 'HOD Approved',
      approved: 'Approved',
      rejected: 'Rejected',
      cancelled: 'Cancelled'
    };
    return labels[status] || status;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    // Add timezone offset to get correct local date
    const userTimezoneOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() + userTimezoneOffset);
    return localDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const canCancel = (request: LeaveRequest) => {
    return request.status === 'pending' && new Date(request.start_date) > new Date();
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="app">
      {/* Enhanced Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">FKF HR</h1>
          <p className="sidebar-subtitle">Leave Management System</p>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-item">
            <button 
              onClick={() => navigate('/dashboard')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">🏠</span>
              Dashboard
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/request-leave')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📝</span>
              Request Leave
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/leave-history')}
              className="nav-link nav-link-active w-full text-left"
            >
              <span className="nav-icon">📊</span>
              Leave History
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/documents')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📄</span>
              My Documents
            </button>
          </div>
          {user?.user_metadata?.role === 'hod' && (
            <div className="nav-item">
              <button 
                onClick={() => navigate('/approvals')}
                className="nav-link nav-link-inactive w-full text-left"
              >
                <span className="nav-icon">✓</span>
                Approvals
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {profile?.first_name?.charAt(0)?.toUpperCase() || ''}{profile?.last_name?.charAt(0)?.toUpperCase() || ''}
            </div>
            <div className="user-info">
              <div className="user-name">
                {profile?.first_name} {profile?.last_name}
              </div>
              <div className="user-role">
                {profile?.role === 'super_admin' ? 'SUPER ADMIN' : 
                 profile?.role === 'hr_admin' ? 'HR ADMIN' :
                 profile?.role === 'hod' ? 'HEAD OF DEPARTMENT' :
                 'EMPLOYEE'}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="btn btn-outline mt-3 w-full sign-out-btn"
          >
            <span className="nav-icon">🚪</span>
            Sign Out
          </button>
        </div>
      </div>

      <div className="content">
        <div className="page-header enhanced-header">
          <div className="header-content">
            <h1 className="page-title">
              <span className="title-icon">📊</span>
              Leave History
            </h1>
            <p className="page-subtitle">View and manage your leave requests</p>
          </div>
          <div className="page-actions enhanced-actions">
            <button
              onClick={() => navigate('/request-leave')}
              className="btn btn-success action-btn"
            >
              <span className="btn-icon">+</span>
              New Request
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary action-btn"
            >
              <span className="btn-icon">🏠</span>
              Dashboard
            </button>
          </div>
        </div>
        {/* Enhanced Filters */}
        <div className="card mb-6 filters-card">
          <div className="card-header filter-header">
            <h3 className="card-title">
              <span className="filter-icon">🔍</span>
              Filters
            </h3>
          </div>
          <div className="filter-grid">
            <div className="form-group enhanced-form-group">
              <label className="form-label">
                <span className="label-icon">🏷️</span>
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as LeaveRequestStatus | 'all')}
                className="form-select enhanced-select"
              >
                <option value="all">All Statuses</option>
                <option value="pending">⏳ Pending HOD</option>
                <option value="hod_approved">📋 HOD Approved</option>
                <option value="approved">✅ Approved</option>
                <option value="rejected">❌ Rejected</option>
                <option value="cancelled">🚫 Cancelled</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(parseInt(e.target.value))}
                className="form-select"
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Requests List */}
        <div className="card">
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading leave requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3 className="empty-title">No Leave Requests Found</h3>
              <p className="empty-description">
                {filterStatus !== 'all' || filterYear !== new Date().getFullYear() 
                  ? 'No requests match your current filters. Try adjusting the filters above.'
                  : "You haven't submitted any leave requests yet."
                }
              </p>
              <div className="empty-actions">
                <button
                  onClick={() => navigate('/request-leave')}
                  className="btn btn-primary"
                >
                  Submit Your First Request
                </button>
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Leave Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="clickable-row" onClick={() => setSelectedRequest(selectedRequest?.id === request.id ? null : request)}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {request.leave_types?.name}
                          </span>
                          {request.document_url && (
                            <span className="text-blue-500" title="Has supporting document">
                              📎
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="text-sm">
                          <div className="font-medium">{formatDate(request.start_date)}</div>
                          <div className="text-muted">to {formatDate(request.end_date)}</div>
                        </div>
                      </td>
                      <td>
                        <span className="font-semibold">{request.total_days}</span>
                      </td>
                      <td>
                        <span className={getStatusBadge(request.status)}>
                          {getStatusLabel(request.status)}
                        </span>
                      </td>
                      <td>
                        <div className="text-sm text-muted">
                          {formatDate(request.created_at)}
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRequest(selectedRequest?.id === request.id ? null : request);
                            }}
                            className="btn btn-sm btn-outline"
                          >
                            View
                          </button>
                          {request.status === 'approved' && profile && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                generateLeaveCertificate(request, profile);
                              }}
                              className="btn btn-sm btn-success"
                            >
                              📄 Download Certificate
                            </button>
                          )}
                          {canCancel(request) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCancelRequest(request.id);
                              }}
                              disabled={cancellingId === request.id}
                              className="btn btn-sm btn-danger"
                            >
                              {cancellingId === request.id ? (
                                <>
                                  <span className="loading-spinner mr-1"></span>
                                  Cancelling...
                                </>
                              ) : (
                                'Cancel'
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Request Details Modal */}
        {selectedRequest && (
          <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Leave Request Details</h3>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-content">
                <div className="request-details">
                  <div className="detail-row">
                    <span className="detail-label">Leave Type:</span>
                    <span className="detail-value">{selectedRequest.leave_types?.name}</span>
                  </div>
                  
                  <div className="detail-row">
                    <span className="detail-label">Duration:</span>
                    <span className="detail-value">
                      {formatDate(selectedRequest.start_date)} to {formatDate(selectedRequest.end_date)}
                    </span>
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">Working Days:</span>
                    <span className="detail-value font-semibold">{selectedRequest.total_days} days</span>
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">Status:</span>
                    <span className={getStatusBadge(selectedRequest.status)}>
                      {getStatusLabel(selectedRequest.status)}
                    </span>
                  </div>

                  <div className="detail-row">
                    <span className="detail-label">Submitted:</span>
                    <span className="detail-value">{formatDate(selectedRequest.created_at)}</span>
                  </div>

                  {selectedRequest.reason && (
                    <div className="detail-row">
                      <span className="detail-label">Reason:</span>
                      <span className="detail-value">{selectedRequest.reason}</span>
                    </div>
                  )}

                  {selectedRequest.reviewed_by_user && (
                    <div className="detail-row">
                      <span className="detail-label">Reviewed By:</span>
                      <span className="detail-value">
                        {selectedRequest.reviewed_by_user.first_name} {selectedRequest.reviewed_by_user.last_name}
                      </span>
                    </div>
                  )}

                  {selectedRequest.reviewed_at && (
                    <div className="detail-row">
                      <span className="detail-label">Reviewed Date:</span>
                      <span className="detail-value">{formatDate(selectedRequest.reviewed_at)}</span>
                    </div>
                  )}

                  {selectedRequest.rejection_reason && (
                    <div className="detail-row">
                      <span className="detail-label">Rejection Reason:</span>
                      <span className="detail-value text-danger">{selectedRequest.rejection_reason}</span>
                    </div>
                  )}

                  {selectedRequest.document_url && (
                    <div className="detail-row">
                      <span className="detail-label">Supporting Document:</span>
                      <div className="detail-value flex gap-2">
                        <a 
                          href={selectedRequest.document_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline"
                        >
                          👁️ View
                        </a>
                        <button
                          onClick={() => handleDownloadDocument(selectedRequest.document_url!)}
                          className="btn btn-sm btn-primary"
                        >
                          📥 Download
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                {canCancel(selectedRequest) && (
                  <button
                    onClick={() => {
                      handleCancelRequest(selectedRequest.id);
                      setSelectedRequest(null);
                    }}
                    disabled={cancellingId === selectedRequest.id}
                    className="btn btn-danger"
                  >
                    {cancellingId === selectedRequest.id ? (
                      <>
                        <span className="loading-spinner mr-2"></span>
                        Cancelling...
                      </>
                    ) : (
                      'Cancel Request'
                    )}
                  </button>
                )}
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
