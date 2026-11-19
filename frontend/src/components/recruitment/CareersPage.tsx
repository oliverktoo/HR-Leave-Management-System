// CareersPage — public-facing FKF careers portal.
// Colours: Black #000000, Red #CE1126, Green #006B3F, White #FFFFFF (from footballkenya.org)

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';

// ─── FKF Brand Palette (accurate — no gold) ───────────────────────────────────
const FKF = {
  black:      '#000000',
  blackSoft:  '#0D0D0D',
  red:        '#CE1126',
  redDark:    '#A50E1F',
  redPale:    '#fde8eb',
  green:      '#006B3F',
  greenDark:  '#004D2C',
  greenLight: '#008A50',
  greenPale:  '#e6f4ee',
  white:      '#FFFFFF',
  offWhite:   '#F7F8F8',
  grayLight:  '#F3F4F6',
  grayBorder: '#E5E7EB',
  grayMid:    '#9CA3AF',
  grayText:   '#4B5563',
  grayDark:   '#1F2937',
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface PublicJob {
  id: string;
  title: string;
  departments?: { name: string } | null;
  job_type: string;
  location: string;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  salary_min: number | null;
  salary_max: number | null;
  closing_date: string | null;
  vacancies: number;
  created_at: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full Time', part_time: 'Part Time', contract: 'Contract',
  internship: 'Internship', casual: 'Casual',
};


const emptyForm = {
  full_name: '', email: '', phone: '',
  current_employer: '', current_position: '',
  years_experience: '', cover_letter: '', portfolio_url: '',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export function CareersPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [applyJob, setApplyJob] = useState<PublicJob | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('job_postings')
      .select('*, departments(name)')
      .order('created_at', { ascending: false });
    setJobs(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const filtered = jobs.filter(j => {
    const matchSearch = !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.departments as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || j.job_type === typeFilter;
    return matchSearch && matchType;
  });

  const isExpired = (date: string | null) => date ? new Date(date) < new Date() : false;

  const openApply = (job: PublicJob) => {
    setApplyJob(job);
    setForm(emptyForm);
    setCvFile(null);
    setSubmitError('');
    setSubmitted(false);
  };

  const submitApplication = async () => {
    if (!form.full_name.trim() || !form.email.trim())
      return setSubmitError('Full name and email address are required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return setSubmitError('Please enter a valid email address');
    if (!applyJob) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      let cv_url: string | null = null;
      if (cvFile) {
        const ext = cvFile.name.split('.').pop();
        const path = `external/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('recruitment-docs').upload(path, cvFile, { contentType: cvFile.type });
        if (uploadErr) throw new Error(`CV upload failed: ${uploadErr.message}`);
        cv_url = path;
      }

      const { error: appErr } = await supabase.from('job_applications').insert({
        job_posting_id: applyJob.id,
        applicant_type: 'external',
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        current_employer: form.current_employer.trim() || null,
        current_position: form.current_position.trim() || null,
        years_experience: form.years_experience ? parseInt(form.years_experience) : null,
        cover_letter: form.cover_letter.trim() || null,
        portfolio_url: form.portfolio_url.trim() || null,
        cv_url,
      });

      if (appErr) {
        if (appErr.code === '23505')
          throw new Error('You have already applied for this position with this email address.');
        throw appErr;
      }
      setSubmitted(true);
    } catch (e: any) {
      setSubmitError(e.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: FKF.white, minHeight: '100vh' }}>

      {/* ── STICKY NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? 'rgba(0,0,0,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
        transition: 'all 0.3s',
        padding: '0 40px', height: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <img src="/fkf-logo.png" alt="FKF Logo"
            style={{ width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: FKF.white }}>Football Kenya Federation</div>
            <div style={{ fontSize: 11, color: FKF.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Careers</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/')} style={{
            padding: '8px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', color: FKF.white,
            border: '1px solid rgba(255,255,255,0.15)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>← Home</button>
          <button onClick={() => navigate('/login')} style={{
            padding: '8px 18px', borderRadius: 8,
            background: FKF.red, color: FKF.white,
            border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Staff Sign In</button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{
        background: `linear-gradient(155deg, #1a1a1a 0%, #1f1f1f 50%, #142010 100%)`,
        padding: '140px 40px 80px', textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <FieldLines />

        {/* FKF logo watermark */}
        <img src="/fkf-logo.png" alt=""
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '110%', maxWidth: 940, objectFit: 'contain',
            opacity: 0.13, pointerEvents: 'none', userSelect: 'none',
          }} />

        {/* Kenya tricolour top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', height: 5 }}>
          <div style={{ flex: 1, background: FKF.black }} />
          <div style={{ flex: 1, background: FKF.red }} />
          <div style={{ flex: 1, background: FKF.white }} />
          <div style={{ flex: 1, background: FKF.green }} />
        </div>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(206,17,38,0.12)', border: `1px solid rgba(206,17,38,0.3)`,
          borderRadius: 30, padding: '6px 20px', marginBottom: 24,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: FKF.red, display: 'inline-block' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#ff4d65', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Now Hiring Across Kenya
          </span>
        </div>

        <h1 style={{
          margin: 0, fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 900,
          color: FKF.white, lineHeight: 1.1, letterSpacing: '-1px',
        }}>
          Be Part of{' '}
          <span style={{ color: FKF.red }}>Kenya's Football</span>
          <br />Revolution
        </h1>

        <p style={{
          margin: '20px auto 0', fontSize: 17, color: 'rgba(255,255,255,0.6)',
          maxWidth: 520, lineHeight: 1.75,
        }}>
          Help grow the beautiful game from grassroots to the national stage.
          Explore roles across football administration, coaching, finance, and more.
        </p>

        {/* Search */}
        <div style={{ maxWidth: 540, margin: '40px auto 0', position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)',
            fontSize: 18, color: FKF.grayMid, pointerEvents: 'none',
          }}>🔍</span>
          <input
            style={{
              width: '100%', padding: '14px 20px 14px 50px', borderRadius: 12,
              border: 'none', fontSize: 15, background: 'rgba(255,255,255,0.95)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.3)', outline: 'none',
              boxSizing: 'border-box', color: FKF.grayDark,
            }}
            placeholder="Search by role, department, or location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 40, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap' }}>
          {[
            { value: `${jobs.length}`, label: 'Open Positions' },
            { value: `${new Set(jobs.map(j => (j.departments as any)?.name).filter(Boolean)).size || '—'}`, label: 'Departments Hiring' },
            { value: 'Nationwide', label: 'Coverage' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: FKF.white }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── TRICOLOUR BAND ── */}
      <div style={{ display: 'flex', height: 5 }}>
        <div style={{ flex: 1, background: FKF.black }} />
        <div style={{ flex: 1, background: FKF.red }} />
        <div style={{ flex: 1, background: FKF.white }} />
        <div style={{ flex: 1, background: FKF.green }} />
      </div>

      {/* ── JOBS SECTION ── */}
      <div style={{ background: FKF.offWhite, padding: '56px 40px', minHeight: 400 }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>

          {/* Filter bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: FKF.grayDark }}>Open Positions</h2>
              <p style={{ margin: '4px 0 0', fontSize: 14, color: FKF.grayMid }}>
                {loading ? 'Loading…' : `${filtered.length} position${filtered.length !== 1 ? 's' : ''} available`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['all', ...Object.keys(JOB_TYPE_LABELS)].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  style={{
                    padding: '7px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 600,
                    background: typeFilter === t ? FKF.black : FKF.white,
                    color: typeFilter === t ? FKF.white : FKF.grayText,
                    boxShadow: typeFilter === t ? 'none' : `0 0 0 1px ${FKF.grayBorder}`,
                  }}>
                  {t === 'all' ? 'All Roles' : JOB_TYPE_LABELS[t]}
                </button>
              ))}
              {(search || typeFilter !== 'all') && (
                <button onClick={() => { setSearch(''); setTypeFilter('all'); }}
                  style={{ padding: '7px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, background: FKF.redPale, color: FKF.red, fontWeight: 700 }}>
                  Clear ✕
                </button>
              )}
            </div>
          </div>

          {/* Job list */}
          {loading ? (
            <LoadingGrid />
          ) : filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {filtered.map(job => (
                <JobCard
                  key={job.id}
                  job={job}
                  expanded={expandedJob === job.id}
                  expired={isExpired(job.closing_date)}
                  onToggle={() => setExpandedJob(prev => prev === job.id ? null : job.id)}
                  onApply={() => openApply(job)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── WHY JOIN FKF ── */}
      <div style={{ background: FKF.white, padding: '72px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', textAlign: 'center' }}>
          <img src="/fkf-logo.png" alt="FKF" style={{ width: 64, height: 64, objectFit: 'contain', marginBottom: 20 }} />
          <h2 style={{ margin: 0, fontSize: 30, fontWeight: 800, color: FKF.grayDark }}>
            Why Work at <span style={{ color: FKF.red }}>FKF</span>?
          </h2>
          <p style={{ margin: '12px auto 0', fontSize: 16, color: FKF.grayText, maxWidth: 460, lineHeight: 1.7 }}>
            More than a job — a chance to shape the future of football in Kenya.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 22, marginTop: 44 }}>
            {[
              { num: '01', border: FKF.red,   title: 'National Impact',      desc: "Work on programmes that develop football talent from grassroots to elite level across all 47 counties." },
              { num: '02', border: FKF.green, title: 'Career Growth',        desc: 'Structured progression paths, training, and opportunities to grow within sports administration.' },
              { num: '03', border: FKF.black, title: 'Diverse Teams',        desc: 'Collaborate with passionate colleagues from coaching, finance, media, operations, and beyond.' },
              { num: '04', border: FKF.red,   title: 'Continental Exposure', desc: "FKF's CAF and FIFA partnerships give staff unique exposure to continental football governance." },
            ].map(b => (
              <div key={b.title} style={{
                background: FKF.offWhite, borderRadius: 14, padding: 26,
                border: `1px solid ${FKF.grayBorder}`,
                borderTop: `4px solid ${b.border}`,
                textAlign: 'left',
              }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: b.border, opacity: 0.25, marginBottom: 14, fontFamily: 'monospace' }}>{b.num}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: FKF.grayDark, marginBottom: 8 }}>{b.title}</div>
                <div style={{ fontSize: 14, color: FKF.grayText, lineHeight: 1.7 }}>{b.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer style={{
        background: FKF.black, padding: '36px 40px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/fkf-logo.png" alt="FKF" style={{ width: 38, height: 38, objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: FKF.white }}>Football Kenya Federation</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>© {new Date().getFullYear()} All rights reserved.</div>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
          All applications are handled in strict confidence.
        </div>
      </footer>

      {/* ── APPLY MODAL ── */}
      {applyJob && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200, padding: '20px 16px', backdropFilter: 'blur(4px)',
        }} onClick={() => !submitting && setApplyJob(null)}>
          <div style={{
            background: FKF.white, borderRadius: 18, width: '100%', maxWidth: 620,
            maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
          }} onClick={e => e.stopPropagation()}>

            {submitted ? (
              <div style={{ padding: '56px 40px', textAlign: 'center' }}>
                <img src="/fkf-logo.png" alt="FKF" style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 20 }} />
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: FKF.grayDark }}>Application Received!</h2>
                <p style={{ margin: '14px auto 0', color: FKF.grayText, lineHeight: 1.7, fontSize: 15, maxWidth: 380 }}>
                  Thank you for applying for <strong>{applyJob.title}</strong> at FKF.<br />
                  We'll review your application and be in touch at <strong>{form.email}</strong>.
                </p>
                <div style={{ marginTop: 20, padding: '10px 20px', background: FKF.greenPale, borderRadius: 8, display: 'inline-block' }}>
                  <span style={{ fontSize: 13, color: FKF.green, fontWeight: 600 }}>✓ Application successfully submitted</span>
                </div>
                <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center' }}>
                  <button onClick={() => setApplyJob(null)}
                    style={{ padding: '11px 28px', borderRadius: 10, border: 'none', background: FKF.green, color: FKF.white, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                    Done
                  </button>
                  <button onClick={() => { setApplyJob(null); navigate('/'); }}
                    style={{ padding: '11px 22px', borderRadius: 10, border: `1px solid ${FKF.grayBorder}`, background: FKF.white, color: FKF.grayText, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                    Back to Home
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Modal header */}
                <div style={{
                  background: FKF.black,
                  padding: '24px 28px', borderRadius: '18px 18px 0 0',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <img src="/fkf-logo.png" alt="FKF" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <div style={{ fontSize: 11, color: FKF.red, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                        FKF — Apply Now
                      </div>
                      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: FKF.white }}>{applyJob.title}</h2>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 3 }}>
                        {(applyJob.departments as any)?.name ?? 'FKF'} · {JOB_TYPE_LABELS[applyJob.job_type]} · {applyJob.location}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setApplyJob(null)}
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', fontSize: 16, color: FKF.white, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>

                {/* Kenya flag accent stripe */}
                <div style={{ display: 'flex', height: 4 }}>
                  <div style={{ flex: 1, background: FKF.black }} />
                  <div style={{ flex: 1, background: FKF.red }} />
                  <div style={{ flex: 1, background: FKF.white }} />
                  <div style={{ flex: 1, background: FKF.green }} />
                </div>

                {/* Form body */}
                <div style={{ padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {submitError && (
                    <div style={{ background: FKF.redPale, color: FKF.red, borderRadius: 10, padding: '12px 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {submitError}
                    </div>
                  )}

                  <FormSection title="Personal Details">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <FLabel req>Full Name</FLabel>
                        <FInput value={form.full_name} onChange={v => setForm(p => ({ ...p, full_name: v }))} placeholder="Your full legal name" />
                      </div>
                      <div>
                        <FLabel req>Email Address</FLabel>
                        <FInput type="email" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} placeholder="you@example.com" />
                      </div>
                      <div>
                        <FLabel>Phone Number</FLabel>
                        <FInput type="tel" value={form.phone} onChange={v => setForm(p => ({ ...p, phone: v }))} placeholder="+254 7XX XXX XXX" />
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Professional Background">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <FLabel>Current Employer</FLabel>
                        <FInput value={form.current_employer} onChange={v => setForm(p => ({ ...p, current_employer: v }))} placeholder="Organisation name" />
                      </div>
                      <div>
                        <FLabel>Current Job Title</FLabel>
                        <FInput value={form.current_position} onChange={v => setForm(p => ({ ...p, current_position: v }))} placeholder="e.g. Finance Officer" />
                      </div>
                      <div>
                        <FLabel>Years of Experience</FLabel>
                        <FInput type="number" value={form.years_experience} onChange={v => setForm(p => ({ ...p, years_experience: v }))} placeholder="e.g. 5" />
                      </div>
                      <div>
                        <FLabel>LinkedIn / Portfolio URL</FLabel>
                        <FInput value={form.portfolio_url} onChange={v => setForm(p => ({ ...p, portfolio_url: v }))} placeholder="https://linkedin.com/in/…" />
                      </div>
                    </div>
                  </FormSection>

                  <FormSection title="Your Application">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div>
                        <FLabel>Cover Letter</FLabel>
                        <textarea
                          style={{
                            width: '100%', padding: '11px 14px', border: `1px solid ${FKF.grayBorder}`,
                            borderRadius: 10, fontSize: 14, resize: 'vertical', boxSizing: 'border-box',
                            fontFamily: 'inherit', lineHeight: 1.6, color: FKF.grayDark, minHeight: 110,
                          }}
                          placeholder={`Tell us why you want to join FKF and what makes you right for the ${applyJob.title} role…`}
                          value={form.cover_letter}
                          onChange={e => setForm(p => ({ ...p, cover_letter: e.target.value }))}
                        />
                      </div>

                      {/* CV Upload */}
                      <div>
                        <FLabel>CV / Resume</FLabel>
                        <div onClick={() => document.getElementById('fkf-cv-upload')?.click()}
                          style={{
                            border: `2px dashed ${cvFile ? FKF.green : FKF.grayBorder}`,
                            borderRadius: 12, padding: '20px 24px', cursor: 'pointer', textAlign: 'center',
                            background: cvFile ? FKF.greenPale : FKF.offWhite, transition: 'all 0.2s',
                          }}>
                          <input id="fkf-cv-upload" type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              if (f.size > 5 * 1024 * 1024) { setSubmitError('File must be under 5 MB'); return; }
                              setCvFile(f); setSubmitError('');
                            }} />
                          {cvFile ? (
                            <div>
                              <div style={{ fontSize: 28, marginBottom: 6 }}>📎</div>
                              <div style={{ fontWeight: 700, color: FKF.green, fontSize: 14 }}>{cvFile.name}</div>
                              <div style={{ fontSize: 12, color: FKF.grayMid, marginTop: 2 }}>{(cvFile.size / 1024).toFixed(0)} KB</div>
                              <button onClick={e => { e.stopPropagation(); setCvFile(null); }}
                                style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: FKF.red, fontSize: 12, fontWeight: 600 }}>
                                Remove file
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                              <div style={{ fontWeight: 600, color: FKF.grayText, fontSize: 14 }}>Click to upload your CV</div>
                              <div style={{ fontSize: 12, color: FKF.grayMid, marginTop: 4 }}>PDF or DOCX · max 5 MB · optional but recommended</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </FormSection>
                </div>

                {/* Footer */}
                <div style={{
                  padding: '16px 28px', borderTop: `1px solid ${FKF.grayBorder}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ fontSize: 12, color: FKF.grayMid }}>Handled in strict confidence</div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setApplyJob(null)}
                      style={{ padding: '10px 20px', borderRadius: 9, border: `1px solid ${FKF.grayBorder}`, background: FKF.white, color: FKF.grayText, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button onClick={submitApplication} disabled={submitting}
                      style={{
                        padding: '10px 26px', borderRadius: 9, border: 'none',
                        background: submitting ? FKF.grayMid : FKF.green,
                        color: FKF.white, fontSize: 14, fontWeight: 700,
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        boxShadow: submitting ? 'none' : '0 4px 14px rgba(0,107,63,0.35)',
                      }}>
                      {submitting ? 'Submitting…' : 'Submit Application →'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Job Card ─────────────────────────────────────────────────────────────────
function JobCard({ job, expanded, expired, onToggle, onApply }: {
  job: PublicJob; expanded: boolean; expired: boolean;
  onToggle: () => void; onApply: () => void;
}) {
  const deptName = (job.departments as any)?.name ?? 'General';
  const closingSoon = job.closing_date && !expired &&
    (new Date(job.closing_date).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;

  return (
    <div style={{
      background: FKF.white, borderRadius: 14,
      border: `1px solid ${expanded ? FKF.black : FKF.grayBorder}`,
      borderLeft: `4px solid ${expired ? FKF.grayMid : expanded ? FKF.red : FKF.green}`,
      boxShadow: expanded ? '0 4px 24px rgba(0,0,0,0.1)' : '0 1px 4px rgba(0,0,0,0.05)',
      overflow: 'hidden', transition: 'all 0.2s',
    }}>
      {/* Card header */}
      <div style={{ padding: '20px 22px', cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: FKF.grayDark }}>{job.title}</span>
              {closingSoon && (
                <span style={{ fontSize: 11, fontWeight: 700, background: FKF.redPale, color: FKF.red, borderRadius: 20, padding: '2px 10px' }}>
                  ⚡ Closing soon
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 13, color: FKF.grayMid, flexWrap: 'wrap' }}>
              <span>{deptName}</span>
              <span>{job.location}</span>
              <span style={{ background: FKF.grayLight, borderRadius: 20, padding: '2px 10px', color: FKF.grayText, fontWeight: 500 }}>
                {JOB_TYPE_LABELS[job.job_type]}
              </span>
              <span>{job.vacancies} {job.vacancies === 1 ? 'vacancy' : 'vacancies'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: FKF.greenPale, color: FKF.green }}>
              ● Open
            </span>
            {(job.salary_min || job.salary_max) && (
              <span style={{ fontSize: 13, fontWeight: 700, color: FKF.grayDark }}>
                KES {job.salary_min?.toLocaleString() ?? '?'}–{job.salary_max?.toLocaleString() ?? '?'}
              </span>
            )}
          </div>
        </div>
        {job.closing_date && (
          <div style={{ marginTop: 10, fontSize: 12, color: expired ? FKF.red : FKF.grayMid }}>
            {expired
              ? 'Applications closed'
              : `Apply by ${new Date(job.closing_date).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'long', year: 'numeric' })}`
            }
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 22px 20px', borderTop: `1px solid ${FKF.grayBorder}` }}>
          {job.description && <DetailSection title="About the Role" content={job.description} color={FKF.red} />}
          {job.responsibilities && <DetailSection title="Key Responsibilities" content={job.responsibilities} color={FKF.green} />}
          {job.requirements && <DetailSection title="Requirements & Qualifications" content={job.requirements} color={FKF.black} />}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '14px 22px', borderTop: `1px solid ${FKF.grayBorder}`,
        background: expanded ? '#fafafa' : FKF.offWhite,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: FKF.green, fontWeight: 700, padding: 0,
        }}>
          {expanded ? '▲ Hide details' : '▼ View full description'}
        </button>
        <button onClick={onApply} disabled={expired}
          style={{
            padding: '10px 24px', borderRadius: 9, border: 'none',
            background: expired ? FKF.grayBorder : FKF.green,
            color: expired ? FKF.grayMid : FKF.white,
            fontSize: 14, fontWeight: 700, cursor: expired ? 'not-allowed' : 'pointer',
            boxShadow: expired ? 'none' : '0 4px 14px rgba(0,107,63,0.35)',
          }}>
          {expired ? 'Applications Closed' : 'Apply Now →'}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function DetailSection({ title, content, color }: { title: string; content: string; color: string }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{ width: 3, height: 14, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{title}</span>
      </div>
      <div style={{ fontSize: 14, color: FKF.grayText, lineHeight: 1.75, whiteSpace: 'pre-line', paddingLeft: 11 }}>{content}</div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 12, fontWeight: 800, color: FKF.black, textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 14, paddingBottom: 8,
        borderBottom: `2px solid ${FKF.grayLight}`,
      }}>{title}</div>
      {children}
    </div>
  );
}

function FLabel({ children, req }: { children: React.ReactNode; req?: boolean }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: FKF.grayDark, marginBottom: 5 }}>
      {children}{req && <span style={{ color: FKF.red, marginLeft: 3 }}>*</span>}
    </div>
  );
}

function FInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', border: `1px solid ${FKF.grayBorder}`,
        borderRadius: 9, fontSize: 14, boxSizing: 'border-box',
        color: FKF.grayDark, fontFamily: 'inherit', outline: 'none',
      }} />
  );
}

function FieldLines() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', opacity: 0.045, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, height: 380, borderRadius: '50%', border: '2px solid #fff' }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: '#fff' }} />
      <div style={{ position: 'absolute', top: '10%', left: '-90px', width: 250, height: 250, borderRadius: '50%', border: '2px solid #fff' }} />
      <div style={{ position: 'absolute', bottom: '10%', right: '-90px', width: 250, height: 250, borderRadius: '50%', border: '2px solid #fff' }} />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: FKF.white, borderRadius: 14, height: 100,
          border: `1px solid ${FKF.grayBorder}`, borderLeft: `4px solid ${FKF.grayBorder}`,
          animation: 'pulse 1.5s infinite',
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}`}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 0' }}>
      <img src="/fkf-logo.png" alt="FKF" style={{ width: 64, opacity: 0.3, marginBottom: 20 }} />
      <div style={{ fontSize: 20, fontWeight: 700, color: FKF.grayDark, marginBottom: 10 }}>No positions found</div>
      <div style={{ fontSize: 15, color: FKF.grayMid }}>Try adjusting your search or check back soon — new roles are added regularly.</div>
    </div>
  );
}

export default CareersPage;
