import { useState, useEffect, ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  getLeaveTypes,
  getLeaveBalances,
  getPublicHolidays,
  calculateWorkingDays,
  submitLeaveRequest,
  uploadDocument,
} from '../../services/leaveService';
import type { LeaveType, LeaveBalance, PublicHoliday } from '../../types';

interface FormData {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  coverPerson: string;
  document: File | null;
}

export const LeaveRequestForm = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    reason: '',
    coverPerson: '',
    document: null,
  });

  const [calculatedDays, setCalculatedDays] = useState(0);
  const [availableBalance, setAvailableBalance] = useState<LeaveBalance | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileError, setFileError] = useState('');

  // Load initial data - simplified without memoization
  useEffect(() => {
    if (user?.id) {
      loadInitialData();
    }
  }, [user?.id]);

  const loadInitialData = async () => {
    if (!user?.id) {
      console.error('Cannot load initial data: user.id is not available', { user, profile });
      return;
    }
    
    console.log('Loading initial data for user:', user.id);
    
    try {
      const [typesResult, balancesResult, holidaysResult] = await Promise.all([
        getLeaveTypes(),
        getLeaveBalances(user.id),
        getPublicHolidays(),
      ]);

      if (typesResult.data) setLeaveTypes(typesResult.data);
      if (balancesResult.data) setBalances(balancesResult.data);
      if (holidaysResult.data) setPublicHolidays(holidaysResult.data);
    } catch (error) {
      console.error('Error loading initial data:', error);
      setError('Failed to load initial data. Please refresh the page.');
    }
  };

  // Update available balance when leave type changes
  useEffect(() => {
    if (formData.leaveTypeId && balances.length > 0) {
      const balance = balances.find(b => b.leave_type_id === formData.leaveTypeId);
      setAvailableBalance(balance || null);
    } else {
      setAvailableBalance(null);
    }
  }, [formData.leaveTypeId, balances]);

  // Calculate working days when dates change - simplified
  useEffect(() => {
    if (formData.startDate && formData.endDate && publicHolidays.length > 0) {
      calculateWorkingDaysAsync();
    } else if (formData.startDate && formData.endDate) {
      // Simple calculation if no holidays loaded yet
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const timeDiff = end.getTime() - start.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
      setCalculatedDays(daysDiff);
    } else {
      setCalculatedDays(0);
    }
  }, [formData.startDate, formData.endDate, publicHolidays]);

  const calculateWorkingDaysAsync = async () => {
    try {
      const result = await calculateWorkingDays(
        formData.startDate,
        formData.endDate,
        publicHolidays
      );
      setCalculatedDays(result);
    } catch (error) {
      console.error('Error calculating working days:', error);
      // Fallback to simple calculation
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const timeDiff = end.getTime() - start.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
      setCalculatedDays(daysDiff);
    }
  };

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');
    
    if (!file) {
      setFormData(prev => ({ ...prev, document: null }));
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      setFileError('File size must be less than 5MB');
      e.target.value = '';
      return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 
                          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      setFileError('Only PDF, JPG, PNG, DOC, and DOCX files are allowed');
      e.target.value = '';
      return;
    }

    setFormData(prev => ({ ...prev, document: file }));
  };

  const handleNext = () => {
    // Validate current step before proceeding
    if (step === 1 && !formData.leaveTypeId) {
      setError('Please select a leave type');
      return;
    }
    if (step === 2) {
      if (!formData.startDate || !formData.endDate) {
        setError('Please select both start and end dates');
        return;
      }
      if (new Date(formData.endDate) < new Date(formData.startDate)) {
        setError('End date must be after start date');
        return;
      }
      if (calculatedDays === 0) {
        setError('Invalid date range selected');
        return;
      }
      // Check if sufficient balance
      if (availableBalance) {
        const available = availableBalance.annual_allocation - availableBalance.used_days - availableBalance.pending_days;
        if (calculatedDays > available) {
          setError(`Insufficient balance. You have ${available} days available.`);
          return;
        }
      }
    }
    
    setStep(step + 1);
    setError('');
  };

  const handlePrevious = () => {
    setStep(step - 1);
    setError('');
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      setError('User session not found. Please try logging out and logging back in.');
      console.error('Submit failed: user.id is not available', { user, profile });
      return;
    }
    
    // Validate cover person
    if (!formData.coverPerson.trim()) {
      setError('Please specify who will cover your duties during your absence');
      return;
    }

    // Validate reason
    if (!formData.reason.trim()) {
      setError('Please provide a reason for your leave');
      return;
    }

    if (formData.reason.trim().length < 10) {
      setError('Please provide a more detailed reason (at least 10 characters)');
      return;
    }

    console.log('Starting leave request submission...', {
      userId: user.id,
      leaveTypeId: formData.leaveTypeId,
      dates: { start: formData.startDate, end: formData.endDate },
      days: calculatedDays
    });

    setLoading(true);
    setError('');

    try {
      let documentUrl: string | null = null;

      // Upload document if present
      if (formData.document) {
        setUploadProgress(50);
        const uploadResult = await uploadDocument(formData.document, user.id);
        
        if (uploadResult.error) {
          throw new Error('Failed to upload document: ' + uploadResult.error.message);
        }
        
        documentUrl = uploadResult.data;
        setUploadProgress(100);
      }

      // Submit leave request
      const requestData = {
        user_id: user.id,
        leave_type_id: formData.leaveTypeId,
        start_date: formData.startDate,
        end_date: formData.endDate,
        total_days: calculatedDays,
        reason: formData.reason.trim(),
        cover_person: formData.coverPerson.trim(),
        document_url: documentUrl || undefined,
        status: 'pending' as const
      };

      console.log('Submit Request Data:', requestData);
      console.log('User object:', user);

      const result = await submitLeaveRequest(requestData);

      if (result.error) {
        throw new Error(result.error.message || 'Failed to submit leave request');
      }

      // Success!
      setSuccess(true);
      setUploadProgress(0);
      
    } catch (err) {
      console.error('Submit error:', err);
      setError((err as Error).message || 'An error occurred while submitting your request. Please try again.');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="app">
        <div className="content">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Loading user data...</p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="app">
        <div className="content">
          <div className="flex items-center justify-center min-h-screen">
            <div className="card max-w-md w-full text-center">
              <div className="stats-icon stats-icon-success mx-auto mb-4" style={{ fontSize: '2rem' }}>
                ✅
              </div>
              <h3 className="page-title text-xl mb-2">Request Submitted!</h3>
              <p className="text-muted mb-4">
                Your leave request has been submitted successfully. You'll be notified when it's reviewed.
              </p>
              <div className="action-buttons justify-center">
                <button 
                  onClick={() => navigate('/leave-history')}
                  className="btn btn-primary"
                >
                  View My Requests
                </button>
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="btn btn-secondary"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is loaded but user.id is missing
  if (user && !user.id) {
    return (
      <div className="app">
        <div className="content">
          <div className="alert alert-danger">
            <h3>Session Error</h3>
            <p>Your user session is incomplete. Please try logging out and logging back in.</p>
            <button onClick={() => navigate('/login')} className="btn btn-primary mt-3">
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedType = leaveTypes.find(t => t.id === formData.leaveTypeId);

  return (
    <div className="app">
      {/* Modern Sidebar */}
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
              className="nav-link nav-link-active w-full text-left"
            >
              <span className="nav-icon">📝</span>
              Request Leave
            </button>
          </div>
          <div className="nav-item">
            <button 
              onClick={() => navigate('/leave-history')}
              className="nav-link nav-link-inactive w-full text-left"
            >
              <span className="nav-icon">📋</span>
              Leave History
            </button>
          </div>
          {(profile?.role === 'hod' || profile?.role === 'hr_admin') && (
            <>
              <div className="nav-item">
                <button 
                  onClick={() => navigate('/approvals')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">✅</span>
                  Approvals
                </button>
              </div>
              <div className="nav-item">
                <button 
                  onClick={() => navigate('/team-calendar')}
                  className="nav-link nav-link-inactive w-full text-left"
                >
                  <span className="nav-icon">📅</span>
                  Team Calendar
                </button>
              </div>
            </>
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
        <div className="page-header">
          <h1 className="page-title">Request Leave</h1>
          <p className="page-subtitle">Submit a new leave request for approval</p>
        </div>

        {/* Enhanced Progress Steps */}
        <div className="card mb-6 progress-card">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: 'Leave Type', desc: 'Select type & check balance', icon: '📋' },
              { num: 2, label: 'Dates', desc: 'Choose start and end dates', icon: '📅' },
              { num: 3, label: 'Details', desc: 'Add reason & documents', icon: '✍️' }
            ].map((s, index) => (
              <div key={s.num} className="flex items-center flex-1 step-container">
                <div className="flex flex-col items-center">
                  <div className={`step-circle ${
                    step >= s.num 
                      ? 'step-circle-active' 
                      : 'step-circle-inactive'
                  }`}>
                    {step > s.num ? '✓' : (step === s.num ? s.icon : s.num)}
                  </div>
                  <div className="text-center mt-3">
                    <div className={`step-label ${
                      step >= s.num ? 'step-label-active' : 'step-label-inactive'
                    }`}>
                      {s.label}
                    </div>
                    <div className="step-desc">{s.desc}</div>
                  </div>
                </div>
                {index < 2 && (
                  <div className={`step-connector ${
                    step > s.num ? 'step-connector-active' : 'step-connector-inactive'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-danger mb-6">
            {error}
          </div>
        )}

        {/* Enhanced Step Content with Animation */}
        <div className="card form-step-container">
          {/* Step 1: Leave Type Selection */}
          {step === 1 && (
            <div className="form-step form-step-active">
              <div className="card-header step-header">
                <h3 className="card-title">
                  <span className="step-icon">📋</span>
                  Step 1: Select Leave Type
                </h3>
                <p className="step-subtitle">Choose your leave type and check your available balance</p>
              </div>
              
              <div className="form-group enhanced-form-group">
                <label className="form-label">Leave Type *</label>
                <div className="select-container">
                  <select
                    className="form-select enhanced-select"
                    value={formData.leaveTypeId}
                    onChange={(e) => handleInputChange('leaveTypeId', e.target.value)}
                  >
                    <option value="">Choose a leave type...</option>
                    {leaveTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} (Max: {type.max_days_per_year} days/year)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.leaveTypeId && (
                <div className="leave-balance-card">
                  <div className="balance-header">
                    <h4 className="balance-title">Your Leave Balance</h4>
                  </div>
                  <div className="balance-content">
                    <div className="balance-item">
                      <span className="balance-label">Available Days:</span>
                      <span className="balance-value balance-available">
                        {(balances.find(b => b.leave_type_id === formData.leaveTypeId)?.annual_allocation || 0) - 
                         (balances.find(b => b.leave_type_id === formData.leaveTypeId)?.used_days || 0) -
                         (balances.find(b => b.leave_type_id === formData.leaveTypeId)?.pending_days || 0)}
                      </span>
                    </div>
                    <div className="balance-item">
                      <span className="balance-label">Used Days:</span>
                      <span className="balance-value balance-used">
                        {balances.find(b => b.leave_type_id === formData.leaveTypeId)?.used_days || 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Debug Info - Styled */}
              <div className="debug-info">
                <p className="debug-text">
                  ℹ️ System Info: {leaveTypes.length} leave types • {balances.length} balances • {publicHolidays.length} holidays loaded
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Date Selection */}
          {step === 2 && (
            <div className="form-step form-step-active">
              <div className="card-header step-header">
                <h3 className="card-title">
                  <span className="step-icon">📅</span>
                  Step 2: Select Dates
                </h3>
                <p className="step-subtitle">Choose your leave start and end dates</p>
              </div>

              <div className="date-selection-grid">
                <div className="form-group enhanced-form-group">
                  <label className="form-label">
                    <span className="label-icon">🗓️</span>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    className="form-input enhanced-input"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    min={new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })}
                  />
                </div>

                <div className="form-group enhanced-form-group">
                  <label className="form-label">
                    <span className="label-icon">📆</span>
                    End Date *
                  </label>
                  <input
                    type="date"
                    className="form-input enhanced-input"
                    value={formData.endDate}
                    onChange={(e) => handleInputChange('endDate', e.target.value)}
                    min={formData.startDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })}
                  />
                </div>
              </div>

              {calculatedDays > 0 && (
                <div className="calculation-card">
                  <div className="calculation-header">
                    <span className="calculation-icon">📊</span>
                    <h4 className="calculation-title">Duration Calculation</h4>
                  </div>
                  <div className="calculation-content">
                    <div className="calculation-item">
                      <span className="calculation-label">Total Days:</span>
                      <span className="calculation-value">{calculatedDays}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="form-step form-step-active">
              <div className="card-header step-header">
                <h3 className="card-title">
                  <span className="step-icon">✍️</span>
                  Step 3: Add Details
                </h3>
                <p className="step-subtitle">Provide reason and review your request</p>
              </div>

              <div className="form-group enhanced-form-group">
                <label className="form-label">
                  <span className="label-icon">👤</span>
                  Who Will Cover Your Duties? *
                </label>
                <input
                  type="text"
                  className="form-input enhanced-input"
                  value={formData.coverPerson}
                  onChange={(e) => handleInputChange('coverPerson', e.target.value)}
                  placeholder="Full name of the colleague covering your duties"
                />
                {!formData.coverPerson.trim() && (
                  <p className="text-xs text-orange-600 mt-1">
                    Required — specify who will handle your responsibilities during your absence
                  </p>
                )}
              </div>

              <div className="form-group enhanced-form-group">
                <label className="form-label">
                  <span className="label-icon">📝</span>
                  Reason for Leave *
                </label>
                <textarea
                  className="form-textarea enhanced-textarea"
                  rows={4}
                  value={formData.reason}
                  onChange={(e) => handleInputChange('reason', e.target.value)}
                  placeholder="Please provide a detailed reason for your leave request..."
                />
                {formData.reason && formData.reason.length < 10 && (
                  <p className="text-xs text-orange-600 mt-1">
                    ⚠️ Please provide more details ({formData.reason.length}/10 characters minimum)
                  </p>
                )}
              </div>

              {/* Document Upload */}
              <div className="form-group enhanced-form-group">
                <label className="form-label">
                  <span className="label-icon">📎</span>
                  Supporting Document (Optional)
                </label>
                <p className="text-xs text-gray-600 mb-2">
                  Upload medical certificate, travel documents, or other supporting files (PDF, JPG, PNG, DOC, DOCX - Max 5MB)
                </p>
                <div className="file-upload-wrapper">
                  <input
                    type="file"
                    id="document-upload"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileChange}
                    className="file-input"
                  />
                  <label htmlFor="document-upload" className="file-upload-label">
                    <span className="file-upload-icon">📁</span>
                    <span className="file-upload-text">
                      {formData.document ? formData.document.name : 'Choose file or drag here'}
                    </span>
                    {formData.document && (
                      <span className="file-upload-size">
                        ({(formData.document.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </label>
                  {formData.document && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, document: null }));
                        const fileInput = document.getElementById('document-upload') as HTMLInputElement;
                        if (fileInput) fileInput.value = '';
                      }}
                      className="file-remove-btn"
                      title="Remove file"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {fileError && (
                  <p className="text-xs text-red-600 mt-1">❌ {fileError}</p>
                )}
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="upload-progress-bar mt-2">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                    <span className="upload-progress-text">{uploadProgress}% uploaded</span>
                  </div>
                )}
              </div>

              <div className="summary-card">
                <div className="summary-header">
                  <h4 className="summary-title">
                    <span className="summary-icon">📋</span>
                    Request Summary
                  </h4>
                </div>
                <div className="summary-content">
                  <div className="summary-item">
                    <span className="summary-label">Leave Type:</span>
                    <span className="summary-value">{selectedType?.name || 'Not selected'}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Start Date:</span>
                    <span className="summary-value">{formData.startDate}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">End Date:</span>
                    <span className="summary-value">{formData.endDate}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Duration:</span>
                    <span className="summary-value">{calculatedDays} days</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Cover Person:</span>
                    <span className="summary-value">{formData.coverPerson || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced Navigation Buttons */}
          <div className="form-navigation">
            <div className="nav-left">
              {step > 1 && (
                <button 
                  onClick={handlePrevious}
                  className="btn btn-secondary nav-btn"
                >
                  ← Previous Step
                </button>
              )}
            </div>
            <div className="nav-right">
              <button 
                onClick={() => navigate('/dashboard')}
                className="btn btn-outline nav-btn"
              >
                Cancel
              </button>
              {step < 3 ? (
                <button 
                  onClick={handleNext}
                  className="btn btn-primary nav-btn"
                >
                  Next Step →
                </button>
              ) : (
                <button 
                  onClick={handleSubmit}
                  className="btn btn-success nav-btn submit-btn"
                  disabled={loading || !user?.id || !formData.coverPerson.trim() || !formData.reason.trim() || formData.reason.length < 10}
                  title={!user?.id ? 'User session not available' :
                         !formData.coverPerson.trim() ? 'Please specify who will cover your duties' :
                         !formData.reason.trim() ? 'Please enter a reason' :
                         formData.reason.length < 10 ? 'Reason must be at least 10 characters' :
                         'Submit your leave request'}
                >
                  {loading ? (
                    <span className="loading-text">
                      <span className="loading-spinner-small"></span>
                      {uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%...` : 'Submitting...'}
                    </span>
                  ) : (
                    <span>✅ Submit Request</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
