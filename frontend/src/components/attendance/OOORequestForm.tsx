// OOO Request Form — Employee selects an open assignment and applies

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminSidebar } from '../admin/AdminSidebar';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabaseClient';
import {
  createOOORequest,
  getOpenOOOAssignments,
  hasExistingOOORequest,
  getMyOOORequests,
} from '../../services/oooService';
import {
  OOOAssignment,
  OOO_ABSENCE_LABELS,
} from '../../types/ooo';

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
}

export function OOORequestForm() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const isAdmin = profile?.role === 'hr_admin' || profile?.role === 'super_admin';

  const [step, setStep] = useState(1);

  // Admin: submit on behalf of an employee
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [forUserId, setForUserId] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');

  // Step 1: Assignment selection
  const [assignments, setAssignments] = useState<OOOAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [selectedAssignment, setSelectedAssignment] = useState<OOOAssignment | null>(null);
  // Assignment IDs the current user already has an active request for
  const [appliedAssignmentIds, setAppliedAssignmentIds] = useState<Set<string>>(new Set());

  // Step 2
  const [isUrgent, setIsUrgent] = useState(false);
  const [reason, setReason] = useState('');

  // Step 3
  const [handoverNotes, setHandoverNotes] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load open assignments + existing requests to block duplicates
  useEffect(() => {
    const load = async () => {
      try {
        // Fetch assignments — critical, show error if it fails
        const open = await getOpenOOOAssignments();
        setAssignments(open);
      } catch (err: any) {
        setError('Failed to load assignments: ' + (err?.message || 'Unknown error'));
        setAssignments([]);
      }

      // Fetch my requests separately — non-critical, just for duplicate detection
      try {
        const mine = await getMyOOORequests();
        const applied = new Set(
          mine
            .filter(r => r.assignment_id && r.status !== 'cancelled')
            .map(r => r.assignment_id!)
        );
        setAppliedAssignmentIds(applied);
      } catch {
        // Ignore — worst case all assignments appear as unapplied
      }

      setLoadingAssignments(false);
    };
    load();
  }, []);

  // Load employee list for admin picker
  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('users_profile')
      .select('id, first_name, last_name, employee_id')
      .order('first_name')
      .then(({ data }) => setEmployees(data || []));
  }, [isAdmin]);

  const filteredEmployees = employees.filter(e => {
    const q = employeeSearch.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      (e.employee_id || '').toLowerCase().includes(q)
    );
  });

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (isAdmin && !forUserId) {
        setError('Please select an employee to submit on behalf of.');
        return;
      }
      if (!selectedAssignment) {
        setError('Please select an assignment to apply against.');
        return;
      }
    }
    if (step === 2) {
      if (!reason.trim()) {
        setError('Please provide a reason for your absence.');
        return;
      }
      if (reason.trim().length < 10) {
        setError('Please provide more detail (at least 10 characters).');
        return;
      }
    }
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!selectedAssignment || !reason.trim()) {
      setError('Please complete all required fields.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');

      const duplicate = await hasExistingOOORequest(
        selectedAssignment.id,
        isAdmin && forUserId ? forUserId : undefined
      );
      if (duplicate) {
        setError('A request for this assignment already exists and cannot be submitted again.');
        return;
      }

      await createOOORequest({
        assignment_id: selectedAssignment.id,
        is_urgent: isUrgent,
        reason,
        handover_notes: handoverNotes || undefined,
        emergency_contact: emergencyContact || undefined,
        for_user_id: isAdmin && forUserId ? forUserId : undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────
  if (success) {
    return (
      <div className="admin-layout">
        <AdminSidebar />
        <main className="admin-main">
          <div className="content">
            <div className="flex items-center justify-center min-h-screen">
              <div className="card max-w-md w-full text-center">
                <div className="stats-icon stats-icon-success mx-auto mb-4" style={{ fontSize: '2rem' }}>✅</div>
                <h3 className="page-title text-xl mb-2">Request Submitted!</h3>
                <p className="text-muted mb-4">
                  Your OOO request for <strong>{selectedAssignment?.title}</strong> has been submitted.
                  It will be reviewed by the assignment creator
                  {isUrgent ? ' within 4 hours' : ' within 24 hours'}.
                </p>
                <div className="action-buttons justify-center">
                  <button onClick={() => navigate('/attendance/ooo/my-requests')} className="btn btn-primary">
                    View My Requests
                  </button>
                  <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
                    Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="content">

          <div className="page-header">
            <div>
              <h1 className="page-title">OOO Request</h1>
              <p className="page-subtitle">Select a work assignment and apply for out-of-office approval</p>
            </div>
          </div>

          {/* Step progress */}
          <div className="card mb-6 progress-card">
            <div className="flex items-center justify-between">
              {[
                { num: 1, label: 'Assignment', desc: 'Select from open pool',     icon: '📋' },
                { num: 2, label: 'Reason',     desc: 'Details and urgency',       icon: '✍️' },
                { num: 3, label: 'Handover',   desc: 'Coverage and contact',      icon: '🤝' },
              ].map((s, index) => (
                <div key={s.num} className="flex items-center flex-1 step-container">
                  <div className="flex flex-col items-center">
                    <div className={`step-circle ${step >= s.num ? 'step-circle-active' : 'step-circle-inactive'}`}>
                      {step > s.num ? '✓' : (step === s.num ? s.icon : s.num)}
                    </div>
                    <div className="text-center mt-3">
                      <div className={`step-label ${step >= s.num ? 'step-label-active' : 'step-label-inactive'}`}>{s.label}</div>
                      <div className="step-desc">{s.desc}</div>
                    </div>
                  </div>
                  {index < 2 && (
                    <div className={`step-connector ${step > s.num ? 'step-connector-active' : 'step-connector-inactive'}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <div className="alert alert-danger mb-6">{error}</div>}

          <div className="card form-step-container">

            {/* ── Step 1: Select Assignment ── */}
            {step === 1 && (
              <div className="form-step form-step-active">
                <div className="card-header step-header">
                  <h3 className="card-title"><span className="step-icon">📋</span> Step 1: Select Assignment</h3>
                  <p className="step-subtitle">Choose the work assignment you are applying for</p>
                </div>

                {/* Admin employee picker */}
                {isAdmin && (
                  <div className="form-group enhanced-form-group" style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                    <label className="form-label">
                      <span className="label-icon">👤</span>
                      Submit on Behalf of Employee *
                    </label>
                    <input
                      type="text"
                      className="form-input enhanced-input"
                      placeholder="Search by name or employee ID…"
                      value={employeeSearch}
                      onChange={e => { setEmployeeSearch(e.target.value); setForUserId(''); }}
                      style={{ marginBottom: 8 }}
                    />
                    {employeeSearch && !forUserId && (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, maxHeight: 180, overflowY: 'auto', background: '#fff' }}>
                        {filteredEmployees.length === 0
                          ? <div style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 13 }}>No employees found</div>
                          : filteredEmployees.map(e => (
                            <button key={e.id} type="button"
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer' }}
                              onMouseEnter={ev => (ev.currentTarget.style.background = '#f3f4f6')}
                              onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
                              onClick={() => { setForUserId(e.id); setEmployeeSearch(`${e.first_name} ${e.last_name} (${e.employee_id})`); }}
                            >
                              {e.first_name} {e.last_name}
                              <span style={{ color: '#6b7280', marginLeft: 6 }}>{e.employee_id}</span>
                            </button>
                          ))
                        }
                      </div>
                    )}
                    {forUserId && <div style={{ fontSize: 12, color: '#16a34a', marginTop: 4 }}>✓ {employeeSearch}</div>}
                  </div>
                )}

                {loadingAssignments ? (
                  <div className="loading-container"><div className="loading-spinner" /></div>
                ) : assignments.length === 0 ? (
                  <div className="empty-state" style={{ padding: 32 }}>
                    <div style={{ fontSize: 48 }}>📋</div>
                    <h3>No Open Assignments</h3>
                    <p>There are currently no open OOO assignments. Please check back later or contact your HOD.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {assignments.map(a => {
                      const isSelected = selectedAssignment?.id === a.id;
                      const alreadyApplied = appliedAssignmentIds.has(a.id);
                      return (
                        <div
                          key={a.id}
                          onClick={() => !alreadyApplied && setSelectedAssignment(a)}
                          style={{
                            border: `2px solid ${isSelected ? '#6366f1' : alreadyApplied ? '#d1d5db' : '#e5e7eb'}`,
                            borderRadius: 10,
                            padding: '14px 18px',
                            cursor: alreadyApplied ? 'not-allowed' : 'pointer',
                            background: isSelected ? '#eef2ff' : alreadyApplied ? '#f9fafb' : '#fff',
                            opacity: alreadyApplied ? 0.65 : 1,
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                {isSelected && <span style={{ color: '#6366f1', fontWeight: 700 }}>✓</span>}
                                <span style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</span>
                                <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '1px 7px', borderRadius: 8, fontSize: 11 }}>
                                  {OOO_ABSENCE_LABELS[a.assignment_type]}
                                </span>
                                {a.includes_weekend && <span style={{ background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>WKD</span>}
                                {a.includes_public_holiday && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>HOL</span>}
                                {alreadyApplied && <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 7px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>✓ Already Applied</span>}
                              </div>
                              {a.description && (
                                <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 4px' }}>{a.description}</p>
                              )}
                              <div style={{ fontSize: 13, color: '#374151', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span>📅 {a.start_date} → {a.end_date}</span>
                                {a.location && <span>📍 {a.location}</span>}
                                {a.creator && <span>👤 Approver: {a.creator.first_name} {a.creator.last_name}</span>}
                                {a.max_participants && <span>👥 Max {a.max_participants} participants</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Reason & Urgency ── */}
            {step === 2 && selectedAssignment && (
              <div className="form-step form-step-active">
                <div className="card-header step-header">
                  <h3 className="card-title"><span className="step-icon">✍️</span> Step 2: Reason &amp; Urgency</h3>
                  <p className="step-subtitle">Explain why you need to attend this assignment</p>
                </div>

                {/* Assignment summary */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>📋 {selectedAssignment.title}</p>
                  <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                    {selectedAssignment.start_date} → {selectedAssignment.end_date}
                    {selectedAssignment.location && ` · ${selectedAssignment.location}`}
                  </p>
                </div>

                <div className="form-group enhanced-form-group">
                  <label className="form-label"><span className="label-icon">📝</span> Reason for Attending *</label>
                  <textarea
                    className="form-textarea enhanced-textarea"
                    rows={4}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Why do you need to attend this assignment? What is your role?"
                  />
                  {reason && reason.length < 10 && (
                    <p className="text-xs text-orange-600 mt-1">⚠️ Please provide more detail ({reason.length}/10 characters minimum)</p>
                  )}
                </div>

                <div className="form-group enhanced-form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <span>
                      Mark as Urgent
                      <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 6 }}>(requires HOD response within 4 hours)</span>
                    </span>
                  </label>
                </div>

                <div className="summary-card">
                  <div className="summary-header">
                    <h4 className="summary-title"><span className="summary-icon">ℹ️</span> Approval Info</h4>
                  </div>
                  <div className="summary-content">
                    <div className="summary-item">
                      <span className="summary-label">Approver:</span>
                      <span className="summary-value">
                        {selectedAssignment.creator
                          ? `${selectedAssignment.creator.first_name} ${selectedAssignment.creator.last_name} (Assignment Creator)`
                          : 'Assignment Creator'}
                      </span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Review SLA:</span>
                      <span className="summary-value">{isUrgent ? 'Within 4 hours' : 'Within 24 hours'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Then:</span>
                      <span className="summary-value">HR review after HOD approval</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Handover & Contact ── */}
            {step === 3 && selectedAssignment && (
              <div className="form-step form-step-active">
                <div className="card-header step-header">
                  <h3 className="card-title"><span className="step-icon">🤝</span> Step 3: Handover &amp; Contact</h3>
                  <p className="step-subtitle">Ensure continuity while you are away</p>
                </div>

                <div className="form-group enhanced-form-group">
                  <label className="form-label"><span className="label-icon">📋</span> Handover Plan</label>
                  <textarea
                    className="form-textarea enhanced-textarea"
                    rows={4}
                    value={handoverNotes}
                    onChange={e => setHandoverNotes(e.target.value)}
                    placeholder="Who will cover urgent duties? Any pending tasks that need attention?"
                  />
                </div>

                <div className="form-group enhanced-form-group">
                  <label className="form-label"><span className="label-icon">📞</span> Emergency Contact During Assignment</label>
                  <input
                    type="text"
                    className="form-input enhanced-input"
                    value={emergencyContact}
                    onChange={e => setEmergencyContact(e.target.value)}
                    placeholder="Phone number or email if you can be reached"
                  />
                </div>

                <div className="summary-card">
                  <div className="summary-header">
                    <h4 className="summary-title"><span className="summary-icon">📋</span> Request Summary</h4>
                  </div>
                  <div className="summary-content">
                    <div className="summary-item">
                      <span className="summary-label">Assignment:</span>
                      <span className="summary-value">{selectedAssignment.title}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Type:</span>
                      <span className="summary-value">{OOO_ABSENCE_LABELS[selectedAssignment.assignment_type]}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Dates:</span>
                      <span className="summary-value">{selectedAssignment.start_date} → {selectedAssignment.end_date}</span>
                    </div>
                    {selectedAssignment.location && (
                      <div className="summary-item">
                        <span className="summary-label">Location:</span>
                        <span className="summary-value">{selectedAssignment.location}</span>
                      </div>
                    )}
                    <div className="summary-item">
                      <span className="summary-label">Priority:</span>
                      <span className="summary-value" style={{ color: isUrgent ? '#ef4444' : undefined }}>
                        {isUrgent ? 'Urgent' : 'Normal'}
                      </span>
                    </div>
                    {isAdmin && forUserId && (
                      <div className="summary-item">
                        <span className="summary-label">Submitting for:</span>
                        <span className="summary-value">{employeeSearch}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="form-navigation">
              <div className="nav-left">
                {step > 1 && (
                  <button onClick={() => { setError(''); setStep(s => s - 1); }} className="btn btn-secondary nav-btn">
                    ← Previous Step
                  </button>
                )}
              </div>
              <div className="nav-right">
                <button onClick={() => navigate('/attendance/ooo/my-requests')} className="btn btn-outline nav-btn">Cancel</button>
                {step < 3 ? (
                  <button onClick={handleNext} className="btn btn-primary nav-btn" disabled={!selectedAssignment && step === 1}>
                    Next Step →
                  </button>
                ) : (
                  <button
                    onClick={handleSubmit}
                    className="btn btn-success nav-btn submit-btn"
                    disabled={submitting || !reason.trim() || reason.length < 10}
                  >
                    {submitting
                      ? <span className="loading-text"><span className="loading-spinner-small"></span>Submitting…</span>
                      : <span>✅ Submit Request</span>
                    }
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
