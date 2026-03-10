import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { 
  getPendingRequestsForApproval, 
  getRequestsForHRApproval,
  approveAsHOD,
  approveAsHR,
  rejectLeaveRequest
} from '../../services/leaveService';
import { generateLeaveReport } from '../../services/pdfService';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from '../admin/AdminSidebar';
import { formatEmployeeId } from '../../utils/formatters';

export const Approvals = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [modalAction, setModalAction] = useState(null);
  const [comments, setComments] = useState('');
  const [stats, setStats] = useState({
    pending: 0,
    hodApproved: 0,
    approvedToday: 0,
    rejectedToday: 0,
    totalDays: 0
  });

  const textareaRef = useRef(null);

  // Memoize the onChange handler to prevent recreation on each render
  const handleCommentsChange = useCallback((e) => {
    setComments(e.target.value);
  }, []);

  // Focus textarea when modal opens
  useEffect(() => {
    if (showApprovalModal && textareaRef.current) {
      // Small delay to ensure modal is rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [showApprovalModal]);

  useEffect(() => {
    // Check if user is HOD, HR Admin, or Super Admin
    if (profile?.role !== 'hod' && profile?.role !== 'hr_admin' && profile?.role !== 'super_admin') {
      navigate('/dashboard');
      return;
    }
    loadPendingRequests();
  }, [profile]);

  const loadPendingRequests = async () => {
    if (!user?.id || !profile) {
      console.log('No user ID or profile, cannot load requests');
      return;
    }

    setLoading(true);
    
    console.log('=== APPROVALS DEBUG ===');
    console.log('Loading requests for user:', { 
      userId: user.id, 
      email: user.email,
      profileRole: profile.role,
      departmentId: profile.department_id,
      isHR: profile.role === 'hr_admin' || profile.role === 'super_admin'
    });
    
    // HOD sees only pending requests from their department
    // HR sees both pending AND hod_approved requests from all departments
    const isHRorAdmin = profile.role === 'hr_admin' || profile.role === 'super_admin';
    console.log('Will use HR query:', isHRorAdmin);
    
    const { data, error } = isHRorAdmin
      ? await getRequestsForHRApproval()
      : await getPendingRequestsForApproval(user.id, profile.department_id);
    
    console.log('Loaded requests:', { count: data?.length || 0, requests: data, error });
    console.log('=== END DEBUG ===');
    
    if (error) {
      console.error('Get pending requests error:', error);
    }
    
    if (data) {
      setRequests(data);
      
      // Calculate stats
      const today = new Date().toDateString();
      const pending = data.filter(r => r.status === 'pending').length;
      const hodApproved = data.filter(r => r.status === 'hod_approved').length;
      const approvedToday = data.filter(r => 
        r.status === 'approved' && r.hr_approved_at && new Date(r.hr_approved_at).toDateString() === today
      ).length;
      const rejectedToday = data.filter(r => 
        r.status === 'rejected' && (r.hod_approved_at || r.hr_approved_at) && 
        new Date(r.hod_approved_at || r.hr_approved_at || '').toDateString() === today
      ).length;
      const totalDays = data.reduce((sum, r) => sum + (r.total_days || 0), 0);
      
      setStats({ pending, hodApproved, approvedToday, rejectedToday, totalDays });
    }
    setLoading(false);
  };

  const openApprovalModal = (request, action) => {
    setSelectedRequest(request);
    setModalAction(action);
    setComments('');
    setShowApprovalModal(true);
  };

  const handleApprovalAction = async () => {
    if (!selectedRequest || !modalAction || !profile?.id) {
      console.error('Missing required data:', { selectedRequest, modalAction, profileId: profile?.id });
      return;
    }

    if (modalAction === 'rejected' && !comments.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setProcessingId(selectedRequest.id);
    console.log('Processing approval action:', { 
      requestId: selectedRequest.id, 
      action: modalAction, 
      role: profile.role,
      comments 
    });

    try {
      let result;
      
      // Handle approval based on role and action
      if (modalAction === 'approved') {
        if (profile.role === 'hod') {
          // HOD approves to 'hod_approved' status
          result = await approveAsHOD(selectedRequest.id, profile.id, comments);
        } else if (profile.role === 'hr_admin' || profile.role === 'super_admin') {
          // HR gives final approval to 'approved' status
          result = await approveAsHR(selectedRequest.id, profile.id, comments);
        }
      } else if (modalAction === 'rejected') {
        // Rejection can be done by either HOD or HR
        const role = profile.role === 'hod' ? 'hod' : 'hr_admin';
        result = await rejectLeaveRequest(selectedRequest.id, profile.id, comments, role);
      }

      if (result?.error) {
        console.error('Approval action error:', result.error);
        alert('Failed to update request: ' + result.error.message);
      } else {
        console.log('Approval action successful');
        // Trigger refresh event for other components
        window.dispatchEvent(new CustomEvent('leaveRequestUpdated', { 
          detail: { requestId: selectedRequest.id, action: modalAction } 
        }));
        
        // Refresh the list
        await loadPendingRequests();
        setShowApprovalModal(false);
        setSelectedRequest(null);
        setComments('');
      }
    } catch (err) {
      console.error('Unexpected error during approval action:', err);
      alert('An unexpected error occurred. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleGenerateReport = () => {
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
      year: new Date().getFullYear()
    };

    generateLeaveReport(requests, filters, summary);
  };

  const handleDownloadDocument = async (documentUrl) => {
    if (!documentUrl) return;

    try {
      const urlParts = documentUrl.split('/leave-documents/');
      if (urlParts.length < 2) {
        throw new Error('Invalid document URL');
      }
      const filePath = urlParts[1];

      const { data, error } = await supabase.storage
        .from('leave-documents')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filePath.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download document: ' + error.message);
    }
  };

  const approvalModalContent = useMemo(() => {
    if (!showApprovalModal || !selectedRequest) return null;

    return (
      <div 
        className="modal-overlay" 
        onClick={(e) => {
          // Only close if clicking the overlay itself, not the modal content
          if (e.target === e.currentTarget) {
            setShowApprovalModal(false);
          }
        }}
        style={{ 
          position: 'fixed', 
          inset: 0, 
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.75)',
          pointerEvents: 'auto'
        }}
      >
        <div 
          className="content" 
          onClick={(e) => e.stopPropagation()}
          key={`modal-${selectedRequest?.id}`}
          style={{ 
            maxWidth: '900px', 
            width: '100%',
            maxHeight: '95vh',
            margin: 'auto',
            background: 'white',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            pointerEvents: 'auto',
            userSelect: 'text'
          }}
        >
          {/* Header with colored strip */}
          <div className="page-header enhanced-header" style={{
            background: modalAction === 'approved' 
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            borderBottom: '3px solid rgba(255,255,255,0.3)',
            marginBottom: 0
          }}>
            <div className="header-content">
              <h1 className="page-title" style={{ color: 'white', margin: 0 }}>
                <span className="title-icon">
                  {modalAction === 'approved' ? '✓' : '✕'}
                </span>
                {modalAction === 'approved' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h1>
              <p className="page-subtitle" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Review the details and {modalAction === 'approved' ? 'confirm approval' : 'provide rejection reason'}
              </p>
            </div>
            <button
              onClick={() => setShowApprovalModal(false)}
              className="btn btn-secondary"
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white' }}
            >
              <span className="btn-icon">✕</span>
              Close
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '2rem', overflowY: 'auto', flex: 1, pointerEvents: 'auto', userSelect: 'text' }}>
            {/* Employee Info Card */}
            <div className="card mb-6">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="title-icon">👤</span>
                  Employee Information
                </h3>
              </div>
              <div className="card-body">
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Full Name</span>
                    <span className="info-value">
                      {selectedRequest.users_profile?.first_name} {selectedRequest.users_profile?.last_name}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Employee ID</span>
                    <span className="info-value">{formatEmployeeId(selectedRequest.users_profile?.employee_id)}</span>
                  </div>
                  {selectedRequest.users_profile?.department?.name && (
                    <div className="info-item">
                      <span className="info-label">Department</span>
                      <span className="info-value">{selectedRequest.users_profile.department.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Details Card */}
            <div className="card mb-6">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="title-icon">📋</span>
                  Leave Request Details
                </h3>
              </div>
              <div className="card-body">
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div className="stats-card">
                    <div className="stats-content">
                      <div className="stats-icon stats-icon-primary">📅</div>
                      <div className="stats-details">
                        <h3 className="stats-title">Leave Type</h3>
                        <p className="stats-value" style={{ fontSize: '1.25rem' }}>{selectedRequest.leave_types?.name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="stats-card">
                    <div className="stats-content">
                      <div className="stats-icon stats-icon-success">⏱️</div>
                      <div className="stats-details">
                        <h3 className="stats-title">Duration</h3>
                        <p className="stats-value" style={{ fontSize: '1.25rem' }}>{selectedRequest.total_days} days</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="info-grid mt-4">
                  <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                    <span className="info-label">Leave Period</span>
                    <span className="info-value">
                      {new Date(selectedRequest.start_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} 
                      {' → '}
                      {new Date(selectedRequest.end_date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Reason Card */}
            <div className="card mb-6">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="title-icon">💬</span>
                  Reason for Leave
                </h3>
              </div>
              <div className="card-body">
                <p style={{ color: '#4b5563', lineHeight: '1.6' }}>{selectedRequest.reason}</p>
              </div>
            </div>

            {/* Supporting Document */}
            {selectedRequest.document_url && (
              <div className="card mb-6">
                <div className="card-header">
                  <h3 className="card-title">
                    <span className="title-icon">📎</span>
                    Supporting Document
                  </h3>
                </div>
                <div className="card-body">
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Click to view or download the attached document</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <a 
                        href={selectedRequest.document_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                      >
                        <span className="btn-icon">👁️</span>
                        View
                      </a>
                      <button
                        onClick={() => handleDownloadDocument(selectedRequest.document_url)}
                        className="btn btn-primary"
                      >
                        <span className="btn-icon">⬇️</span>
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Comments Section */}
            <div className="card mb-6">
              <div className="card-header">
                <h3 className="card-title">
                  <span className="title-icon">✍️</span>
                  {modalAction === 'approved' ? 'Approval Comments (Optional)' : 'Rejection Reason'}
                  {modalAction === 'rejected' && <span style={{ color: '#ef4444', marginLeft: '0.25rem' }}>*</span>}
                </h3>
              </div>
              <div className="card-body" style={{ pointerEvents: 'auto' }}>
                <textarea
                  ref={textareaRef}
                  key="approval-comments"
                  value={comments}
                  onChange={handleCommentsChange}
                  rows="4"
                  placeholder={modalAction === 'approved' ? 'Add any comments about this approval...' : 'Please provide a clear reason for rejecting this request...'}
                  disabled={processingId}
                  style={{ 
                    width: '100%',
                    resize: 'vertical',
                    minHeight: '100px',
                    padding: '0.75rem',
                    fontSize: '1rem',
                    lineHeight: '1.5',
                    borderRadius: '8px',
                    border: `2px solid ${modalAction === 'rejected' ? '#ef4444' : '#d1d5db'}`,
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    pointerEvents: 'auto !important',
                    cursor: 'text !important',
                    userSelect: 'text !important',
                    WebkitUserSelect: 'text !important',
                    MozUserSelect: 'text !important',
                    msUserSelect: 'text !important',
                    backgroundColor: 'white',
                    color: '#1f2937',
                    fontFamily: 'inherit',
                    zIndex: 10
                  }}
                  onFocus={(e) => e.target.style.borderColor = modalAction === 'rejected' ? '#dc2626' : '#3b82f6'}
                  onBlur={(e) => e.target.style.borderColor = modalAction === 'rejected' ? '#ef4444' : '#d1d5db'}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                {modalAction === 'rejected' && !comments && (
                  <p style={{ color: '#ef4444', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    ⚠️ A rejection reason is required to proceed
                  </p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="page-actions" style={{ justifyContent: 'flex-end', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '2px solid #e5e7eb' }}>
              <button
                onClick={() => setShowApprovalModal(false)}
                disabled={processingId}
                className="btn btn-secondary"
              >
                <span className="btn-icon">✕</span>
                Cancel
              </button>
              <button
                onClick={handleApprovalAction}
                disabled={processingId || (modalAction === 'rejected' && !comments.trim())}
                className={`btn ${modalAction === 'approved' ? 'btn-success' : 'btn-danger'}`}
                title={modalAction === 'rejected' && !comments.trim() ? 'Please provide a rejection reason' : ''}
                style={{
                  background: modalAction === 'approved' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: 'white',
                  border: 'none',
                  opacity: (processingId || (modalAction === 'rejected' && !comments.trim())) ? 0.5 : 1,
                  cursor: (processingId || (modalAction === 'rejected' && !comments.trim())) ? 'not-allowed' : 'pointer'
                }}
              >
                {processingId ? (
                  <>
                    <span className="btn-icon">⏳</span>
                    Processing...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">{modalAction === 'approved' ? '✓' : '✕'}</span>
                    {modalAction === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [showApprovalModal, selectedRequest, modalAction, processingId, comments, handleCommentsChange]);

  if (loading) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading pending approvals...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <AdminSidebar />

      <div className="content">
        <div className="page-header enhanced-header admin-header">
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
        <div className="stats-grid admin-stats-grid mb-8">
          <div className="stats-card admin-stats-card">
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

          <div className="stats-card admin-stats-card">
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

          <div className="stats-card admin-stats-card">
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

          <div className="stats-card admin-stats-card">
            <div className="stats-content">
              <div className="stats-icon stats-icon-primary">📊</div>
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
        <div className="card admin-card">
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
                              <div className="employee-id">{formatEmployeeId(request.users_profile?.employee_id)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="badge badge-primary">
                              {request.leave_types?.name}
                            </span>
                            {request.document_url && (
                              <span className="text-blue-500" title="Has supporting document">
                                📎
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{new Date(request.start_date).toLocaleDateString()}</td>
                        <td>{new Date(request.end_date).toLocaleDateString()}</td>
                        <td>
                          <span className="font-semibold">{request.total_days}</span>
                        </td>
                        <td className="text-gray-600 text-sm">
                          <div>
                            {new Date(request.created_at).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                            {new Date(request.created_at).toLocaleTimeString('en-US', { 
                              hour: '2-digit', 
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td>
                          <div className="action-buttons" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
                            <button
                              onClick={() => openApprovalModal(request, 'approved')}
                              disabled={processingId === request.id}
                              className="btn btn-sm btn-success"
                              title="Approve Request"
                              style={{ 
                                padding: '0.5rem 1rem',
                                fontSize: '0.875rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => openApprovalModal(request, 'rejected')}
                              disabled={processingId === request.id}
                              className="btn btn-sm btn-danger"
                              title="Reject Request"
                              style={{ 
                                padding: '0.5rem 1rem',
                                fontSize: '0.875rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
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
      </div>

      {approvalModalContent}
    </div>
  );
};

export default Approvals;
