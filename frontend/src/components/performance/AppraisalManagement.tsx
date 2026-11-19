import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getAppraisalCycles,
  createAppraisalCycle,
  updateAppraisalCycle,
  getAppraisalsByCycle,
  enrolAllInCycle,
  type AppraisalCycle,
  type EmployeeAppraisal,
  type KPI,
} from '../../services/performanceService';

// ── Badge helpers ──────────────────────────────────────────────────────────
const cycleBadge = (status: AppraisalCycle['status']): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    draft:     { background: '#f3f4f6', color: '#4b5563' },
    active:    { background: '#dbeafe', color: '#1d4ed8' },
    completed: { background: '#dcfce7', color: '#15803d' },
    archived:  { background: '#f3f4f6', color: '#6b7280' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

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

const fmtStatus = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const fmtDate   = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const CYCLE_TYPES: AppraisalCycle['cycle_type'][] = ['annual', 'mid_year', 'quarterly', 'probation'];

export const AppraisalManagement = () => {
  // ── View state ─────────────────────────────────────────────────────────────
  const [selectedCycle, setSelectedCycle] = useState<AppraisalCycle | null>(null);

  // ── Cycles ─────────────────────────────────────────────────────────────────
  const [cycles, setCycles] = useState<AppraisalCycle[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [newCycleError, setNewCycleError] = useState('');
  const [newCycleSaving, setNewCycleSaving] = useState(false);
  const [enrolLoading, setEnrolLoading] = useState<string | null>(null);
  const [enrolMsg, setEnrolMsg] = useState('');

  const [newCycle, setNewCycle] = useState({
    name: '',
    cycle_type: 'annual' as AppraisalCycle['cycle_type'],
    year: new Date().getFullYear(),
    start_date: '',
    end_date: '',
    self_assessment_due: '',
    manager_review_due: '',
  });

  // ── Appraisals ──────────────────────────────────────────────────────────────
  const [appraisals, setAppraisals] = useState<EmployeeAppraisal[]>([]);
  const [appraisalsLoading, setAppraisalsLoading] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterDept, setFilterDept] = useState('all');
  const [viewAppraisal, setViewAppraisal] = useState<EmployeeAppraisal | null>(null);

  useEffect(() => {
    loadCycles();
  }, []);

  useEffect(() => {
    if (selectedCycle) {
      setAppraisalsLoading(true);
      setSearchName('');
      setFilterStatus('all');
      setFilterDept('all');
      getAppraisalsByCycle(selectedCycle.id).then(({ data }) => {
        setAppraisals(data ?? []);
        setAppraisalsLoading(false);
      });
    }
  }, [selectedCycle]);

  const loadCycles = async () => {
    setCyclesLoading(true);
    const { data } = await getAppraisalCycles();
    setCycles(data ?? []);
    setCyclesLoading(false);
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCycleError('');
    if (!newCycle.name.trim()) { setNewCycleError('Cycle name is required.'); return; }
    if (!newCycle.start_date || !newCycle.end_date) { setNewCycleError('Start and end dates are required.'); return; }
    setNewCycleSaving(true);
    const { error } = await createAppraisalCycle({
      name:                 newCycle.name,
      cycle_type:           newCycle.cycle_type,
      year:                 Number(newCycle.year),
      start_date:           newCycle.start_date,
      end_date:             newCycle.end_date,
      self_assessment_due:  newCycle.self_assessment_due || null,
      manager_review_due:   newCycle.manager_review_due || null,
      status:               'draft',
    });
    setNewCycleSaving(false);
    if (error) { setNewCycleError(error.message ?? 'Failed to create cycle.'); return; }
    setShowNewCycle(false);
    setNewCycle({ name: '', cycle_type: 'annual', year: new Date().getFullYear(), start_date: '', end_date: '', self_assessment_due: '', manager_review_due: '' });
    loadCycles();
  };

  const activateCycle = async (cycle: AppraisalCycle) => {
    await updateAppraisalCycle(cycle.id, { status: 'active' });
    loadCycles();
  };

  const archiveCycle = async (cycle: AppraisalCycle) => {
    await updateAppraisalCycle(cycle.id, { status: 'archived' });
    loadCycles();
  };

  const handleEnrol = async (cycleId: string) => {
    setEnrolLoading(cycleId);
    setEnrolMsg('');
    const { count, error } = await enrolAllInCycle(cycleId);
    setEnrolLoading(null);
    if (error) { setEnrolMsg(`Error: ${error.message ?? 'Failed to enrol staff.'}`); return; }
    setEnrolMsg(`${count} employees enrolled successfully.`);
    loadCycles();
    if (selectedCycle?.id === cycleId) {
      const { data } = await getAppraisalsByCycle(cycleId);
      setAppraisals(data ?? []);
    }
  };

  // ── Filtered appraisals ────────────────────────────────────────────────────
  const depts = [...new Set(appraisals.map(a => a.department_name).filter(Boolean))] as string[];
  const filteredAppraisals = appraisals.filter(a => {
    const nameMatch   = (a.employee_name ?? '').toLowerCase().includes(searchName.toLowerCase());
    const statusMatch = filterStatus === 'all' || a.status === filterStatus;
    const deptMatch   = filterDept   === 'all' || a.department_name === filterDept;
    return nameMatch && statusMatch && deptMatch;
  });

  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000, padding: '1rem',
  };
  const modalBox: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: '2rem',
    width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };
  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '0.6rem 0.75rem',
    border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem',
  };
  const labelStyle: React.CSSProperties = {
    fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)',
    display: 'block', marginBottom: 4,
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        {/* ── CYCLES LIST VIEW ──────────────────────────────────────────────── */}
        {!selectedCycle && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
                  Performance Appraisals
                </h1>
                <p style={{ color: 'var(--gray-500)', marginTop: 4, marginBottom: 0 }}>
                  Manage appraisal cycles and employee reviews
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button onClick={() => setShowNewCycle(true)}
                  style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                  + New Cycle
                </button>
                <NotificationBell />
              </div>
            </div>

            {enrolMsg && (
              <div style={{ background: '#dcfce7', color: '#15803d', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>
                {enrolMsg}
              </div>
            )}

            {cyclesLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading cycles…</div>
            ) : cycles.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No appraisal cycles yet. Create one to get started.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {cycles.map(cycle => {
                  const total    = cycle.participant_count ?? 0;
                  const completed = cycle.completed_count ?? 0;
                  const pct      = total > 0 ? Math.round((completed / total) * 100) : 0;
                  return (
                    <div key={cycle.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', padding: '1.25rem 1.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--gray-900)' }}>{cycle.name}</span>
                            <span style={{ padding: '0.2rem 0.55rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...cycleBadge(cycle.status) }}>
                              {fmtStatus(cycle.status)}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.82rem', color: 'var(--gray-500)' }}>
                            {fmtStatus(cycle.cycle_type)} · {cycle.year} · {fmtDate(cycle.start_date)} – {fmtDate(cycle.end_date)}
                          </div>
                        </div>

                        {/* Progress */}
                        <div style={{ minWidth: 160 }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)', marginBottom: 4 }}>
                            {completed}/{total} completed
                          </div>
                          <div style={{ background: 'var(--gray-200)', borderRadius: 99, height: 8, overflow: 'hidden', width: 160 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: pct === 100 ? '#22c55e' : 'var(--primary-600)', width: `${pct}%`, transition: 'width 0.3s' }} />
                          </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          {cycle.status === 'draft' && (
                            <button onClick={() => activateCycle(cycle)}
                              style={{ padding: '0.4rem 0.875rem', background: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                              Activate
                            </button>
                          )}
                          {cycle.status === 'active' && (
                            <button onClick={() => handleEnrol(cycle.id)} disabled={enrolLoading === cycle.id}
                              style={{ padding: '0.4rem 0.875rem', background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: 6, fontWeight: 600, cursor: enrolLoading === cycle.id ? 'not-allowed' : 'pointer', fontSize: '0.82rem', opacity: enrolLoading === cycle.id ? 0.7 : 1 }}>
                              {enrolLoading === cycle.id ? 'Enrolling…' : 'Enrol All Staff'}
                            </button>
                          )}
                          <button onClick={() => setSelectedCycle(cycle)}
                            style={{ padding: '0.4rem 0.875rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                            View Details
                          </button>
                          {cycle.status === 'completed' && (
                            <button onClick={() => archiveCycle(cycle)}
                              style={{ padding: '0.4rem 0.875rem', background: '#f3f4f6', color: '#4b5563', border: '1px solid var(--gray-300)', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}>
                              Archive
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CYCLE DETAIL VIEW ─────────────────────────────────────────────── */}
        {selectedCycle && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <button onClick={() => { setSelectedCycle(null); setAppraisals([]); }}
                style={{ padding: '0.5rem 1rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                ← Back
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>{selectedCycle.name}</h1>
                  <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, ...cycleBadge(selectedCycle.status) }}>
                    {fmtStatus(selectedCycle.status)}
                  </span>
                </div>
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  {fmtStatus(selectedCycle.cycle_type)} · {selectedCycle.year} · {fmtDate(selectedCycle.start_date)} – {fmtDate(selectedCycle.end_date)}
                </p>
              </div>
              <NotificationBell />
            </div>

            {/* Summary row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '0.875rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Enrolled',   value: appraisals.length,                                                    bg: '#eff6ff',  color: '#1d4ed8' },
                { label: 'Pending',          value: appraisals.filter(a => a.status === 'pending').length,                bg: '#f3f4f6',  color: '#4b5563' },
                { label: 'Self-Assessment',  value: appraisals.filter(a => a.status === 'self_assessment').length,        bg: '#fef9c3',  color: '#a16207' },
                { label: 'Manager Review',   value: appraisals.filter(a => a.status === 'manager_review').length,         bg: '#dbeafe',  color: '#1d4ed8' },
                { label: 'Completed',        value: appraisals.filter(a => a.status === 'completed').length,              bg: '#dcfce7',  color: '#15803d' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: 8, padding: '0.875rem 1rem' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', fontWeight: 500 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <input type="search" placeholder="Search by name…" value={searchName} onChange={e => setSearchName(e.target.value)}
                style={{ flex: 1, minWidth: 180, padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', background: '#fff' }}>
                <option value="all">All Statuses</option>
                {(['pending','self_assessment','manager_review','hr_review','completed'] as EmployeeAppraisal['status'][]).map(s => (
                  <option key={s} value={s}>{fmtStatus(s)}</option>
                ))}
              </select>
              <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
                style={{ padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', background: '#fff' }}>
                <option value="all">All Departments</option>
                {depts.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Appraisals table */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              {appraisalsLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading appraisals…</div>
              ) : filteredAppraisals.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No appraisals match your filters.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                        {['Employee', 'Department', 'Reviewer', 'Status', 'Self Score', 'Manager Score', 'Final Score', 'Rating', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppraisals.map((a, i) => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--gray-800)' }}>{a.employee_name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-500)', fontSize: '0.82rem' }}>{a.department_name ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{a.reviewer_name ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ padding: '0.25rem 0.55rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...appraisalBadge(a.status) }}>
                              {fmtStatus(a.status)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--gray-700)' }}>{a.self_overall_score ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'var(--gray-700)' }}>{a.manager_overall_score ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 700, color: 'var(--gray-800)' }}>{a.final_score ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {a.rating ? (
                              <span style={{ padding: '0.25rem 0.55rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...ratingBadge(a.rating) }}>
                                {fmtStatus(a.rating)}
                              </span>
                            ) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button onClick={() => setViewAppraisal(a)}
                              style={{ padding: '0.3rem 0.75rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── NEW CYCLE MODAL ────────────────────────────────────────────────────── */}
      {showNewCycle && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setShowNewCycle(false)}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.25rem', fontWeight: 700 }}>New Appraisal Cycle</h2>
            {newCycleError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{newCycleError}</div>
            )}
            <form onSubmit={handleCreateCycle} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={labelStyle}>Cycle Name *</label>
                <input type="text" required value={newCycle.name} onChange={e => setNewCycle(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Annual Appraisal 2026" style={fieldStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Cycle Type *</label>
                  <select value={newCycle.cycle_type} onChange={e => setNewCycle(p => ({ ...p, cycle_type: e.target.value as AppraisalCycle['cycle_type'] }))} style={fieldStyle}>
                    {CYCLE_TYPES.map(t => <option key={t} value={t}>{fmtStatus(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Year *</label>
                  <input type="number" required value={newCycle.year} onChange={e => setNewCycle(p => ({ ...p, year: Number(e.target.value) }))}
                    min={2020} max={2040} style={fieldStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Start Date *</label>
                  <input type="date" required value={newCycle.start_date} onChange={e => setNewCycle(p => ({ ...p, start_date: e.target.value }))} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>End Date *</label>
                  <input type="date" required value={newCycle.end_date} onChange={e => setNewCycle(p => ({ ...p, end_date: e.target.value }))} style={fieldStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Self-Assessment Due</label>
                  <input type="date" value={newCycle.self_assessment_due} onChange={e => setNewCycle(p => ({ ...p, self_assessment_due: e.target.value }))} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Manager Review Due</label>
                  <input type="date" value={newCycle.manager_review_due} onChange={e => setNewCycle(p => ({ ...p, manager_review_due: e.target.value }))} style={fieldStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowNewCycle(false)}
                  style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={newCycleSaving}
                  style={{ padding: '0.625rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: newCycleSaving ? 'not-allowed' : 'pointer', opacity: newCycleSaving ? 0.7 : 1 }}>
                  {newCycleSaving ? 'Creating…' : 'Create Cycle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── VIEW APPRAISAL MODAL (read-only) ──────────────────────────────────── */}
      {viewAppraisal && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setViewAppraisal(null)}>
          <div style={{ ...modalBox, maxWidth: 780 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{viewAppraisal.employee_name}</h2>
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  {viewAppraisal.department_name ?? 'No department'} · Reviewer: {viewAppraisal.reviewer_name ?? 'Unassigned'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {viewAppraisal.rating && (
                  <span style={{ padding: '0.3rem 0.75rem', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700, ...ratingBadge(viewAppraisal.rating) }}>
                    {fmtStatus(viewAppraisal.rating)}
                  </span>
                )}
                <button onClick={() => setViewAppraisal(null)}
                  style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>×</button>
              </div>
            </div>

            {/* Scores summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Self Score',     value: viewAppraisal.self_overall_score },
                { label: 'Manager Score',  value: viewAppraisal.manager_overall_score },
                { label: 'Final Score',    value: viewAppraisal.final_score },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-600)' }}>{s.value ?? '—'}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* KPI table */}
            {viewAppraisal.kpis?.length > 0 && (
              <div style={{ marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--gray-800)', marginBottom: '0.75rem' }}>KPIs</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                        {['Title', 'Weight', 'Target', 'Actual', 'Self Score', 'Manager Score'].map(h => (
                          <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewAppraisal.kpis.map((kpi: KPI, idx: number) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                          <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: 'var(--gray-800)' }}>
                            {kpi.title}
                            {kpi.description && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)', fontWeight: 400 }}>{kpi.description}</div>}
                          </td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray-600)' }}>{kpi.weight_pct}%</td>
                          <td style={{ padding: '0.6rem 0.75rem', color: 'var(--gray-600)' }}>{kpi.target}</td>
                          <td style={{ padding: '0.6rem 0.75rem', color: 'var(--gray-700)', fontWeight: 500 }}>{kpi.actual || '—'}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--primary-700)', fontWeight: 600 }}>{kpi.self_score ?? '—'}</td>
                          <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--gray-700)', fontWeight: 600 }}>{kpi.manager_score ?? '—'}</td>
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
                  <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--primary-700)', marginBottom: 4 }}>Employee Comments</div>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setViewAppraisal(null)}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--gray-100)', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
