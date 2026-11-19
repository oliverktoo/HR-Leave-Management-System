// RecruitmentManagement — HR admin view for managing job postings and the full applicant pipeline.
// Accessible to: super_admin, hr_admin, ceo, hod

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Department { id: string; name: string; }

interface JobPosting {
  id: string;
  title: string;
  department_id: string | null;
  departments?: { name: string } | null;
  job_type: 'full_time' | 'part_time' | 'contract' | 'internship' | 'casual';
  location: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  salary_min: number | null;
  salary_max: number | null;
  closing_date: string | null;
  status: 'draft' | 'open' | 'closed' | 'cancelled' | 'filled';
  vacancies: number;
  is_internal: boolean;
  created_at: string;
  application_count?: number;
}

interface Application {
  id: string;
  job_posting_id: string;
  applicant_type: 'internal' | 'external';
  full_name: string;
  email: string;
  phone: string | null;
  current_employer: string | null;
  current_position: string | null;
  years_experience: number | null;
  cover_letter: string | null;
  cv_url: string | null;
  status: 'applied' | 'shortlisted' | 'interview_scheduled' | 'interviewed' | 'offered' | 'accepted' | 'rejected' | 'withdrawn';
  rejection_reason: string | null;
  offer_salary: number | null;
  offer_start_date: string | null;
  screening_score: number | null;
  interview_score: number | null;
  hr_notes: string | null;
  applied_at: string;
}

interface InterviewSchedule {
  id: string;
  application_id: string;
  round_number: number;
  interview_type: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  status: string;
  feedback: string | null;
  score: number | null;
  recommendation: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract',
  internship: 'Internship', casual: 'Casual',
};

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft:               { label: 'Draft',        bg: 'var(--gray-100)',  color: 'var(--gray-600)' },
  open:                { label: 'Open',          bg: '#dcfce7',         color: 'var(--success-500)' },
  closed:              { label: 'Closed',        bg: '#fef3c7',         color: 'var(--warning-500)' },
  cancelled:           { label: 'Cancelled',     bg: '#fee2e2',         color: 'var(--danger-500)' },
  filled:              { label: 'Filled',        bg: '#ede9fe',         color: '#5b21b6' },
  applied:             { label: 'Applied',       bg: '#dbeafe',         color: 'var(--primary-600)' },
  shortlisted:         { label: 'Shortlisted',   bg: '#e0f2fe',         color: '#0369a1' },
  interview_scheduled: { label: 'Interview',     bg: '#fef3c7',         color: 'var(--warning-500)' },
  interviewed:         { label: 'Interviewed',   bg: '#ede9fe',         color: '#5b21b6' },
  offered:             { label: 'Offered',       bg: '#dcfce7',         color: 'var(--success-500)' },
  accepted:            { label: 'Accepted',      bg: '#bbf7d0',         color: '#14532d' },
  rejected:            { label: 'Rejected',      bg: '#fee2e2',         color: 'var(--danger-500)' },
  withdrawn:           { label: 'Withdrawn',     bg: 'var(--gray-100)', color: 'var(--gray-500)' },
};

const PIPELINE_STAGES = ['applied','shortlisted','interview_scheduled','interviewed','offered','accepted'];

// ─── Shared style helpers ─────────────────────────────────────────────────────
const S = {
  btnPrimary: {
    padding: '8px 16px', background: 'var(--primary-600)', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    padding: '8px 16px', background: 'var(--gray-100)', color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 14, cursor: 'pointer',
  } as React.CSSProperties,
  btnSmall: (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '4px 12px', background: bg, color,
    border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }),
  btnDanger: {
    padding: '8px 16px', background: '#fee2e2', color: 'var(--danger-500)',
    border: '1px solid #fca5a5', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  } as React.CSSProperties,
  input: {
    width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)',
    borderRadius: 6, fontSize: 14, outline: 'none', background: 'var(--gray-50)',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  label: {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--gray-700)', marginBottom: 4,
  } as React.CSSProperties,
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 16,
  } as React.CSSProperties,
  modal: (maxWidth = 580): React.CSSProperties => ({
    background: '#fff', borderRadius: 12, width: '100%',
    maxWidth, maxHeight: '90vh', overflowY: 'auto',
    padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  }),
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, bg: 'var(--gray-100)', color: 'var(--gray-700)' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function RecruitmentManagement() {
  const [view, setView] = useState<'postings' | 'pipeline'>('postings');
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [selectedPosting, setSelectedPosting] = useState<JobPosting | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [showAppModal, setShowAppModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [interviews, setInterviews] = useState<InterviewSchedule[]>([]);

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  type JobFormState = {
    title: string; department_id: string;
    job_type: JobPosting['job_type'];
    location: string; description: string; requirements: string; responsibilities: string;
    salary_min: string; salary_max: string; closing_date: string;
    status: JobPosting['status'];
    vacancies: number; is_internal: boolean;
  };
  const emptyJob: JobFormState = {
    title: '', department_id: '', job_type: 'full_time', location: 'Nairobi',
    description: '', requirements: '', responsibilities: '',
    salary_min: '', salary_max: '', closing_date: '',
    status: 'draft', vacancies: 1, is_internal: false,
  };
  const [jobForm, setJobForm] = useState<JobFormState>(emptyJob);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [postingsRes, deptsRes] = await Promise.all([
        supabase.from('job_postings').select('*, departments(name)').order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name').order('name'),
      ]);
      if (postingsRes.error) throw postingsRes.error;
      if (deptsRes.error) throw deptsRes.error;

      const counts: Record<string, number> = {};
      if (postingsRes.data?.length) {
        const { data: appCounts } = await supabase
          .from('job_applications').select('job_posting_id')
          .in('job_posting_id', postingsRes.data.map(p => p.id));
        (appCounts ?? []).forEach(a => { counts[a.job_posting_id] = (counts[a.job_posting_id] ?? 0) + 1; });
      }
      setPostings((postingsRes.data ?? []).map(p => ({ ...p, application_count: counts[p.id] ?? 0 })));
      setDepartments(deptsRes.data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApplications = useCallback(async (postingId: string) => {
    const { data } = await supabase.from('job_applications').select('*')
      .eq('job_posting_id', postingId).order('applied_at', { ascending: false });
    setApplications(data ?? []);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openPipeline = async (posting: JobPosting) => {
    setSelectedPosting(posting);
    await loadApplications(posting.id);
    setView('pipeline');
  };

  const saveJob = async () => {
    if (!jobForm.title.trim()) return setError('Job title is required');
    setError(null);
    const payload = {
      title: jobForm.title.trim(), department_id: jobForm.department_id || null,
      job_type: jobForm.job_type, location: jobForm.location,
      description: jobForm.description || null, requirements: jobForm.requirements || null,
      responsibilities: jobForm.responsibilities || null,
      salary_min: jobForm.salary_min ? Number(jobForm.salary_min) : null,
      salary_max: jobForm.salary_max ? Number(jobForm.salary_max) : null,
      closing_date: jobForm.closing_date || null, status: jobForm.status,
      vacancies: jobForm.vacancies, is_internal: jobForm.is_internal,
    };
    let err;
    if (editingJob) {
      ({ error: err } = await supabase.from('job_postings').update(payload).eq('id', editingJob.id));
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      ({ error: err } = await supabase.from('job_postings').insert({ ...payload, created_by: user!.id }));
    }
    if (err) return setError(err.message);
    flash(editingJob ? 'Job posting updated' : 'Job posting created');
    setShowJobModal(false); setEditingJob(null); setJobForm(emptyJob);
    await loadData();
  };

  const openEditJob = (job: JobPosting) => {
    setEditingJob(job);
    setJobForm({
      title: job.title, department_id: job.department_id ?? '', job_type: job.job_type,
      location: job.location, description: job.description ?? '',
      requirements: job.requirements ?? '', responsibilities: job.responsibilities ?? '',
      salary_min: job.salary_min?.toString() ?? '', salary_max: job.salary_max?.toString() ?? '',
      closing_date: job.closing_date ?? '', status: job.status,
      vacancies: job.vacancies, is_internal: job.is_internal,
    });
    setShowJobModal(true);
  };

  const updateAppStatus = async (appId: string, status: string, extra: Record<string, any> = {}) => {
    const { error: err } = await supabase.from('job_applications').update({ status, ...extra }).eq('id', appId);
    if (err) return setError(err.message);
    flash(`Applicant marked as ${STATUS_CFG[status]?.label ?? status}`);
    if (selectedPosting) await loadApplications(selectedPosting.id);
    if (selectedApp?.id === appId) setSelectedApp(prev => prev ? { ...prev, status: status as any, ...extra } : prev);
  };

  const openInterviews = async (app: Application) => {
    setSelectedApp(app);
    const { data } = await supabase.from('interview_schedules').select('*')
      .eq('application_id', app.id).order('scheduled_at');
    setInterviews(data ?? []);
    setShowInterviewModal(true);
  };

  const filteredPostings = postings.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchSearch = !searchTerm ||
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.departments as any)?.name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchStatus && matchSearch;
  });

  const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = applications.filter(a => a.status === stage);
    return acc;
  }, {} as Record<string, Application[]>);
  const rejected = applications.filter(a => a.status === 'rejected');

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* ── Top bar ── */}
        <div style={{
          background: '#fff', borderBottom: '1px solid var(--gray-200)',
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div>
            {view === 'pipeline' && selectedPosting ? (
              <>
                <button onClick={() => setView('postings')} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--primary-600)', fontSize: 13, padding: 0, marginBottom: 4,
                }}>← Back to Job Postings</button>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
                  🔍 {selectedPosting.title}
                </h1>
                <p style={{ margin: '2px 0 0', color: 'var(--gray-500)', fontSize: 13 }}>
                  {(selectedPosting.departments as any)?.name ?? 'No Department'} · {applications.length} applications
                </p>
              </>
            ) : (
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
                🔍 Recruitment
              </h1>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {view === 'postings' && (
              <button style={S.btnPrimary} onClick={() => { setEditingJob(null); setJobForm(emptyJob); setShowJobModal(true); }}>
                + Post New Job
              </button>
            )}
            <NotificationBell />
          </div>
        </div>

        {/* ── Alerts ── */}
        {error && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#fee2e2',
            border: '1px solid #fca5a5', borderRadius: 8, color: 'var(--danger-500)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
            {error}
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
          </div>
        )}
        {success && (
          <div style={{ margin: '12px 24px 0', padding: '10px 14px', background: '#dcfce7',
            border: '1px solid #86efac', borderRadius: 8, color: 'var(--success-500)', fontSize: 14 }}>
            {success}
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ padding: 24 }}>

          {/* ─── POSTINGS VIEW ─── */}
          {view === 'postings' && (
            <>
              {/* Stats */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                {[
                  { s: 'open',   label: 'Open',    bg: '#dcfce7', color: 'var(--success-500)' },
                  { s: 'draft',  label: 'Draft',   bg: 'var(--gray-100)', color: 'var(--gray-600)' },
                  { s: 'filled', label: 'Filled',  bg: '#ede9fe', color: '#5b21b6' },
                  { s: 'closed', label: 'Closed',  bg: '#fef3c7', color: 'var(--warning-500)' },
                ].map(({ s, label, bg, color }) => (
                  <div key={s} onClick={() => setStatusFilter(prev => prev === s ? 'all' : s)}
                    style={{ background: bg, borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
                      border: `2px solid ${statusFilter === s ? color : 'transparent'}`,
                      display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 18, color }}>{postings.filter(p => p.status === s).length}</span>
                    <span style={{ fontSize: 12, color: 'var(--gray-600)', fontWeight: 500 }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Search + filter */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <input style={{ ...S.input, maxWidth: 320 }} placeholder="Search title or department…"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                <select style={{ ...S.input, maxWidth: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {Object.entries(STATUS_CFG).slice(0,5).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                </select>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-400)' }}>Loading…</div>
              ) : filteredPostings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-400)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
                  <div style={{ fontSize: 16, marginBottom: 16 }}>No job postings found</div>
                  <button style={S.btnPrimary} onClick={() => setShowJobModal(true)}>Create First Posting</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                  {filteredPostings.map(job => (
                    <div key={job.id} style={{ background: '#fff', border: '1px solid var(--gray-200)',
                      borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--gray-900)' }}>{job.title}</div>
                          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>
                            {(job.departments as any)?.name ?? 'No Department'} · {JOB_TYPE_LABELS[job.job_type]}
                          </div>
                        </div>
                        <Badge status={job.status} />
                      </div>
                      <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--gray-500)', flexWrap: 'wrap' }}>
                        <span>📍 {job.location}</span>
                        <span>👥 {job.vacancies} {job.vacancies === 1 ? 'vacancy' : 'vacancies'}</span>
                        {job.is_internal && <span style={{ color: 'var(--primary-600)', fontWeight: 600 }}>Internal</span>}
                      </div>
                      {(job.salary_min || job.salary_max) && (
                        <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>
                          💰 KES {job.salary_min?.toLocaleString() ?? '?'} – {job.salary_max?.toLocaleString() ?? '?'}
                        </div>
                      )}
                      {job.closing_date && (
                        <div style={{ fontSize: 13, color: new Date(job.closing_date) < new Date() ? 'var(--danger-500)' : 'var(--gray-500)' }}>
                          🗓 Closes {new Date(job.closing_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--gray-100)' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-600)' }}>
                          {job.application_count} application{job.application_count !== 1 ? 's' : ''}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {job.status === 'open' && !job.is_internal && (
                            <button style={S.btnSmall('#ede9fe', '#5b21b6')} title="Copy public careers link"
                              onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/careers`);
                                flash('Public careers link copied!');
                              }}>🔗 Share</button>
                          )}
                          <button style={S.btnSmall('var(--gray-100)', 'var(--gray-700)')} onClick={() => openEditJob(job)}>Edit</button>
                          <button style={S.btnSmall('var(--primary-600)')} onClick={() => openPipeline(job)}>Pipeline →</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── PIPELINE VIEW ─── */}
          {view === 'pipeline' && selectedPosting && (
            <div style={{ overflowX: 'auto', paddingBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, minWidth: 'max-content' }}>
                {PIPELINE_STAGES.map(stage => {
                  const apps = byStage[stage] ?? [];
                  const cfg = STATUS_CFG[stage];
                  return (
                    <div key={stage} style={{ width: 230 }}>
                      <div style={{ background: cfg.bg, borderRadius: 8, padding: '7px 12px', marginBottom: 10,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: 12, color: cfg.color }}>{cfg.label}</span>
                        <span style={{ background: cfg.color, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>{apps.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {apps.length === 0 ? (
                          <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 14,
                            textAlign: 'center', fontSize: 12, color: 'var(--gray-300)', border: '1px dashed var(--gray-200)' }}>
                            No applicants
                          </div>
                        ) : apps.map(app => (
                          <div key={app.id} onClick={() => { setSelectedApp(app); setShowAppModal(true); }}
                            style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 8,
                              padding: 12, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                              transition: 'box-shadow 0.15s' }}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-900)' }}>{app.full_name}</div>
                            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{app.current_position ?? app.email}</div>
                            {app.years_experience != null && (
                              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{app.years_experience} yr exp</div>
                            )}
                            {(app.screening_score != null || app.interview_score != null) && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                {app.screening_score != null && <span style={{ fontSize: 10, background: '#ede9fe', color: '#5b21b6', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>Screen {app.screening_score}</span>}
                                {app.interview_score != null && <span style={{ fontSize: 10, background: '#dcfce7', color: 'var(--success-500)', borderRadius: 4, padding: '1px 5px', fontWeight: 600 }}>Int. {app.interview_score}</span>}
                              </div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 6 }}>
                              {new Date(app.applied_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Rejected column */}
                <div style={{ width: 230 }}>
                  <div style={{ background: '#fee2e2', borderRadius: 8, padding: '7px 12px', marginBottom: 10,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--danger-500)' }}>Rejected</span>
                    <span style={{ background: 'var(--danger-500)', color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11 }}>{rejected.length}</span>
                  </div>
                  {rejected.map(app => (
                    <div key={app.id} onClick={() => { setSelectedApp(app); setShowAppModal(true); }}
                      style={{ background: '#fff', border: '1px solid #fca5a5', borderRadius: 8, padding: 12,
                        opacity: 0.75, cursor: 'pointer', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)' }}>{app.full_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{app.rejection_reason ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── JOB MODAL ──────────────────────────────────────────────────────────── */}
      {showJobModal && (
        <div style={S.overlay} onClick={() => setShowJobModal(false)}>
          <div style={S.modal(640)} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
                {editingJob ? 'Edit Job Posting' : 'New Job Posting'}
              </h2>
              <button onClick={() => setShowJobModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--gray-400)' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Job Title *">
                  <input style={S.input} value={jobForm.title} onChange={e => setJobForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Finance Officer" />
                </Field>
              </div>
              <Field label="Department">
                <select style={S.input} value={jobForm.department_id} onChange={e => setJobForm(p => ({ ...p, department_id: e.target.value }))}>
                  <option value="">— Select —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Job Type">
                <select style={S.input} value={jobForm.job_type} onChange={e => setJobForm(p => ({ ...p, job_type: e.target.value as any }))}>
                  {Object.entries(JOB_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Location">
                <input style={S.input} value={jobForm.location} onChange={e => setJobForm(p => ({ ...p, location: e.target.value }))} />
              </Field>
              <Field label="Vacancies">
                <input type="number" min={1} style={S.input} value={jobForm.vacancies}
                  onChange={e => setJobForm(p => ({ ...p, vacancies: parseInt(e.target.value) || 1 }))} />
              </Field>
              <Field label="Salary Min (KES)">
                <input type="number" style={S.input} value={jobForm.salary_min} onChange={e => setJobForm(p => ({ ...p, salary_min: e.target.value }))} placeholder="e.g. 50000" />
              </Field>
              <Field label="Salary Max (KES)">
                <input type="number" style={S.input} value={jobForm.salary_max} onChange={e => setJobForm(p => ({ ...p, salary_max: e.target.value }))} placeholder="e.g. 80000" />
              </Field>
              <Field label="Closing Date">
                <input type="date" style={S.input} value={jobForm.closing_date} onChange={e => setJobForm(p => ({ ...p, closing_date: e.target.value }))} />
              </Field>
              <Field label="Status">
                <select style={S.input} value={jobForm.status} onChange={e => setJobForm(p => ({ ...p, status: e.target.value as any }))}>
                  <option value="draft">Draft</option>
                  <option value="open">Open — Accepting Applications</option>
                  <option value="closed">Closed</option>
                  <option value="filled">Filled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" id="is_internal" checked={jobForm.is_internal}
                    onChange={e => setJobForm(p => ({ ...p, is_internal: e.target.checked }))} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>Internal Posting Only</span>
                </label>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', paddingLeft: 22 }}>
                  {jobForm.is_internal
                    ? '🔒 Visible to logged-in staff only'
                    : '🌐 Visible on the public careers page at /careers'}
                </div>
              </div>
            </div>

            <Field label="Job Description">
              <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={jobForm.description}
                onChange={e => setJobForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the role and its purpose…" />
            </Field>
            <Field label="Key Responsibilities">
              <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={jobForm.responsibilities}
                onChange={e => setJobForm(p => ({ ...p, responsibilities: e.target.value }))} placeholder="List main duties…" />
            </Field>
            <Field label="Requirements & Qualifications">
              <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} value={jobForm.requirements}
                onChange={e => setJobForm(p => ({ ...p, requirements: e.target.value }))} placeholder="Education, experience, skills…" />
            </Field>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, paddingTop: 16, borderTop: '1px solid var(--gray-200)' }}>
              <button style={S.btnSecondary} onClick={() => setShowJobModal(false)}>Cancel</button>
              <button style={S.btnPrimary} onClick={saveJob}>{editingJob ? 'Save Changes' : 'Create Posting'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── APPLICATION MODAL ────────────────────────────────────────────────── */}
      {showAppModal && selectedApp && (
        <div style={S.overlay} onClick={() => setShowAppModal(false)}>
          <div style={S.modal(580)} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>{selectedApp.full_name}</h2>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 2 }}>{selectedApp.email}{selectedApp.phone ? ` · ${selectedApp.phone}` : ''}</div>
              </div>
              <button onClick={() => setShowAppModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--gray-400)' }}>×</button>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <Badge status={selectedApp.status} />
              {selectedApp.applicant_type === 'internal' && <Badge status="shortlisted" />}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {selectedApp.current_position && <div><div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Current Role</div><div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{selectedApp.current_position}</div></div>}
              {selectedApp.current_employer && <div><div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Employer</div><div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{selectedApp.current_employer}</div></div>}
              {selectedApp.years_experience != null && <div><div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Experience</div><div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{selectedApp.years_experience} years</div></div>}
              <div><div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Applied</div><div style={{ fontSize: 14, color: 'var(--gray-800)' }}>{new Date(selectedApp.applied_at).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
            </div>

            {selectedApp.cover_letter && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Cover Letter</div>
                <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', color: 'var(--gray-700)' }}>
                  {selectedApp.cover_letter}
                </div>
              </div>
            )}

            {selectedApp.cv_url && (
              <a href={selectedApp.cv_url} target="_blank" rel="noreferrer"
                style={{ ...S.btnSecondary, display: 'inline-block', marginBottom: 16, fontSize: 13, textDecoration: 'none' }}>
                📄 View CV / Resume
              </a>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <Field label="Screening Score (0-100)">
                <input type="number" min={0} max={100} style={S.input} defaultValue={selectedApp.screening_score ?? ''}
                  onBlur={async e => { const v = parseInt(e.target.value); if (!isNaN(v)) await supabase.from('job_applications').update({ screening_score: v }).eq('id', selectedApp.id); }} />
              </Field>
              <Field label="Interview Score (0-100)">
                <input type="number" min={0} max={100} style={S.input} defaultValue={selectedApp.interview_score ?? ''}
                  onBlur={async e => { const v = parseInt(e.target.value); if (!isNaN(v)) await supabase.from('job_applications').update({ interview_score: v }).eq('id', selectedApp.id); }} />
              </Field>
            </div>
            <Field label="HR Notes (internal)">
              <textarea style={{ ...S.input, resize: 'vertical' }} rows={3} defaultValue={selectedApp.hr_notes ?? ''}
                onBlur={async e => { await supabase.from('job_applications').update({ hr_notes: e.target.value }).eq('id', selectedApp.id); }}
                placeholder="Notes visible to HR only…" />
            </Field>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 16, borderTop: '1px solid var(--gray-200)', marginTop: 8 }}>
              {selectedApp.status === 'applied' && <button style={S.btnPrimary} onClick={() => updateAppStatus(selectedApp.id, 'shortlisted')}>✓ Shortlist</button>}
              {selectedApp.status === 'shortlisted' && (
                <button style={S.btnPrimary} onClick={() => { setShowAppModal(false); openInterviews(selectedApp); }}>📅 Schedule Interview</button>
              )}
              {selectedApp.status === 'interviewed' && <button style={S.btnPrimary} onClick={() => updateAppStatus(selectedApp.id, 'offered')}>📧 Make Offer</button>}
              {selectedApp.status === 'offered' && <button style={S.btnPrimary} onClick={() => updateAppStatus(selectedApp.id, 'accepted')}>✅ Mark Accepted</button>}
              {!['rejected','withdrawn','accepted'].includes(selectedApp.status) && (
                <button style={S.btnDanger} onClick={() => {
                  const reason = window.prompt('Reason for rejection (optional):') ?? '';
                  updateAppStatus(selectedApp.id, 'rejected', { rejection_reason: reason });
                  setShowAppModal(false);
                }}>✕ Reject</button>
              )}
              <button style={{ ...S.btnSecondary, marginLeft: 'auto' }} onClick={() => setShowAppModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── INTERVIEW MODAL ──────────────────────────────────────────────────── */}
      {showInterviewModal && selectedApp && (
        <div style={S.overlay} onClick={() => setShowInterviewModal(false)}>
          <div style={S.modal(520)} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
                Interviews — {selectedApp.full_name}
              </h2>
              <button onClick={() => setShowInterviewModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: 'var(--gray-400)' }}>×</button>
            </div>

            {interviews.length === 0 ? (
              <p style={{ color: 'var(--gray-400)', textAlign: 'center', padding: '20px 0' }}>No interviews scheduled yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {interviews.map(iv => (
                  <div key={iv.id} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12, border: '1px solid var(--gray-200)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>Round {iv.round_number} — {iv.interview_type}</span>
                      <Badge status={iv.status} />
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 4 }}>
                      {new Date(iv.scheduled_at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {iv.duration_minutes} min{iv.location ? ` · ${iv.location}` : ''}
                    </div>
                    {iv.score != null && <div style={{ fontSize: 12, marginTop: 4, color: 'var(--primary-600)', fontWeight: 600 }}>Score: {iv.score}/100{iv.recommendation ? ` · ${iv.recommendation}` : ''}</div>}
                  </div>
                ))}
              </div>
            )}

            <ScheduleInterviewForm
              applicationId={selectedApp.id}
              nextRound={(interviews.length ?? 0) + 1}
              onSaved={async () => {
                await updateAppStatus(selectedApp.id, 'interview_scheduled');
                const { data } = await supabase.from('interview_schedules').select('*').eq('application_id', selectedApp.id).order('scheduled_at');
                setInterviews(data ?? []);
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--gray-200)', marginTop: 8 }}>
              <button style={S.btnSecondary} onClick={() => setShowInterviewModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Schedule Interview Sub-form ──────────────────────────────────────────────
function ScheduleInterviewForm({ applicationId, nextRound, onSaved }: {
  applicationId: string; nextRound: number; onSaved: () => void;
}) {
  const [form, setForm] = useState({ interview_type: 'panel', scheduled_at: '', duration_minutes: 60, location: '' });
  const [saving, setSaving] = useState(false);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--gray-300)',
    borderRadius: 6, fontSize: 14, outline: 'none', background: 'var(--gray-50)', boxSizing: 'border-box',
  };

  const save = async () => {
    if (!form.scheduled_at) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('interview_schedules').insert({
      application_id: applicationId, round_number: nextRound,
      interview_type: form.interview_type, scheduled_at: form.scheduled_at,
      duration_minutes: form.duration_minutes, location: form.location || null,
      created_by: user!.id,
    });
    setSaving(false);
    setForm({ interview_type: 'panel', scheduled_at: '', duration_minutes: 60, location: '' });
    onSaved();
  };

  return (
    <div style={{ paddingTop: 16, borderTop: '1px solid var(--gray-200)' }}>
      <div style={{ fontWeight: 600, color: 'var(--gray-800)', marginBottom: 12 }}>Schedule Round {nextRound}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>Type</label>
          <select style={inputStyle} value={form.interview_type} onChange={e => setForm(p => ({ ...p, interview_type: e.target.value }))}>
            {['phone','video','panel','technical','hr','final'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>Duration (min)</label>
          <input type="number" style={inputStyle} value={form.duration_minutes} onChange={e => setForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) || 60 }))} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>Date & Time *</label>
          <input type="datetime-local" style={inputStyle} value={form.scheduled_at} onChange={e => setForm(p => ({ ...p, scheduled_at: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', marginBottom: 4 }}>Location / Link</label>
          <input style={inputStyle} value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Room or video link" />
        </div>
      </div>
      <button disabled={!form.scheduled_at || saving} onClick={save}
        style={{ padding: '8px 16px', background: form.scheduled_at ? 'var(--primary-600)' : 'var(--gray-300)',
          color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
          cursor: form.scheduled_at ? 'pointer' : 'not-allowed' }}>
        {saving ? 'Scheduling…' : `Schedule Round ${nextRound}`}
      </button>
    </div>
  );
}

export default RecruitmentManagement;
