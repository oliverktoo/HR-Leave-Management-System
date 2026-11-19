import { useState, useEffect, useMemo } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import {
  saveTrainingCourse,
  getAllEmployeeTraining,
  saveEmployeeTraining,
  deleteEmployeeTraining,
  getAllSkills,
  saveSkill,
  deleteSkill,
  type TrainingCourse,
  type EmployeeTraining,
  type EmployeeSkill,
} from '../../services/trainingService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtStatus = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const statusBadgeStyle = (status: EmployeeTraining['status']): React.CSSProperties => {
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
  <span style={{ color: '#f59e0b', fontSize: '1.1rem', letterSpacing: 1 }}>
    {Array.from({ length: max }, (_, i) => (i < value ? '★' : '☆')).join('')}
  </span>
);

const CATEGORIES = [
  'technical', 'soft_skills', 'compliance', 'leadership',
  'health_safety', 'it', 'finance', 'general', 'other',
] as const;

const SKILL_CATEGORIES = ['technical', 'soft_skills', 'language', 'certification', 'other'] as const;

const STATUSES: EmployeeTraining['status'][] = [
  'enrolled', 'in_progress', 'completed', 'failed', 'cancelled',
];

// ─── Employee picker ──────────────────────────────────────────────────────────

interface EmployeeOption {
  id: string;
  employee_id: string | null;
  full_name: string;
  department: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrainingManagement() {
  const [activeTab, setActiveTab] = useState<'records' | 'courses' | 'skills'>('records');

  // ── Employees ──────────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // ── Training Records ───────────────────────────────────────────────────────
  const [records, setRecords] = useState<EmployeeTraining[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [empSearch, setEmpSearch] = useState('');

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editRecord, setEditRecord] = useState<Partial<EmployeeTraining> | null>(null);
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordError, setRecordError] = useState('');

  // ── Course Catalog ─────────────────────────────────────────────────────────
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editCourse, setEditCourse] = useState<Partial<TrainingCourse> | null>(null);
  const [courseSaving, setCourseSaving] = useState(false);
  const [courseError, setCourseError] = useState('');

  // ── Skills Matrix ──────────────────────────────────────────────────────────
  const [skills, setSkills] = useState<EmployeeSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillDeptFilter, setSkillDeptFilter] = useState('');
  const [skillCatFilter, setSkillCatFilter] = useState('');
  const [showSkillModal, setShowSkillModal] = useState(false);
  const [editSkill, setEditSkill] = useState<Partial<EmployeeSkill> | null>(null);
  const [skillSaving, setSkillSaving] = useState(false);
  const [skillError, setSkillError] = useState('');

  // ── All courses (including inactive) for admin ────────────────────────────
  const [allCourses, setAllCourses] = useState<TrainingCourse[]>([]);

  useEffect(() => {
    loadEmployees();
    loadRecords();
    loadCourses();
    loadSkills();
  }, []);

  const loadEmployees = async () => {
    const { data } = await supabase
      .from('users_profile')
      .select('id, employee_id, first_name, last_name, department')
      .order('first_name');
    setEmployees(
      (data ?? []).map((p: any) => ({
        id: p.id,
        employee_id: p.employee_id,
        full_name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
        department: p.department,
      }))
    );
  };

  const loadRecords = async () => {
    setRecordsLoading(true);
    try {
      const data = await getAllEmployeeTraining();
      setRecords(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setRecordsLoading(false);
    }
  };

  const loadCourses = async () => {
    setCoursesLoading(true);
    try {
      // Load all courses (including inactive) for admin view
      const { data, error } = await supabase
        .from('training_courses')
        .select('*')
        .order('title');
      if (error) throw error;
      setAllCourses((data ?? []) as TrainingCourse[]);
      setCourses((data ?? []).filter((c: TrainingCourse) => c.is_active) as TrainingCourse[]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setCoursesLoading(false);
    }
  };

  const loadSkills = async () => {
    setSkillsLoading(true);
    try {
      const data = await getAllSkills();
      setSkills(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setSkillsLoading(false);
    }
  };

  // ── Filtered records ────────────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchStatus = !statusFilter || r.status === statusFilter;
      const matchEmp =
        !empSearch ||
        (r.employee_name ?? '').toLowerCase().includes(empSearch.toLowerCase()) ||
        (r.employee_id ?? '').toLowerCase().includes(empSearch.toLowerCase());
      return matchStatus && matchEmp;
    });
  }, [records, statusFilter, empSearch]);

  // ── Skills grouped by employee ──────────────────────────────────────────────
  const departments = useMemo(
    () => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort() as string[],
    [employees]
  );

  const filteredSkillsGrouped = useMemo(() => {
    const filtered = skills.filter((s) => {
      const matchCat = !skillCatFilter || s.skill_category === skillCatFilter;
      if (!skillDeptFilter) return matchCat;
      const emp = employees.find((e) => e.id === s.user_id);
      return matchCat && emp?.department === skillDeptFilter;
    });

    const grouped: Record<string, EmployeeSkill[]> = {};
    for (const skill of filtered) {
      const name = skill.employee_name ?? skill.user_id;
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(skill);
    }
    return grouped;
  }, [skills, skillDeptFilter, skillCatFilter, employees]);

  // ── Record modal ────────────────────────────────────────────────────────────
  const openNewRecord = () => {
    setEditRecord({
      course_title: '',
      provider: '',
      training_date: '',
      completion_date: '',
      status: 'enrolled',
      score: null,
      cost: null,
      cost_currency: 'KES',
      notes: '',
      user_id: '',
    });
    setRecordError('');
    setShowRecordModal(true);
  };

  const openEditRecord = (r: EmployeeTraining) => {
    setEditRecord({ ...r });
    setRecordError('');
    setShowRecordModal(true);
  };

  const handleSaveRecord = async () => {
    if (!editRecord?.user_id) { setRecordError('Please select an employee.'); return; }
    if (!editRecord?.course_title?.trim()) { setRecordError('Course title is required.'); return; }
    if (!editRecord?.training_date) { setRecordError('Training date is required.'); return; }
    setRecordSaving(true);
    setRecordError('');
    try {
      await saveEmployeeTraining(editRecord);
      await loadRecords();
      setShowRecordModal(false);
    } catch (e: any) {
      setRecordError(e.message ?? 'Failed to save record.');
    } finally {
      setRecordSaving(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('Delete this training record?')) return;
    try {
      await deleteEmployeeTraining(id);
      await loadRecords();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── Course modal ────────────────────────────────────────────────────────────
  const openNewCourse = () => {
    setEditCourse({
      title: '',
      category: 'general',
      provider: '',
      duration_hours: null,
      description: '',
      is_active: true,
    });
    setCourseError('');
    setShowCourseModal(true);
  };

  const openEditCourse = (c: TrainingCourse) => {
    setEditCourse({ ...c });
    setCourseError('');
    setShowCourseModal(true);
  };

  const handleSaveCourse = async () => {
    if (!editCourse?.title?.trim()) { setCourseError('Title is required.'); return; }
    setCourseSaving(true);
    setCourseError('');
    try {
      await saveTrainingCourse(editCourse);
      await loadCourses();
      setShowCourseModal(false);
    } catch (e: any) {
      setCourseError(e.message ?? 'Failed to save course.');
    } finally {
      setCourseSaving(false);
    }
  };

  const toggleCourseActive = async (c: TrainingCourse) => {
    try {
      await saveTrainingCourse({ ...c, is_active: !c.is_active });
      await loadCourses();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── Skill modal ─────────────────────────────────────────────────────────────
  const openNewSkill = () => {
    setEditSkill({
      user_id: '',
      skill_name: '',
      skill_category: 'technical',
      proficiency: 3,
      certified: false,
      certification_body: '',
      expiry_date: '',
      notes: '',
    });
    setSkillError('');
    setShowSkillModal(true);
  };

  const openEditSkill = (s: EmployeeSkill) => {
    setEditSkill({ ...s });
    setSkillError('');
    setShowSkillModal(true);
  };

  const handleSaveSkill = async () => {
    if (!editSkill?.user_id) { setSkillError('Please select an employee.'); return; }
    if (!editSkill?.skill_name?.trim()) { setSkillError('Skill name is required.'); return; }
    setSkillSaving(true);
    setSkillError('');
    try {
      await saveSkill(editSkill);
      await loadSkills();
      setShowSkillModal(false);
    } catch (e: any) {
      setSkillError(e.message ?? 'Failed to save skill.');
    } finally {
      setSkillSaving(false);
    }
  };

  const handleDeleteSkill = async (id: string) => {
    if (!window.confirm('Delete this skill?')) return;
    try {
      await deleteSkill(id);
      await loadSkills();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const card: React.CSSProperties = {
    background: '#fff',
    border: '1px solid var(--gray-200)',
    borderRadius: 10,
    overflow: 'hidden',
  };

  const tableHeader: React.CSSProperties = {
    background: 'var(--gray-50)',
    borderBottom: '1px solid var(--gray-200)',
    padding: '0.75rem 1rem',
    textAlign: 'left' as const,
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--gray-600)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  };

  const tableCell: React.CSSProperties = {
    padding: '0.75rem 1rem',
    fontSize: '0.9rem',
    color: 'var(--gray-800)',
    borderBottom: '1px solid var(--gray-100)',
    verticalAlign: 'top',
  };

  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem',
  };

  const modalBox: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  const formGroup: React.CSSProperties = { marginBottom: '1rem' };
  const label: React.CSSProperties = {
    display: 'block',
    marginBottom: 4,
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--gray-700)',
  };
  const input: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--gray-300)',
    borderRadius: 6,
    fontSize: '0.9rem',
    boxSizing: 'border-box' as const,
  };

  const btnPrimary: React.CSSProperties = {
    background: 'var(--primary-600)',
    color: '#fff',
    border: 'none',
    padding: '0.55rem 1.25rem',
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'var(--gray-100)',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-200)',
    padding: '0.55rem 1.25rem',
    borderRadius: 6,
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
  };

  const btnDanger: React.CSSProperties = {
    background: '#fee2e2',
    color: '#b91c1c',
    border: 'none',
    padding: '0.3rem 0.7rem',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
  };

  const btnEdit: React.CSSProperties = {
    background: '#dbeafe',
    color: '#1d4ed8',
    border: 'none',
    padding: '0.3rem 0.7rem',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    marginRight: 4,
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

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              Training &amp; Development
            </h1>
            <p style={{ color: 'var(--gray-500)', marginTop: 4, marginBottom: 0 }}>
              Manage employee training records, course catalog, and skills matrix
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--gray-200)', marginBottom: '1.5rem', background: '#fff', borderRadius: '10px 10px 0 0', paddingTop: '0.25rem' }}>
          <button style={tabStyle(activeTab === 'records')} onClick={() => setActiveTab('records')}>
            Training Records
          </button>
          <button style={tabStyle(activeTab === 'courses')} onClick={() => setActiveTab('courses')}>
            Course Catalog
          </button>
          <button style={tabStyle(activeTab === 'skills')} onClick={() => setActiveTab('skills')}>
            Skills Matrix
          </button>
        </div>

        {/* ── Training Records Tab ─────────────────────────────────────────── */}
        {activeTab === 'records' && (
          <div>
            {/* Filters + Add button */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                style={{ ...input, width: 220 }}
                placeholder="Search employee name or ID…"
                value={empSearch}
                onChange={(e) => setEmpSearch(e.target.value)}
              />
              <select
                style={{ ...input, width: 180 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{fmtStatus(s)}</option>
                ))}
              </select>
              <div style={{ flex: 1 }} />
              <button style={btnPrimary} onClick={openNewRecord}>
                + Add Training Record
              </button>
            </div>

            {/* Table */}
            <div style={card}>
              {recordsLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading…</div>
              ) : filteredRecords.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                  No training records found.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Employee', 'Employee ID', 'Course', 'Provider', 'Date', 'Status', 'Score', 'Cost', 'Actions'].map((h) => (
                          <th key={h} style={tableHeader}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r) => (
                        <tr key={r.id}>
                          <td style={tableCell}>{r.employee_name ?? '—'}</td>
                          <td style={tableCell}>{r.employee_id ?? '—'}</td>
                          <td style={{ ...tableCell, fontWeight: 600 }}>{r.course_title}</td>
                          <td style={tableCell}>{r.provider ?? '—'}</td>
                          <td style={tableCell}>{fmtDate(r.training_date)}</td>
                          <td style={tableCell}>
                            <span style={{
                              ...statusBadgeStyle(r.status),
                              padding: '0.2rem 0.6rem',
                              borderRadius: 20,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                            }}>
                              {fmtStatus(r.status)}
                            </span>
                          </td>
                          <td style={tableCell}>{r.score != null ? `${r.score}%` : '—'}</td>
                          <td style={tableCell}>
                            {r.cost != null ? `${r.cost_currency} ${Number(r.cost).toLocaleString()}` : '—'}
                          </td>
                          <td style={tableCell}>
                            <button style={btnEdit} onClick={() => openEditRecord(r)}>Edit</button>
                            <button style={btnDanger} onClick={() => handleDeleteRecord(r.id)}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Course Catalog Tab ───────────────────────────────────────────── */}
        {activeTab === 'courses' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button style={btnPrimary} onClick={openNewCourse}>
                + Add Course
              </button>
            </div>

            <div style={card}>
              {coursesLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading…</div>
              ) : allCourses.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                  No courses yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['Title', 'Category', 'Provider', 'Duration (hrs)', 'Active', 'Actions'].map((h) => (
                          <th key={h} style={tableHeader}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allCourses.map((c) => (
                        <tr key={c.id}>
                          <td style={{ ...tableCell, fontWeight: 600 }}>{c.title}</td>
                          <td style={tableCell}>{fmtStatus(c.category)}</td>
                          <td style={tableCell}>{c.provider ?? '—'}</td>
                          <td style={tableCell}>{c.duration_hours ?? '—'}</td>
                          <td style={tableCell}>
                            <button
                              onClick={() => toggleCourseActive(c)}
                              style={{
                                background: c.is_active ? '#dcfce7' : '#f3f4f6',
                                color: c.is_active ? '#15803d' : '#4b5563',
                                border: 'none',
                                padding: '0.25rem 0.75rem',
                                borderRadius: 20,
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                              }}
                            >
                              {c.is_active ? 'Active' : 'Inactive'}
                            </button>
                          </td>
                          <td style={tableCell}>
                            <button style={btnEdit} onClick={() => openEditCourse(c)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Skills Matrix Tab ────────────────────────────────────────────── */}
        {activeTab === 'skills' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                style={{ ...input, width: 200 }}
                value={skillDeptFilter}
                onChange={(e) => setSkillDeptFilter(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select
                style={{ ...input, width: 200 }}
                value={skillCatFilter}
                onChange={(e) => setSkillCatFilter(e.target.value)}
              >
                <option value="">All Skill Categories</option>
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{fmtStatus(c)}</option>
                ))}
              </select>
              <div style={{ flex: 1 }} />
              <button style={btnPrimary} onClick={openNewSkill}>
                + Add Skill
              </button>
            </div>

            {skillsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>Loading…</div>
            ) : Object.keys(filteredSkillsGrouped).length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
                No skills found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Object.entries(filteredSkillsGrouped).map(([empName, empSkills]) => (
                  <div key={empName} style={card}>
                    <div style={{
                      padding: '0.875rem 1.25rem',
                      background: 'var(--gray-50)',
                      borderBottom: '1px solid var(--gray-200)',
                      fontWeight: 700,
                      color: 'var(--gray-800)',
                      fontSize: '0.95rem',
                    }}>
                      {empName}
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Skill', 'Category', 'Proficiency', 'Certified', 'Cert Body', 'Expiry', 'Actions'].map((h) => (
                            <th key={h} style={{ ...tableHeader, padding: '0.6rem 1rem' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {empSkills.map((s) => (
                          <tr key={s.id}>
                            <td style={tableCell}>{s.skill_name}</td>
                            <td style={tableCell}>{fmtStatus(s.skill_category)}</td>
                            <td style={tableCell}>
                              <Stars value={s.proficiency} />
                              <span style={{ marginLeft: 6, color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                                {s.proficiency}/5
                              </span>
                            </td>
                            <td style={tableCell}>
                              {s.certified ? (
                                <span style={{ color: '#15803d', fontWeight: 600 }}>Yes</span>
                              ) : (
                                <span style={{ color: 'var(--gray-400)' }}>No</span>
                              )}
                            </td>
                            <td style={tableCell}>{s.certification_body ?? '—'}</td>
                            <td style={tableCell}>{fmtDate(s.expiry_date)}</td>
                            <td style={tableCell}>
                              <button style={btnEdit} onClick={() => openEditSkill(s)}>Edit</button>
                              <button style={btnDanger} onClick={() => handleDeleteSkill(s.id)}>Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Training Record Modal ────────────────────────────────────────── */}
        {showRecordModal && editRecord && (
          <div style={modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowRecordModal(false); }}>
            <div style={modalBox}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  {editRecord.id ? 'Edit Training Record' : 'Add Training Record'}
                </h2>
                <button onClick={() => setShowRecordModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                {recordError && (
                  <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.9rem' }}>
                    {recordError}
                  </div>
                )}

                <div style={formGroup}>
                  <label style={label}>Employee *</label>
                  <select
                    style={input}
                    value={editRecord.user_id ?? ''}
                    onChange={(e) => setEditRecord((p) => ({ ...p!, user_id: e.target.value }))}
                  >
                    <option value="">— Select Employee —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}{emp.employee_id ? ` (${emp.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={formGroup}>
                  <label style={label}>Course Title *</label>
                  <input
                    style={input}
                    value={editRecord.course_title ?? ''}
                    onChange={(e) => setEditRecord((p) => ({ ...p!, course_title: e.target.value }))}
                    placeholder="e.g. Advanced Excel"
                    list="course-titles-list"
                  />
                  <datalist id="course-titles-list">
                    {courses.map((c) => (
                      <option key={c.id} value={c.title} />
                    ))}
                  </datalist>
                </div>

                <div style={formGroup}>
                  <label style={label}>Provider</label>
                  <input
                    style={input}
                    value={editRecord.provider ?? ''}
                    onChange={(e) => setEditRecord((p) => ({ ...p!, provider: e.target.value }))}
                    placeholder="e.g. Coursera, Internal"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={formGroup}>
                    <label style={label}>Training Date *</label>
                    <input
                      type="date"
                      style={input}
                      value={editRecord.training_date ?? ''}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, training_date: e.target.value }))}
                    />
                  </div>
                  <div style={formGroup}>
                    <label style={label}>Completion Date</label>
                    <input
                      type="date"
                      style={input}
                      value={editRecord.completion_date ?? ''}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, completion_date: e.target.value || null }))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={formGroup}>
                    <label style={label}>Status</label>
                    <select
                      style={input}
                      value={editRecord.status ?? 'enrolled'}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, status: e.target.value as EmployeeTraining['status'] }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{fmtStatus(s)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={formGroup}>
                    <label style={label}>Score (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      style={input}
                      value={editRecord.score ?? ''}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, score: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="0–100"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={formGroup}>
                    <label style={label}>Cost</label>
                    <input
                      type="number"
                      min={0}
                      style={input}
                      value={editRecord.cost ?? ''}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, cost: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={formGroup}>
                    <label style={label}>Currency</label>
                    <select
                      style={input}
                      value={editRecord.cost_currency ?? 'KES'}
                      onChange={(e) => setEditRecord((p) => ({ ...p!, cost_currency: e.target.value }))}
                    >
                      <option>KES</option>
                      <option>USD</option>
                      <option>EUR</option>
                      <option>GBP</option>
                    </select>
                  </div>
                </div>

                <div style={formGroup}>
                  <label style={label}>Notes</label>
                  <textarea
                    style={{ ...input, minHeight: 80, resize: 'vertical' }}
                    value={editRecord.notes ?? ''}
                    onChange={(e) => setEditRecord((p) => ({ ...p!, notes: e.target.value }))}
                    placeholder="Additional notes…"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button style={btnSecondary} onClick={() => setShowRecordModal(false)}>Cancel</button>
                  <button style={btnPrimary} onClick={handleSaveRecord} disabled={recordSaving}>
                    {recordSaving ? 'Saving…' : 'Save Record'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Course Modal ─────────────────────────────────────────────────── */}
        {showCourseModal && editCourse && (
          <div style={modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowCourseModal(false); }}>
            <div style={{ ...modalBox, maxWidth: 480 }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  {editCourse.id ? 'Edit Course' : 'Add Course'}
                </h2>
                <button onClick={() => setShowCourseModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                {courseError && (
                  <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.9rem' }}>
                    {courseError}
                  </div>
                )}

                <div style={formGroup}>
                  <label style={label}>Title *</label>
                  <input
                    style={input}
                    value={editCourse.title ?? ''}
                    onChange={(e) => setEditCourse((p) => ({ ...p!, title: e.target.value }))}
                    placeholder="e.g. Data Analysis with Python"
                  />
                </div>

                <div style={formGroup}>
                  <label style={label}>Category</label>
                  <select
                    style={input}
                    value={editCourse.category ?? 'general'}
                    onChange={(e) => setEditCourse((p) => ({ ...p!, category: e.target.value }))}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{fmtStatus(c)}</option>
                    ))}
                  </select>
                </div>

                <div style={formGroup}>
                  <label style={label}>Provider</label>
                  <input
                    style={input}
                    value={editCourse.provider ?? ''}
                    onChange={(e) => setEditCourse((p) => ({ ...p!, provider: e.target.value }))}
                    placeholder="e.g. LinkedIn Learning"
                  />
                </div>

                <div style={formGroup}>
                  <label style={label}>Duration (hours)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    style={input}
                    value={editCourse.duration_hours ?? ''}
                    onChange={(e) => setEditCourse((p) => ({ ...p!, duration_hours: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="e.g. 8"
                  />
                </div>

                <div style={formGroup}>
                  <label style={label}>Description</label>
                  <textarea
                    style={{ ...input, minHeight: 80, resize: 'vertical' }}
                    value={editCourse.description ?? ''}
                    onChange={(e) => setEditCourse((p) => ({ ...p!, description: e.target.value }))}
                    placeholder="Brief course description…"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button style={btnSecondary} onClick={() => setShowCourseModal(false)}>Cancel</button>
                  <button style={btnPrimary} onClick={handleSaveCourse} disabled={courseSaving}>
                    {courseSaving ? 'Saving…' : 'Save Course'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Skill Modal ──────────────────────────────────────────────────── */}
        {showSkillModal && editSkill && (
          <div style={modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowSkillModal(false); }}>
            <div style={{ ...modalBox, maxWidth: 480 }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  {editSkill.id ? 'Edit Skill' : 'Add Skill'}
                </h2>
                <button onClick={() => setShowSkillModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)' }}>×</button>
              </div>
              <div style={{ padding: '1.5rem' }}>
                {skillError && (
                  <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: '0.9rem' }}>
                    {skillError}
                  </div>
                )}

                <div style={formGroup}>
                  <label style={label}>Employee *</label>
                  <select
                    style={input}
                    value={editSkill.user_id ?? ''}
                    onChange={(e) => setEditSkill((p) => ({ ...p!, user_id: e.target.value }))}
                  >
                    <option value="">— Select Employee —</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name}{emp.employee_id ? ` (${emp.employee_id})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={formGroup}>
                  <label style={label}>Skill Name *</label>
                  <input
                    style={input}
                    value={editSkill.skill_name ?? ''}
                    onChange={(e) => setEditSkill((p) => ({ ...p!, skill_name: e.target.value }))}
                    placeholder="e.g. Python, Project Management"
                  />
                </div>

                <div style={formGroup}>
                  <label style={label}>Skill Category</label>
                  <select
                    style={input}
                    value={editSkill.skill_category ?? 'technical'}
                    onChange={(e) => setEditSkill((p) => ({ ...p!, skill_category: e.target.value }))}
                  >
                    {SKILL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{fmtStatus(c)}</option>
                    ))}
                  </select>
                </div>

                <div style={formGroup}>
                  <label style={label}>Proficiency (1–5)</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setEditSkill((p) => ({ ...p!, proficiency: n }))}
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 6,
                          border: editSkill.proficiency === n ? '2px solid var(--primary-600)' : '1px solid var(--gray-300)',
                          background: editSkill.proficiency === n ? 'var(--primary-600)' : '#fff',
                          color: editSkill.proficiency === n ? '#fff' : 'var(--gray-700)',
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: '1rem',
                        }}
                      >
                        {n}
                      </button>
                    ))}
                    <span style={{ marginLeft: 8, color: 'var(--gray-400)', alignSelf: 'center', fontSize: '0.85rem' }}>
                      <Stars value={editSkill.proficiency ?? 3} />
                    </span>
                  </div>
                </div>

                <div style={formGroup}>
                  <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editSkill.certified ?? false}
                      onChange={(e) => setEditSkill((p) => ({ ...p!, certified: e.target.checked }))}
                    />
                    Certified
                  </label>
                </div>

                {editSkill.certified && (
                  <>
                    <div style={formGroup}>
                      <label style={label}>Certification Body</label>
                      <input
                        style={input}
                        value={editSkill.certification_body ?? ''}
                        onChange={(e) => setEditSkill((p) => ({ ...p!, certification_body: e.target.value }))}
                        placeholder="e.g. Google, PMI"
                      />
                    </div>
                    <div style={formGroup}>
                      <label style={label}>Expiry Date</label>
                      <input
                        type="date"
                        style={input}
                        value={editSkill.expiry_date ?? ''}
                        onChange={(e) => setEditSkill((p) => ({ ...p!, expiry_date: e.target.value || null }))}
                      />
                    </div>
                  </>
                )}

                <div style={formGroup}>
                  <label style={label}>Notes</label>
                  <textarea
                    style={{ ...input, minHeight: 70, resize: 'vertical' }}
                    value={editSkill.notes ?? ''}
                    onChange={(e) => setEditSkill((p) => ({ ...p!, notes: e.target.value }))}
                    placeholder="Any additional notes…"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button style={btnSecondary} onClick={() => setShowSkillModal(false)}>Cancel</button>
                  <button style={btnPrimary} onClick={handleSaveSkill} disabled={skillSaving}>
                    {skillSaving ? 'Saving…' : 'Save Skill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
