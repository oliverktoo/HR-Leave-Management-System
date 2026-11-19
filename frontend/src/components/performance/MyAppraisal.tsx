import { useState, useEffect, useMemo } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import {
  getMyAppraisals,
  submitSelfAssessment,
  type EmployeeAppraisal,
  type KPI,
} from '../../services/performanceService';

const fmtStatus = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtDate   = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const appraisalBadge = (status: EmployeeAppraisal['status']): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    pending:         { background: '#f3f4f6', color: '#4b5563' },
    self_assessment: { background: '#fef9c3', color: '#a16207' },
    manager_review:  { background: '#dbeafe', color: '#1d4ed8' },
    hr_review:       { background: '#ede9fe', color: '#6d28d9' },
    completed:       { background: '#dcfce7', color: '#15803d' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

const ratingBadge = (rating: EmployeeAppraisal['rating']): React.CSSProperties => {
  if (!rating) return {};
  const map: Record<string, React.CSSProperties> = {
    exceptional:          { background: '#ede9fe', color: '#6d28d9' },
    exceeds_expectations: { background: '#dcfce7', color: '#15803d' },
    meets_expectations:   { background: '#dbeafe', color: '#1d4ed8' },
    needs_improvement:    { background: '#fef3c7', color: '#b45309' },
    unsatisfactory:       { background: '#fee2e2', color: '#b91c1c' },
  };
  return map[rating] ?? {};
};

interface AppraisalWithCycle extends EmployeeAppraisal {
  cycle?: {
    name: string;
    cycle_type: string;
    year: number;
    status: string;
    self_assessment_due: string | null;
  };
}

export const MyAppraisal = () => {
  const { profile } = useAuth();
  const [appraisals, setAppraisals] = useState<AppraisalWithCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Self-assessment form
  const [assessingId, setAssessingId] = useState<string | null>(null);
  const [kpiDraft, setKpiDraft] = useState<KPI[]>([]);
  const [comments, setComments] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // Read-only view
  const [viewAppraisal, setViewAppraisal] = useState<AppraisalWithCycle | null>(null);

  useEffect(() => {
    loadAppraisals();
  }, []);

  const loadAppraisals = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await getMyAppraisals();
    if (err) { setError(err.message ?? 'Failed to load appraisals.'); setLoading(false); return; }
    setAppraisals((data as AppraisalWithCycle[]) ?? []);
    setLoading(false);
  };

  // ── Weighted average ───────────────────────────────────────────────────────
  const computedScore = useMemo(() => {
    if (!kpiDraft.length) return 0;
    const totalWeight = kpiDraft.reduce((sum, k) => sum + (k.weight_pct ?? 0), 0);
    if (totalWeight === 0) return 0;
    const weightedSum = kpiDraft.reduce((sum, k) => {
      const score = k.self_score ?? 0;
      return sum + score * (k.weight_pct ?? 0);
    }, 0);
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }, [kpiDraft]);

  // ── Start self-assessment ──────────────────────────────────────────────────
  const startAssessment = (appraisal: AppraisalWithCycle) => {
    setAssessingId(appraisal.id);
    setComments(appraisal.self_assessment_comments ?? '');
    setSubmitError('');
    setSubmitSuccess('');
    // Seed KPIs — use existing if any, otherwise build blank list from service defaults
    const base: KPI[] = appraisal.kpis?.length
      ? appraisal.kpis.map(k => ({ ...k, self_score: k.self_score ?? null, actual: k.actual ?? '' }))
      : [
          { title: 'Quality of Work',       description: 'Accuracy and thoroughness of work output', weight_pct: 25, target: 'Meets standards',   actual: '', self_score: null, manager_score: null },
          { title: 'Productivity',           description: 'Volume and timeliness of work completed',  weight_pct: 25, target: 'Meets deadlines',    actual: '', self_score: null, manager_score: null },
          { title: 'Teamwork & Collaboration', description: 'Works effectively with colleagues',       weight_pct: 20, target: 'Collaborative',     actual: '', self_score: null, manager_score: null },
          { title: 'Communication',          description: 'Clear and professional communication',      weight_pct: 15, target: 'Clear & timely',    actual: '', self_score: null, manager_score: null },
          { title: 'Initiative',             description: 'Takes ownership and shows initiative',       weight_pct: 15, target: 'Self-directed',    actual: '', self_score: null, manager_score: null },
        ];
    setKpiDraft(base);
  };

  const handleKpiChange = (idx: number, field: 'actual' | 'self_score', value: string) => {
    setKpiDraft(prev => prev.map((k, i) => {
      if (i !== idx) return k;
      if (field === 'self_score') {
        const parsed = parseInt(value, 10);
        return { ...k, self_score: isNaN(parsed) ? null : Math.min(5, Math.max(1, parsed)) };
      }
      return { ...k, actual: value };
    }));
  };

  const validateKpis = () => {
    for (const k of kpiDraft) {
      if (!k.actual.trim()) return `Please fill in the actual result for "${k.title}".`;
      if (!k.self_score) return `Please score "${k.title}" (1–5).`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const valErr = validateKpis();
    if (valErr) { setSubmitError(valErr); setShowConfirm(false); return; }
    if (!assessingId) return;
    setSubmitLoading(true);
    setSubmitError('');
    const { error: err } = await submitSelfAssessment(assessingId, kpiDraft, comments, computedScore);
    setSubmitLoading(false);
    if (err) { setSubmitError(err.message ?? 'Submission failed.'); setShowConfirm(false); return; }
    setSubmitSuccess('Self-assessment submitted successfully!');
    setAssessingId(null);
    setShowConfirm(false);
    loadAppraisals();
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem',
    border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem',
  };
  const labelStyle: React.CSSProperties = {
    fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)',
    display: 'block', marginBottom: 4,
  };
  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000, padding: '1rem',
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              My Appraisals
            </h1>
            <p style={{ color: 'var(--gray-500)', marginTop: 4, marginBottom: 0 }}>
              {profile ? `${(profile as any).first_name} ${(profile as any).last_name}` : 'Employee'} · Performance reviews
            </p>
          </div>
          <NotificationBell />
        </div>

        {submitSuccess && (
          <div style={{ background: '#dcfce7', color: '#15803d', padding: '0.875rem 1rem', borderRadius: 8, marginBottom: '1.25rem', fontWeight: 600, fontSize: '0.9rem' }}>
            {submitSuccess}
          </div>
        )}

        {/* Appraisal list */}
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading your appraisals…</div>
        ) : error ? (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '1rem', borderRadius: 8 }}>{error}</div>
        ) : appraisals.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
            <p style={{ margin: 0 }}>No appraisal records found. You will appear here once enrolled in an appraisal cycle.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {appraisals.map(appraisal => {
              const cycle = appraisal.cycle as any;
              const canAssess = appraisal.status === 'self_assessment' && cycle?.status === 'active';
              const isReadOnly = ['manager_review', 'hr_review', 'completed'].includes(appraisal.status);

              return (
                <div key={appraisal.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--gray-900)' }}>
                          {cycle?.name ?? 'Appraisal Cycle'}
                        </span>
                        <span style={{ padding: '0.2rem 0.55rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...appraisalBadge(appraisal.status) }}>
                          {fmtStatus(appraisal.status)}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                        {cycle?.cycle_type ? fmtStatus(cycle.cycle_type) : ''}{cycle?.year ? ` · ${cycle.year}` : ''}
                        {cycle?.self_assessment_due ? ` · Due: ${fmtDate(cycle.self_assessment_due)}` : ''}
                      </div>
                    </div>

                    {/* Scores (if available) */}
                    {(appraisal.self_overall_score !== null || appraisal.final_score !== null) && (
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {appraisal.self_overall_score !== null && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary-600)' }}>{appraisal.self_overall_score}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>Self</div>
                          </div>
                        )}
                        {appraisal.manager_overall_score !== null && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#15803d' }}>{appraisal.manager_overall_score}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>Manager</div>
                          </div>
                        )}
                        {appraisal.final_score !== null && (
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gray-800)' }}>{appraisal.final_score}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>Final</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rating */}
                    {appraisal.rating && (
                      <span style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700, alignSelf: 'center', ...ratingBadge(appraisal.rating) }}>
                        {fmtStatus(appraisal.rating)}
                      </span>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'center' }}>
                      {canAssess && (
                        <button onClick={() => startAssessment(appraisal)}
                          style={{ padding: '0.5rem 1.1rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                          Start Self-Assessment
                        </button>
                      )}
                      {isReadOnly && (
                        <button onClick={() => setViewAppraisal(appraisal)}
                          style={{ padding: '0.5rem 1rem', background: 'var(--gray-100)', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                          View Details
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SELF-ASSESSMENT FORM ───────────────────────────────────────────── */}
        {assessingId && (
          <div style={modalOverlay} onClick={e => e.target === e.currentTarget && !submitLoading && setAssessingId(null)}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: '2rem',
              width: '100%', maxWidth: 820, maxHeight: '94vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Self-Assessment</h2>
                  <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                    Rate each KPI from 1 (poor) to 5 (excellent) and describe your actual achievements
                  </p>
                </div>
                {!submitLoading && (
                  <button onClick={() => setAssessingId(null)}
                    style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>×</button>
                )}
              </div>

              {submitError && (
                <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{submitError}</div>
              )}

              {/* KPI table */}
              <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '2px solid var(--gray-200)' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', width: '22%' }}>KPI</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, color: 'var(--gray-600)', width: '8%' }}>Weight</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', width: '22%' }}>Target</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', width: '28%' }}>Actual Achievement</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600, color: 'var(--gray-600)', width: '12%' }}>Score (1–5)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpiDraft.map((kpi, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                        <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                          <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{kpi.title}</div>
                          {kpi.description && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: 2 }}>{kpi.description}</div>}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--gray-600)', fontWeight: 600 }}>
                          {kpi.weight_pct}%
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--gray-600)', verticalAlign: 'top' }}>
                          {kpi.target}
                        </td>
                        <td style={{ padding: '0.75rem', verticalAlign: 'top' }}>
                          <textarea
                            rows={2}
                            value={kpi.actual}
                            onChange={e => handleKpiChange(idx, 'actual', e.target.value)}
                            placeholder="Describe what you achieved…"
                            style={{ ...fieldStyle, resize: 'vertical', fontSize: '0.85rem', minHeight: 60 }}
                          />
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', verticalAlign: 'top' }}>
                          <input
                            type="number"
                            min={1} max={5}
                            value={kpi.self_score ?? ''}
                            onChange={e => handleKpiChange(idx, 'self_score', e.target.value)}
                            style={{ width: 70, padding: '0.5rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, textAlign: 'center', fontSize: '1rem', fontWeight: 700 }}
                          />
                          {kpi.self_score && (
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray-400)', marginTop: 2 }}>
                              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][kpi.self_score] ?? ''}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Overall score display */}
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.875rem 1.25rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>Weighted Overall Score</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-600)' }}>{computedScore || '—'}</span>
              </div>

              {/* Overall comments */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>Overall Comments</label>
                <textarea
                  rows={4}
                  value={comments}
                  onChange={e => setComments(e.target.value)}
                  placeholder="Summarise your overall performance, achievements, and areas you would like to develop…"
                  style={{ ...fieldStyle, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setAssessingId(null)} disabled={submitLoading}
                  style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={() => { const err = validateKpis(); if (err) { setSubmitError(err); } else { setSubmitError(''); setShowConfirm(true); } }}
                  disabled={submitLoading}
                  style={{ padding: '0.625rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: submitLoading ? 'not-allowed' : 'pointer', opacity: submitLoading ? 0.7 : 1 }}>
                  Submit Self-Assessment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SUBMIT CONFIRMATION ────────────────────────────────────────────── */}
        {showConfirm && (
          <div style={{ ...modalOverlay, zIndex: 2100 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '2rem', maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.15rem', fontWeight: 700 }}>Confirm Submission</h3>
              <p style={{ color: 'var(--gray-600)', marginBottom: '0.5rem' }}>
                You are about to submit your self-assessment with an overall score of{' '}
                <strong style={{ color: 'var(--primary-600)' }}>{computedScore}</strong>.
              </p>
              <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Once submitted, it will move to your manager for review. You will not be able to edit it.
              </p>
              {submitError && (
                <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{submitError}</div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowConfirm(false)} disabled={submitLoading}
                  style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                  Go Back
                </button>
                <button onClick={handleSubmit} disabled={submitLoading}
                  style={{ padding: '0.625rem 1.5rem', background: '#15803d', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: submitLoading ? 'not-allowed' : 'pointer', opacity: submitLoading ? 0.7 : 1 }}>
                  {submitLoading ? 'Submitting…' : 'Confirm & Submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── READ-ONLY VIEW MODAL ───────────────────────────────────────────── */}
        {viewAppraisal && (
          <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setViewAppraisal(null)}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: '2rem',
              width: '100%', maxWidth: 780, maxHeight: '94vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                      {(viewAppraisal.cycle as any)?.name ?? 'Appraisal'}
                    </h2>
                    <span style={{ padding: '0.2rem 0.55rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...appraisalBadge(viewAppraisal.status) }}>
                      {fmtStatus(viewAppraisal.status)}
                    </span>
                  </div>
                  {viewAppraisal.rating && (
                    <span style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700, ...ratingBadge(viewAppraisal.rating) }}>
                      Rating: {fmtStatus(viewAppraisal.rating)}
                    </span>
                  )}
                </div>
                <button onClick={() => setViewAppraisal(null)}
                  style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>×</button>
              </div>

              {/* Score summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                {[
                  { label: 'Self Score',    value: viewAppraisal.self_overall_score },
                  { label: 'Manager Score', value: viewAppraisal.manager_overall_score },
                  { label: 'Final Score',   value: viewAppraisal.final_score },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.875rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-600)' }}>{s.value ?? '—'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* KPI table (read-only) */}
              {viewAppraisal.kpis?.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-800)', marginBottom: '0.75rem' }}>KPI Results</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                          {['KPI', 'Weight', 'Target', 'Actual', 'Self', 'Manager'].map(h => (
                            <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {viewAppraisal.kpis.map((kpi: KPI, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                            <td style={{ padding: '0.6rem 0.75rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{kpi.title}</div>
                              {kpi.description && <div style={{ fontSize: '0.72rem', color: 'var(--gray-500)' }}>{kpi.description}</div>}
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray-600)' }}>{kpi.weight_pct}%</td>
                            <td style={{ padding: '0.6rem 0.75rem', color: 'var(--gray-600)' }}>{kpi.target}</td>
                            <td style={{ padding: '0.6rem 0.75rem', color: 'var(--gray-700)', fontWeight: 500 }}>{kpi.actual || '—'}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--primary-700)', fontWeight: 700 }}>{kpi.self_score ?? '—'}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray-700)', fontWeight: 700 }}>{kpi.manager_score ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Comments */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {viewAppraisal.self_assessment_comments && (
                  <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '0.875rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--primary-700)', marginBottom: 4 }}>Your Comments</div>
                    <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '0.875rem' }}>{viewAppraisal.self_assessment_comments}</p>
                  </div>
                )}
                {viewAppraisal.manager_comments && (
                  <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '0.875rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#15803d', marginBottom: 4 }}>Manager Comments</div>
                    <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '0.875rem' }}>{viewAppraisal.manager_comments}</p>
                  </div>
                )}
                {viewAppraisal.hr_comments && (
                  <div style={{ background: '#fdf4ff', borderRadius: 8, padding: '0.875rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#7e22ce', marginBottom: 4 }}>HR Comments</div>
                    <p style={{ margin: 0, color: 'var(--gray-700)', fontSize: '0.875rem' }}>{viewAppraisal.hr_comments}</p>
                  </div>
                )}
              </div>

              {viewAppraisal.completed_at && (
                <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'right' }}>
                  Completed {fmtDate(viewAppraisal.completed_at)}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button onClick={() => setViewAppraisal(null)}
                  style={{ padding: '0.6rem 1.5rem', background: 'var(--gray-100)', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
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
