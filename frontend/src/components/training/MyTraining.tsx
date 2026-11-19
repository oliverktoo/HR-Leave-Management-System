import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  getMyTraining,
  getMySkills,
  type EmployeeTraining,
  type EmployeeSkill,
} from '../../services/trainingService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtStatus = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const statusStyle = (status: EmployeeTraining['status']): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    enrolled:    { background: '#dbeafe', color: '#1d4ed8' },
    in_progress: { background: '#fef9c3', color: '#a16207' },
    completed:   { background: '#dcfce7', color: '#15803d' },
    failed:      { background: '#fee2e2', color: '#b91c1c' },
    cancelled:   { background: '#f3f4f6', color: '#4b5563' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

const Stars = ({ value, max = 5 }: { value: number; max?: number }) => (
  <span style={{ color: '#f59e0b', fontSize: '1.15rem', letterSpacing: 2 }}>
    {Array.from({ length: max }, (_, i) => (i < value ? '★' : '☆')).join('')}
  </span>
);

const fmtCat = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

// ─── Component ────────────────────────────────────────────────────────────────

export function MyTraining() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'training' | 'skills'>('training');

  // Training state
  const [records, setRecords] = useState<EmployeeTraining[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');

  // Skills state
  const [skills, setSkills] = useState<EmployeeSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillsError, setSkillsError] = useState('');

  useEffect(() => {
    loadTraining();
    loadSkills();
  }, []);

  const loadTraining = async () => {
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const data = await getMyTraining();
      setRecords(data);
    } catch (e: any) {
      setRecordsError(e.message ?? 'Failed to load training records.');
    } finally {
      setRecordsLoading(false);
    }
  };

  const loadSkills = async () => {
    setSkillsLoading(true);
    setSkillsError('');
    try {
      const data = await getMySkills();
      setSkills(data);
    } catch (e: any) {
      setSkillsError(e.message ?? 'Failed to load skills.');
    } finally {
      setSkillsLoading(false);
    }
  };

  // Group skills by category
  const skillsByCategory = useMemo(() => {
    const grouped: Record<string, EmployeeSkill[]> = {};
    for (const skill of skills) {
      const cat = fmtCat(skill.skill_category);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(skill);
    }
    return grouped;
  }, [skills]);

  // Stats
  const totalCourses   = records.length;
  const completed      = records.filter((r) => r.status === 'completed').length;
  const inProgress     = records.filter((r) => r.status === 'in_progress').length;
  const totalSkills    = skills.length;

  // ─── Styles ──────────────────────────────────────────────────────────────────

  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: 'var(--gray-50)',
    padding: '2rem',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.6rem 1.25rem',
    border: 'none',
    borderBottom: active ? '2px solid var(--primary-600)' : '2px solid transparent',
    background: 'none',
    cursor: 'pointer',
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--primary-600)' : 'var(--gray-500)',
    fontSize: '0.95rem',
    transition: 'all 0.15s',
  });

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid var(--gray-200)',
    borderRadius: 10,
    padding: '1.25rem',
  };

  const statCard: React.CSSProperties = {
    ...card,
    textAlign: 'center' as const,
    flex: 1,
    minWidth: 120,
  };

  const trainingCard: React.CSSProperties = {
    background: '#fff',
    border: '1px solid var(--gray-200)',
    borderRadius: 10,
    padding: '1.25rem 1.5rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const displayName = profile
    ? `${(profile as any).first_name ?? ''} ${(profile as any).last_name ?? ''}`.trim()
    : 'Employee';

  return (
    <div style={page}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: '1px solid var(--gray-200)',
              borderRadius: 8,
              padding: '0.4rem 0.85rem',
              cursor: 'pointer',
              fontSize: '1rem',
              color: 'var(--gray-600)',
              fontWeight: 600,
            }}
            aria-label="Go back"
          >
            ← Back
          </button>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              My Training &amp; Skills
            </h1>
            <p style={{ color: 'var(--gray-500)', marginTop: 2, marginBottom: 0 }}>
              {displayName} · Training history and skills profile
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={statCard}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-600)' }}>{totalCourses}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2 }}>Total Courses</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#15803d' }}>{completed}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2 }}>Completed</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#a16207' }}>{inProgress}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2 }}>In Progress</div>
          </div>
          <div style={statCard}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed' }}>{totalSkills}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--gray-500)', marginTop: 2 }}>Skills Logged</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--gray-200)',
          marginBottom: '1.5rem',
          background: '#fff',
          borderRadius: '10px 10px 0 0',
          paddingTop: '0.25rem',
        }}>
          <button style={tabStyle(activeTab === 'training')} onClick={() => setActiveTab('training')}>
            My Training
          </button>
          <button style={tabStyle(activeTab === 'skills')} onClick={() => setActiveTab('skills')}>
            My Skills
          </button>
        </div>

        {/* ── My Training Tab ──────────────────────────────────────────────── */}
        {activeTab === 'training' && (
          <div>
            {recordsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                Loading your training records…
              </div>
            ) : recordsError ? (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '1rem', borderRadius: 8 }}>
                {recordsError}
              </div>
            ) : records.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>📚</div>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)' }}>No training records yet</div>
                <div style={{ fontSize: '0.9rem', marginTop: 4 }}>Your HR team will add training records here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {records.map((r) => (
                  <div key={r.id} style={trainingCard}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--gray-900)' }}>
                          {r.course_title}
                        </div>
                        {r.provider && (
                          <div style={{ color: 'var(--gray-500)', fontSize: '0.88rem', marginTop: 2 }}>
                            {r.provider}
                          </div>
                        )}
                      </div>
                      <span style={{
                        ...statusStyle(r.status),
                        padding: '0.25rem 0.75rem',
                        borderRadius: 20,
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap' as const,
                        flexShrink: 0,
                      }}>
                        {fmtStatus(r.status)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                      <div style={{ fontSize: '0.88rem', color: 'var(--gray-600)' }}>
                        <span style={{ fontWeight: 600 }}>Start: </span>
                        {fmtDate(r.training_date)}
                      </div>
                      {r.completion_date && (
                        <div style={{ fontSize: '0.88rem', color: 'var(--gray-600)' }}>
                          <span style={{ fontWeight: 600 }}>Completed: </span>
                          {fmtDate(r.completion_date)}
                        </div>
                      )}
                      {r.status === 'completed' && r.score != null && (
                        <div style={{ fontSize: '0.88rem' }}>
                          <span style={{ fontWeight: 600, color: 'var(--gray-600)' }}>Score: </span>
                          <span style={{
                            fontWeight: 700,
                            color: r.score >= 75 ? '#15803d' : r.score >= 50 ? '#a16207' : '#b91c1c',
                          }}>
                            {r.score}%
                          </span>
                        </div>
                      )}
                      {r.cost != null && (
                        <div style={{ fontSize: '0.88rem', color: 'var(--gray-600)' }}>
                          <span style={{ fontWeight: 600 }}>Cost: </span>
                          {r.cost_currency} {Number(r.cost).toLocaleString()}
                        </div>
                      )}
                    </div>

                    {r.notes && (
                      <div style={{
                        fontSize: '0.85rem',
                        color: 'var(--gray-500)',
                        background: 'var(--gray-50)',
                        padding: '0.5rem 0.75rem',
                        borderRadius: 6,
                        marginTop: '0.25rem',
                      }}>
                        {r.notes}
                      </div>
                    )}

                    {r.certificate_url && (
                      <div style={{ marginTop: '0.25rem' }}>
                        <a
                          href={r.certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--primary-600)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}
                        >
                          View Certificate →
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My Skills Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <div>
            {skillsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                Loading your skills…
              </div>
            ) : skillsError ? (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '1rem', borderRadius: 8 }}>
                {skillsError}
              </div>
            ) : skills.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎯</div>
                <div style={{ fontWeight: 600, color: 'var(--gray-600)' }}>No skills recorded yet</div>
                <div style={{ fontSize: '0.9rem', marginTop: 4 }}>Your HR team will add your skills here.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {Object.entries(skillsByCategory).map(([category, catSkills]) => (
                  <div key={category} style={card}>
                    {/* Category header */}
                    <div style={{
                      fontWeight: 700,
                      color: 'var(--primary-600)',
                      fontSize: '0.9rem',
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.07em',
                      marginBottom: '0.875rem',
                      paddingBottom: '0.5rem',
                      borderBottom: '1px solid var(--gray-100)',
                    }}>
                      {category}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {catSkills.map((s) => (
                        <div key={s.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          flexWrap: 'wrap',
                          padding: '0.5rem 0',
                          borderBottom: '1px solid var(--gray-50)',
                        }}>
                          <div style={{ flex: '1 1 180px', fontWeight: 600, color: 'var(--gray-800)', fontSize: '0.95rem' }}>
                            {s.skill_name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Stars value={s.proficiency} />
                            <span style={{ fontSize: '0.82rem', color: 'var(--gray-400)' }}>
                              {s.proficiency}/5
                            </span>
                          </div>
                          {s.certified && (
                            <span style={{
                              background: '#dbeafe',
                              color: '#1d4ed8',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              padding: '0.2rem 0.55rem',
                              borderRadius: 20,
                              whiteSpace: 'nowrap' as const,
                            }}>
                              Certified{s.certification_body ? ` · ${s.certification_body}` : ''}
                            </span>
                          )}
                          {s.expiry_date && (
                            <span style={{
                              fontSize: '0.8rem',
                              color: new Date(s.expiry_date) < new Date() ? '#b91c1c' : 'var(--gray-500)',
                              whiteSpace: 'nowrap' as const,
                            }}>
                              Expires {fmtDate(s.expiry_date)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
