import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getPendingRequestsForApproval, updateRequestStatus } from '../../services/leaveService';
import { generateLeaveReport } from '../../services/pdfService';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from '../admin/AdminSidebar';

// Types
interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  reviewer_comments?: string;
  document_url?: string;
  users_profile?: {
    first_name: string;
    last_name: string;
    employee_id: string;
    departments?: {
      name: string;
    };
  };
  leave_types?: {
    name: string;
    color_code?: string;
  };
}

interface Stats {
  pending: number;
  approvedToday: number;
  rejectedToday: number;
  totalDays: number;
}

type ModalAction = 'approved' | 'rejected' | '';

// Add CSS for animations
const animationStyle = document.createElement('style');
animationStyle.textContent = `
  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { 
      opacity: 0;
      transform: translateY(20px) scale(0.95); 
    }
    to { 
      opacity: 1;
      transform: translateY(0) scale(1); 
    }
  }
`;
if (!document.head.querySelector('[data-animation-style]')) {
  animationStyle.setAttribute('data-animation-style', 'true');
  document.head.appendChild(animationStyle);
}

export const Approvals: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0,
    totalDays: 0
  });
  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [modalAction, setModalAction] = useState<ModalAction>('');
  const [comments, setComments] = useState<string>('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    
    if (!['hod', 'hr_admin'].includes(profile?.role)) {
      navigate('/dashboard');
      return;
    }
    
    loadPendingRequests();
  }, [profile, navigate]);

  const loadPendingRequests = async (): Promise<void> => {
    if (!user?.id) return;
    
    setLoading(true);
    const { data, error } = await getPendingRequestsForApproval(user.id);
    
    if (error) {
      console.error('Error loading requests:', error);
      alert('Error loading pending requests: ' + error.message);
    }
    
    if (data) {
      setRequests(data as LeaveRequest[]);
      
      const today = new Date().toDateString();
      const pending = data.filter((r: LeaveRequest) => r.status === 'pending').length;
      const approvedToday = data.filter((r: LeaveRequest) => 
        r.status === 'approved' && r.reviewed_at && new Date(r.reviewed_at).toDateString() === today
      ).length;
      const rejectedToday = data.filter((r: LeaveRequest) => 
        r.status === 'rejected' && r.reviewed_at && new Date(r.reviewed_at).toDateString() === today
      ).length;
      const totalDays = data.reduce((sum: number, r: LeaveRequest) => sum + (r.total_days || 0), 0);
      
      setStats({ pending, approvedToday, rejectedToday, totalDays });
    } else {
      setRequests([]);
    }
    setLoading(false);
  };

  const openApprovalModal = (request: LeaveRequest, action: ModalAction): void => {
    setSelectedRequest(request);
    setModalAction(action);
    setComments('');
    setShowApprovalModal(true);
  };

  const handleApprovalAction = async (): Promise<void> => {
    if (!selectedRequest) return;
    if (modalAction === 'rejected' && !comments.trim()) return;

    setProcessingId(selectedRequest.id);

    const { error } = await updateRequestStatus(
      selectedRequest.id,
      modalAction,
      user.id,
      comments
    );

    if (error) {
      alert('Failed to update request: ' + error.message);
      setProcessingId(null);
    } else {
      await loadPendingRequests();
      setShowApprovalModal(false);
      setSelectedRequest(null);
      setComments('');
      setProcessingId(null);
    }
  };

  const handleGenerateReport = (): void => {
    if (!requests || requests.length === 0) {
      alert('No requests to export');
      return;
    }

    const summary = {
      totalRequests: requests.length,
      totalDays: requests.reduce((sum, r) => sum + (r.total_days || 0), 0),
      approvedRequests: requests.filter(r => r.status === 'approved').length,
      pendingRequests: requests.filter(r => r.status === 'pending').length,
      rejectedRequests: requests.filter(r => r.status === 'rejected').length
    };

    const filters = {
      department: profile?.department?.name || 'All Departments',
      status: 'All Statuses',
    };

    generateLeaveReport(requests, summary, filters, 'Approval Report');
  };

  const ApprovalModal: React.FC = () => {
    if (!showApprovalModal || !selectedRequest) return null;

    return (
      <div style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '3rem',
        animation: 'fadeIn 0.15s ease-out'
      }}>
        <div style={{ 
          backgroundColor: '#ffffff',
          borderRadius: '0px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          maxWidth: '700px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideUp 0.2s ease-out'
        }}>
          <div style={{
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            flex: 1
          }}>
            <style>{`div::-webkit-scrollbar { display: none; }`}</style>
            
            {/* Header */}
            <div style={{ 
              backgroundColor: modalAction === 'approved' ? '#d1fae5' : '#fecaca',
              borderBottom: `4px solid ${modalAction === 'approved' ? '#10b981' : '#ef4444'}`,
              padding: '1.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ 
                    fontSize: '2rem',
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: modalAction === 'approved' ? '#dcfce7' : '#fee2e2'
                  }}>
                    {modalAction === 'approved' ? '✓' : '✗'}
                  </div>
                  <div>
                    <h2 style={{ 
                      color: modalAction === 'approved' ? '#059669' : '#dc2626',
                      margin: 0,
                      fontSize: '1.5rem',
                      fontWeight: 'bold'
                    }}>
                      {modalAction === 'approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
                    </h2>
                    <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                      Review the details carefully before {modalAction === 'approved' ? 'approving' : 'rejecting'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    fontSize: '1.5rem', 
                    cursor: 'pointer',
                    color: '#6b7280'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '1.5rem' }}>
              {/* Employee Info */}
              <div style={{ 
                background: 'linear-gradient(to right, #dbeafe, #e0e7ff)',
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1rem',
                border: '2px solid #93c5fd'
              }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: '1rem' }}>
                  <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold'
                  }}>
                    {selectedRequest.users_profile?.first_name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 0.25rem 0' }}>
                      {selectedRequest.users_profile?.first_name} {selectedRequest.users_profile?.last_name}
                    </h3>
                    <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <span><strong>ID:</strong> {selectedRequest.users_profile?.employee_id}</span>
                      <span><strong>Department:</strong> {selectedRequest.users_profile?.departments?.name || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Leave Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ 
                  backgroundColor: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>LEAVE TYPE</div>
                  <div>{selectedRequest.leave_types?.name}</div>
                </div>

                <div style={{ 
                  backgroundColor: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>DURATION</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{selectedRequest.total_days} days</div>
                </div>

                <div style={{ 
                  backgroundColor: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>START DATE</div>
                  <div>{new Date(selectedRequest.start_date).toLocaleDateString('en-US', { 
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
                  })}</div>
                </div>

                <div style={{ 
                  backgroundColor: '#ffffff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  padding: '1rem'
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', marginBottom: '0.5rem' }}>END DATE</div>
                  <div>{new Date(selectedRequest.end_date).toLocaleDateString('en-US', { 
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
                  })}</div>
                </div>
              </div>

              {/* Reason */}
              <div style={{ 
                backgroundColor: '#fef3c7',
                border: '2px solid #fbbf24',
                borderRadius: '12px',
                padding: '1rem',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.5rem' }}>REASON FOR LEAVE</div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{selectedRequest.reason}</p>
              </div>

              {/* Comments */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {modalAction === 'approved' ? 'Comments (Optional)' : 'Rejection Reason'}
                  {modalAction === 'rejected' && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                </label>
                <textarea
                  value={comments}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setComments(e.target.value)}
                  rows={3}
                  placeholder={modalAction === 'approved' 
                    ? 'Add any additional comments or notes...' 
                    : 'Please provide a clear reason for rejection...'
                  }
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '10px',
                    fontSize: '0.95rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    minHeight: '80px',
                    maxHeight: '200px',
                    lineHeight: '1.5'
                  }}
                />
                {modalAction === 'rejected' && !comments.trim() && (
                  <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>⚠️ A rejection reason is required</p>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem' }}>
                <button
                  onClick={() => setShowApprovalModal(false)}
                  disabled={processingId}
                  style={{
                    padding: '0.75rem 2rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#374151',
                    backgroundColor: '#ffffff',
                    border: '2px solid #d1d5db',
                    borderRadius: '10px',
                    cursor: processingId ? 'not-allowed' : 'pointer',
                    opacity: processingId ? 0.5 : 1
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprovalAction}
                  disabled={processingId || (modalAction === 'rejected' && !comments.trim())}
                  style={{
                    padding: '0.75rem 2rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    color: '#ffffff',
                    backgroundColor: modalAction === 'approved' ? '#10b981' : '#ef4444',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: (processingId || (modalAction === 'rejected' && !comments.trim())) ? 'not-allowed' : 'pointer',
                    opacity: (processingId || (modalAction === 'rejected' && !comments.trim())) ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  {processingId ? (
                    <>
                      <svg style={{ animation: 'spin 1s linear infinite', height: '1rem', width: '1rem' }} viewBox="0 0 24 24">
                        <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    <>
                      {modalAction === 'approved' ? '✓ Approve Request' : '✗ Reject Request'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <>
        <div className="app">
          <div className="content">
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Loading pending approvals...</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app">
        <AdminSidebar />

        <div className="content" style={{ 
          padding: '2rem', 
          overflowY: 'auto', 
          height: '100vh' 
        }}>
          <div 
            className="page-header enhanced-header admin-header" 
            style={{ 
              marginBottom: '2rem', 
              border: '1px solid #e5e7eb', 
              borderRadius: '12px', 
              padding: '1.5rem', 
              marginLeft: '2rem', 
              marginRight: '2rem' 
            }}
          >
            <div className="header-content">
              <h1 className="page-title">
                <span className="title-icon">✓</span>
                Leave Approvals
              </h1>
              <p className="page-subtitle">Review and approve leave requests from your department</p>
            </div>
            <div className="page-actions enhanced-actions">
              <button
                onClick={() => navigate('/calendar')}
                className="btn btn-secondary action-btn"
              >
                <span className="btn-icon">📅</span>
                Team Calendar
              </button>
              <button
                onClick={() => loadPendingRequests()}
                className="btn btn-primary action-btn"
                disabled={loading}
              >
                <span className="btn-icon">🔄</span>
                Refresh
              </button>
              <button
                onClick={handleGenerateReport}
                className="btn btn-success action-btn"
                disabled={!requests || requests.length === 0}
              >
                <span className="btn-icon">📄</span>
                Generate Report
              </button>
            </div>
          </div>

          {/* Approval Statistics */}
          <div className="stats-grid admin-stats-grid" style={{ marginBottom: '2rem', gap: '1.5rem', marginLeft: '2rem', marginRight: '2rem' }}>
            <div className="stats-card admin-stats-card" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <div className="stats-content">
                <div className="stats-icon stats-icon-warning">⏳</div>
                <div className="stats-details">
                  <h3 className="stats-title">Pending Approvals</h3>
                  <p className="stats-value">{stats.pending}</p>
                  <p className="stats-change">
                    <span className="stats-change-neutral">Requires your action</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="stats-card admin-stats-card" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <div className="stats-content">
                <div className="stats-icon stats-icon-success">✅</div>
                <div className="stats-details">
                  <h3 className="stats-title">Approved Today</h3>
                  <p className="stats-value">{stats.approvedToday}</p>
                  <p className="stats-change">
                    <span className="stats-change-positive">Completed</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="stats-card admin-stats-card" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <div className="stats-content">
                <div className="stats-icon stats-icon-danger">❌</div>
                <div className="stats-details">
                  <h3 className="stats-title">Rejected Today</h3>
                  <p className="stats-value">{stats.rejectedToday}</p>
                  <p className="stats-change">
                    <span className="stats-change-negative">Declined</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="stats-card admin-stats-card" style={{ border: '1px solid #e5e7eb', borderRadius: '12px' }}>
              <div className="stats-content">
                <div className="stats-icon stats-icon-info">📊</div>
                <div className="stats-details">
                  <h3 className="stats-title">Total Days Requested</h3>
                  <p className="stats-value">{stats.totalDays}</p>
                  <p className="stats-change">
                    <span className="stats-change-neutral">All pending requests</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Requests List */}
          <div className="card admin-card" style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', marginLeft: '2rem', marginRight: '2rem' }}>
            <div className="card-header">
              <h2 className="card-title">Pending Leave Requests</h2>
              <p className="card-subtitle">
                {requests.length} {requests.length === 1 ? 'request' : 'requests'} awaiting review
              </p>
            </div>
            
            <div className="card-content">
              {requests.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">✓</div>
                  <h3 className="empty-state-title">All caught up!</h3>
                  <p className="empty-state-description">
                    There are no pending leave requests at this time.
                  </p>
                </div>
              ) : (
                <div className="data-table">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Leave Type</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Days</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((request) => (
                        <tr key={request.id}>
                          <td>
                            <div className="employee-cell">
                              <div className="employee-avatar">
                                {request.users_profile?.first_name?.charAt(0) || 'U'}
                              </div>
                              <div>
                                <div className="employee-name">
                                  {request.users_profile?.first_name} {request.users_profile?.last_name}
                                </div>
                                <div className="employee-id">{request.users_profile?.employee_id}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-primary">
                              {request.leave_types?.name}
                            </span>
                          </td>
                          <td>
                            <div className="date-cell">
                              <div className="date-primary">
                                {new Date(request.start_date).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </div>
                              <div className="date-secondary">
                                {new Date(request.start_date).toLocaleDateString('en-US', { 
                                  year: 'numeric' 
                                })}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="date-cell">
                              <div className="date-primary">
                                {new Date(request.end_date).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </div>
                              <div className="date-secondary">
                                {new Date(request.end_date).toLocaleDateString('en-US', { 
                                  year: 'numeric' 
                                })}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="days-badge">{request.total_days}</span>
                          </td>
                          <td>
                            <div className="date-cell">
                              <div className="date-primary">
                                {new Date(request.created_at).toLocaleDateString('en-US', { 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </div>
                              <div className="date-secondary">
                                {new Date(request.created_at).toLocaleDateString('en-US', { 
                                  year: 'numeric' 
                                })}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="action-buttons">
                              <button
                                onClick={() => openApprovalModal(request, 'approved')}
                                className="btn btn-sm btn-success"
                                title="Approve Request"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => openApprovalModal(request, 'rejected')}
                                className="btn btn-sm btn-danger"
                                title="Reject Request"
                              >
                                ✗ Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <ApprovalModal />
        </div>
      </div>
    </>
  );
};

export default Approvals;