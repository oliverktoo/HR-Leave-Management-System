import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getAllDisciplinaryCases,
  createDisciplinaryCase,
  updateDisciplinaryCase,
  getAllGrievanceCases,
  updateGrievanceCase,
  type DisciplinaryCase,
  type GrievanceCase,
} from '../../services/disciplinaryService';

interface EmployeeOption {
  id: string;
  employee_id: string;
  full_name: string;
}

// ── Badge helpers ──────────────────────────────────────────────────────────
const disciplinaryStatusBadge = (status: DisciplinaryCase['status']): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    open:               { background: '#fee2e2', color: '#b91c1c' },
    investigation:      { background: '#fef9c3', color: '#a16207' },
    hearing_scheduled:  { background: '#ede9fe', color: '#6d28d9' },
    hearing_done:       { background: '#dbeafe', color: '#1d4ed8' },
    closed:             { background: '#dcfce7', color: '#15803d' },
    appealed:           { background: '#f3f4f6', color: '#4b5563' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

const grievanceStatusBadge = (status: GrievanceCase['status']): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    submitted:     { background: '#dbeafe', color: '#1d4ed8' },
    acknowledged:  { background: '#fef9c3', color: '#a16207' },
    investigation: { background: '#fef3c7', color: '#b45309' },
    mediation:     { background: '#ede9fe', color: '#6d28d9' },
    resolved:      { background: '#dcfce7', color: '#15803d' },
    closed:        { background: '#f3f4f6', color: '#4b5563' },
    escalated:     { background: '#fee2e2', color: '#b91c1c' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

const fmtStatus = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString() : '—';

const DISC_CATEGORIES: DisciplinaryCase['category'][] = [
  'misconduct', 'poor_performance', 'attendance', 'policy_violation',
  'insubordination', 'fraud', 'other',
];

const ACTION_TYPES: DisciplinaryCase['action_type'][] = [
  'verbal_warning', 'written_warning', 'final_warning',
  'suspension', 'demotion', 'dismissal', 'no_action',
];

const DISC_STATUSES: DisciplinaryCase['status'][] = [
  'open', 'investigation', 'hearing_scheduled', 'hearing_done', 'closed', 'appealed',
];


const GRIEVANCE_STATUSES: GrievanceCase['status'][] = [
  'submitted', 'acknowledged', 'investigation', 'mediation', 'resolved', 'closed', 'escalated',
];

export const DisciplinaryManagement = () => {
  const [activeTab, setActiveTab] = useState<'disciplinary' | 'grievances'>('disciplinary');

  // ── Disciplinary state ─────────────────────────────────────────────────────
  const [cases, setCases] = useState<DisciplinaryCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<DisciplinaryCase | null>(null);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [newCaseError, setNewCaseError] = useState('');
  const [newCaseLoading, setNewCaseLoading] = useState(false);

  const [newCase, setNewCase] = useState({
    user_id: '',
    incident_date: '',
    category: 'misconduct' as DisciplinaryCase['category'],
    incident_description: '',
    action_type: 'verbal_warning' as DisciplinaryCase['action_type'],
  });

  // Detail panel edits
  const [detailStatus, setDetailStatus] = useState<DisciplinaryCase['status']>('open');
  const [detailHearingDate, setDetailHearingDate] = useState('');
  const [detailHearingNotes, setDetailHearingNotes] = useState('');
  const [detailEmployeeResponse, setDetailEmployeeResponse] = useState('');
  const [detailHRNotes, setDetailHRNotes] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);

  // ── Grievances state ───────────────────────────────────────────────────────
  const [grievances, setGrievances] = useState<GrievanceCase[]>([]);
  const [grievancesLoading, setGrievancesLoading] = useState(true);
  const [selectedGrievance, setSelectedGrievance] = useState<GrievanceCase | null>(null);

  const [gDetailStatus, setGDetailStatus] = useState<GrievanceCase['status']>('submitted');
  const [gDetailResolution, setGDetailResolution] = useState('');
  const [gDetailHRNotes, setGDetailHRNotes] = useState('');
  const [gDetailAssignedTo, setGDetailAssignedTo] = useState('');
  const [gDetailSaving, setGDetailSaving] = useState(false);

  useEffect(() => {
    loadCases();
    loadGrievances();
    loadEmployees();
  }, []);

  const loadCases = async () => {
    setCasesLoading(true);
    const { data } = await getAllDisciplinaryCases();
    setCases(data ?? []);
    setCasesLoading(false);
  };

  const loadGrievances = async () => {
    setGrievancesLoading(true);
    const { data } = await getAllGrievanceCases();
    setGrievances(data ?? []);
    setGrievancesLoading(false);
  };

  const loadEmployees = async () => {
    const { data } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, employee_id')
      .eq('is_active', true)
      .order('first_name');
    setEmployees(
      (data ?? []).map(p => ({
        id: p.id,
        employee_id: p.employee_id ?? '',
        full_name: `${p.first_name} ${p.last_name}`,
      }))
    );
  };

  // ── Summary counts ──────────────────────────────────────────────────────────
  const openCases        = cases.filter(c => c.status === 'open').length;
  const underInvestigation = cases.filter(c => c.status === 'investigation').length;
  const hearingScheduled = cases.filter(c => c.status === 'hearing_scheduled').length;
  const thisMonth = new Date();
  const closedThisMonth  = cases.filter(c => {
    if (c.status !== 'closed' || !c.closed_at) return false;
    const d = new Date(c.closed_at);
    return d.getMonth() === thisMonth.getMonth() && d.getFullYear() === thisMonth.getFullYear();
  }).length;

  // ── Open case for detail ───────────────────────────────────────────────────
  const openCaseDetail = (c: DisciplinaryCase) => {
    setSelectedCase(c);
    setDetailStatus(c.status);
    setDetailHearingDate(c.hearing_date ?? '');
    setDetailHearingNotes(c.hearing_notes ?? '');
    setDetailEmployeeResponse(c.employee_response ?? '');
    setDetailHRNotes(c.hr_notes ?? '');
  };

  const openGrievanceDetail = (g: GrievanceCase) => {
    setSelectedGrievance(g);
    setGDetailStatus(g.status);
    setGDetailResolution(g.resolution ?? '');
    setGDetailHRNotes(g.hr_notes ?? '');
    setGDetailAssignedTo(g.assigned_to ?? '');
  };

  // ── Save case detail ───────────────────────────────────────────────────────
  const saveCaseDetail = async () => {
    if (!selectedCase) return;
    setDetailSaving(true);
    const updates: Partial<DisciplinaryCase> = {
      status:            detailStatus,
      hearing_date:      detailHearingDate || null,
      hearing_notes:     detailHearingNotes || null,
      employee_response: detailEmployeeResponse || null,
      hr_notes:          detailHRNotes || null,
    };
    if (detailStatus === 'closed') updates.closed_at = new Date().toISOString();
    await updateDisciplinaryCase(selectedCase.id, updates);
    setDetailSaving(false);
    setSelectedCase(null);
    loadCases();
  };

  const saveGrievanceDetail = async () => {
    if (!selectedGrievance) return;
    setGDetailSaving(true);
    const updates: Partial<GrievanceCase> = {
      status:      gDetailStatus,
      resolution:  gDetailResolution || null,
      hr_notes:    gDetailHRNotes || null,
      assigned_to: gDetailAssignedTo || null,
    };
    if (gDetailStatus === 'resolved') updates.resolved_at = new Date().toISOString();
    if (gDetailStatus === 'acknowledged') updates.acknowledged_at = new Date().toISOString();
    await updateGrievanceCase(selectedGrievance.id, updates);
    setGDetailSaving(false);
    setSelectedGrievance(null);
    loadGrievances();
  };

  // ── New case submit ────────────────────────────────────────────────────────
  const handleNewCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewCaseError('');
    if (!newCase.user_id) { setNewCaseError('Please select an employee.'); return; }
    if (!newCase.incident_date) { setNewCaseError('Incident date is required.'); return; }
    if (!newCase.incident_description.trim()) { setNewCaseError('Please describe the incident.'); return; }
    setNewCaseLoading(true);
    const emp = employees.find(e => e.id === newCase.user_id);
    const { error } = await createDisciplinaryCase({
      user_id:              newCase.user_id,
      employee_id:          emp?.employee_id ?? '',
      incident_date:        newCase.incident_date,
      incident_description: newCase.incident_description,
      category:             newCase.category,
      action_type:          newCase.action_type,
    });
    setNewCaseLoading(false);
    if (error) { setNewCaseError(error.message ?? 'Failed to create case.'); return; }
    setShowNewCaseModal(false);
    setNewCase({ user_id: '', incident_date: '', category: 'misconduct', incident_description: '', action_type: 'verbal_warning' });
    loadCases();
  };

  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000, padding: '1rem',
  };
  const modalBox: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: '2rem',
    width: '100%', maxWidth: 600, maxHeight: '92vh', overflowY: 'auto',
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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              Disciplinary &amp; Grievances
            </h1>
            <p style={{ color: 'var(--gray-500)', marginTop: 4, marginBottom: 0 }}>
              Manage disciplinary cases and employee grievances
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--gray-200)', marginBottom: '1.5rem' }}>
          {(['disciplinary', 'grievances'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.95rem',
                color: activeTab === tab ? 'var(--primary-600)' : 'var(--gray-500)',
                borderBottom: activeTab === tab ? '2px solid var(--primary-600)' : '2px solid transparent',
                marginBottom: -2, textTransform: 'capitalize',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* ── DISCIPLINARY TAB ──────────────────────────────────────────────── */}
        {activeTab === 'disciplinary' && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Open Cases',          value: openCases,          bg: '#fee2e2', color: '#b91c1c', icon: '🔴' },
                { label: 'Under Investigation', value: underInvestigation, bg: '#fef9c3', color: '#a16207', icon: '🔍' },
                { label: 'Hearings Scheduled',  value: hearingScheduled,   bg: '#ede9fe', color: '#6d28d9', icon: '📅' },
                { label: 'Closed This Month',   value: closedThisMonth,    bg: '#dcfce7', color: '#15803d', icon: '✅' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.4rem' }}>{c.icon}</span>
                  <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: c.color }}>{c.value}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', fontWeight: 500 }}>{c.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button onClick={() => setShowNewCaseModal(true)}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                + New Case
              </button>
            </div>

            {/* Cases table */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              {casesLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading cases…</div>
              ) : cases.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No disciplinary cases found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                        {['Case #', 'Employee', 'Category', 'Action Type', 'Status', 'Incident Date', 'Assigned To', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--primary-600)', whiteSpace: 'nowrap' }}>
                            {c.is_confidential && <span title="Confidential" style={{ marginRight: 4 }}>🔒</span>}
                            {c.case_number}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--gray-800)' }}>{c.employee_name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{fmtStatus(c.category)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{fmtStatus(c.action_type)}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...disciplinaryStatusBadge(c.status) }}>
                              {fmtStatus(c.status)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{fmtDate(c.incident_date)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-500)', fontSize: '0.82rem' }}>{c.assigned_to ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button onClick={() => openCaseDetail(c)}
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

        {/* ── GRIEVANCES TAB ───────────────────────────────────────────────── */}
        {activeTab === 'grievances' && (
          <>
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              {grievancesLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading grievances…</div>
              ) : grievances.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No grievance cases found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                        {['Case #', 'Complainant', 'Type', 'Against', 'Status', 'Filed Date', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grievances.map((g, i) => (
                        <tr key={g.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--primary-600)', whiteSpace: 'nowrap' }}>
                            {g.is_confidential && <span title="Confidential" style={{ marginRight: 4 }}>🔒</span>}
                            {g.case_number}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--gray-800)' }}>{g.employee_name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{fmtStatus(g.grievance_type)}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-500)' }}>{g.against_name ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...grievanceStatusBadge(g.status) }}>
                              {fmtStatus(g.status)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{fmtDate(g.filed_date)}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button onClick={() => openGrievanceDetail(g)}
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

      {/* ── NEW DISCIPLINARY CASE MODAL ────────────────────────────────────────── */}
      {showNewCaseModal && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setShowNewCaseModal(false)}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.25rem', fontWeight: 700 }}>New Disciplinary Case</h2>
            {newCaseError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{newCaseError}</div>
            )}
            <form onSubmit={handleNewCase} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={labelStyle}>Employee *</label>
                <select value={newCase.user_id} onChange={e => setNewCase(p => ({ ...p, user_id: e.target.value }))} required style={fieldStyle}>
                  <option value="">Select employee…</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Incident Date *</label>
                <input type="date" required value={newCase.incident_date} onChange={e => setNewCase(p => ({ ...p, incident_date: e.target.value }))} style={fieldStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={newCase.category} onChange={e => setNewCase(p => ({ ...p, category: e.target.value as DisciplinaryCase['category'] }))} style={fieldStyle}>
                    {DISC_CATEGORIES.map(c => <option key={c} value={c}>{fmtStatus(c)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Action Type *</label>
                  <select value={newCase.action_type} onChange={e => setNewCase(p => ({ ...p, action_type: e.target.value as DisciplinaryCase['action_type'] }))} style={fieldStyle}>
                    {ACTION_TYPES.map(a => <option key={a} value={a}>{fmtStatus(a)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Incident Description *</label>
                <textarea rows={4} required value={newCase.incident_description} onChange={e => setNewCase(p => ({ ...p, incident_description: e.target.value }))}
                  placeholder="Describe the incident in detail…"
                  style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowNewCaseModal(false)}
                  style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={newCaseLoading}
                  style={{ padding: '0.625rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: newCaseLoading ? 'not-allowed' : 'pointer', opacity: newCaseLoading ? 0.7 : 1 }}>
                  {newCaseLoading ? 'Saving…' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── DISCIPLINARY CASE DETAIL MODAL ──────────────────────────────────────── */}
      {selectedCase && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setSelectedCase(null)}>
          <div style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedCase.is_confidential && <span title="Confidential">🔒</span>}
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Case {selectedCase.case_number}</h2>
                </div>
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  {selectedCase.employee_name} · {fmtStatus(selectedCase.category)}
                </p>
              </div>
              <button onClick={() => setSelectedCase(null)}
                style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>×</button>
            </div>

            {/* Read-only details */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                <div><span style={{ color: 'var(--gray-500)' }}>Incident Date: </span><strong>{fmtDate(selectedCase.incident_date)}</strong></div>
                <div><span style={{ color: 'var(--gray-500)' }}>Action: </span><strong>{fmtStatus(selectedCase.action_type)}</strong></div>
                <div><span style={{ color: 'var(--gray-500)' }}>Raised By: </span><strong>{selectedCase.raised_by_name ?? '—'}</strong></div>
                <div><span style={{ color: 'var(--gray-500)' }}>Department: </span><strong>{selectedCase.department_name ?? '—'}</strong></div>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <span style={{ color: 'var(--gray-500)' }}>Incident Description:</span>
                <p style={{ margin: '4px 0 0', color: 'var(--gray-800)' }}>{selectedCase.incident_description}</p>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={detailStatus} onChange={e => setDetailStatus(e.target.value as DisciplinaryCase['status'])} style={fieldStyle}>
                  {DISC_STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Hearing Date</label>
                <input type="datetime-local" value={detailHearingDate} onChange={e => setDetailHearingDate(e.target.value)} style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Hearing Notes</label>
                <textarea rows={3} value={detailHearingNotes} onChange={e => setDetailHearingNotes(e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>Employee Response</label>
                <textarea rows={3} value={detailEmployeeResponse} onChange={e => setDetailEmployeeResponse(e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>HR Notes</label>
                <textarea rows={3} value={detailHRNotes} onChange={e => setDetailHRNotes(e.target.value)} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setSelectedCase(null)}
                style={{ padding: '0.6rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={saveCaseDetail} disabled={detailSaving}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: detailSaving ? 'not-allowed' : 'pointer', opacity: detailSaving ? 0.7 : 1 }}>
                {detailSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GRIEVANCE DETAIL MODAL ─────────────────────────────────────────────── */}
      {selectedGrievance && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setSelectedGrievance(null)}>
          <div style={modalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {selectedGrievance.is_confidential && <span title="Confidential">🔒</span>}
                  <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Grievance {selectedGrievance.case_number}</h2>
                </div>
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  {selectedGrievance.employee_name} · {fmtStatus(selectedGrievance.grievance_type)}
                </p>
              </div>
              <button onClick={() => setSelectedGrievance(null)}
                style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>×</button>
            </div>

            {/* Read-only details */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '1rem', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1.5rem' }}>
                <div><span style={{ color: 'var(--gray-500)' }}>Filed Date: </span><strong>{fmtDate(selectedGrievance.filed_date)}</strong></div>
                <div><span style={{ color: 'var(--gray-500)' }}>Against: </span><strong>{selectedGrievance.against_name ?? '—'}</strong></div>
                <div><span style={{ color: 'var(--gray-500)' }}>Department: </span><strong>{selectedGrievance.department_name ?? '—'}</strong></div>
                <div>
                  <span style={{ color: 'var(--gray-500)' }}>Current Status: </span>
                  <span style={{ padding: '0.2rem 0.5rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...grievanceStatusBadge(selectedGrievance.status) }}>
                    {fmtStatus(selectedGrievance.status)}
                  </span>
                </div>
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                <span style={{ color: 'var(--gray-500)' }}>Description:</span>
                <p style={{ margin: '4px 0 0', color: 'var(--gray-800)' }}>{selectedGrievance.description}</p>
              </div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={labelStyle}>Status</label>
                <select value={gDetailStatus} onChange={e => setGDetailStatus(e.target.value as GrievanceCase['status'])} style={fieldStyle}>
                  {GRIEVANCE_STATUSES.map(s => <option key={s} value={s}>{fmtStatus(s)}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Assigned To</label>
                <input type="text" value={gDetailAssignedTo} onChange={e => setGDetailAssignedTo(e.target.value)}
                  placeholder="Assigned HR officer name or ID"
                  style={fieldStyle} />
              </div>
              <div>
                <label style={labelStyle}>Resolution</label>
                <textarea rows={3} value={gDetailResolution} onChange={e => setGDetailResolution(e.target.value)}
                  placeholder="Describe the resolution or outcome…"
                  style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={labelStyle}>HR Notes</label>
                <textarea rows={3} value={gDetailHRNotes} onChange={e => setGDetailHRNotes(e.target.value)}
                  style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={() => setSelectedGrievance(null)}
                style={{ padding: '0.6rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={saveGrievanceDetail} disabled={gDetailSaving}
                style={{ padding: '0.6rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: gDetailSaving ? 'not-allowed' : 'pointer', opacity: gDetailSaving ? 0.7 : 1 }}>
                {gDetailSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
