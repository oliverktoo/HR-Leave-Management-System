import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { getLeaveBalances, getLeaveRequests } from '../../services/leaveService';
import { getUserDocuments, getDocumentCompletion } from '../../services/documentService';
import { getAllBenefits, BENEFIT_TYPE_LABELS, formatKES } from '../../services/benefitsService';
import { getAllEmployeeTraining, getAllSkills } from '../../services/trainingService';
import { getAllDisciplinaryCases } from '../../services/disciplinaryService';
import type { UserProfile, LeaveBalance, LeaveRequest, DocumentCompletion } from '../../types';
import type { EmployeeBenefit } from '../../services/benefitsService';
import type { EmployeeTraining, EmployeeSkill } from '../../services/trainingService';
import type { DisciplinaryCase } from '../../services/disciplinaryService';

type Tab = 'overview' | 'leave' | 'attendance' | 'documents' | 'payroll' | 'benefits' | 'training' | 'assets' | 'disciplinary';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin', hr_admin: 'HR Admin', hod: 'Head of Department',
  fleet_manager: 'Fleet Manager', driver: 'Driver', employee: 'Employee',
  finance: 'Finance', ceo: 'CEO',
};
const STATUS_COLOR: Record<string, string> = {
  approved: '#22c55e', pending: '#f59e0b', rejected: '#ef4444',
  cancelled: '#94a3b8', completed: '#3b82f6', recalled: '#d97706',
};
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile: authProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [faceRegistered, setFaceRegistered] = useState(false);
  const [faceResetting, setFaceResetting] = useState(false);

  // Core data
  const [profile, setProfile] = useState<UserProfile & { departments?: { name: string } | null } | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [docCompletion, setDocCompletion] = useState<DocumentCompletion | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [payrollProfile, setPayrollProfile] = useState<any>(null);
  const [benefits, setBenefits] = useState<EmployeeBenefit[]>([]);
  const [training, setTraining] = useState<EmployeeTraining[]>([]);
  const [skills, setSkills] = useState<EmployeeSkill[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [disciplinary, setDisciplinary] = useState<DisciplinaryCase[]>([]);

  useEffect(() => {
    if (id) loadAll(id);
  }, [id]);

  const loadAll = async (userId: string) => {
    setLoading(true);
    setError('');
    try {
      const [
        profileRes,
        leaveBal,
        leaveReqs,
        attRes,
        docsRes,
        docComp,
        payRes,
        benRes,
        trainRes,
        skillRes,
        assetsRes,
        discRes,
      ] = await Promise.all([
        supabase.from('users_profile').select('*, profile_photo_url, face_descriptor').eq('id', userId).single(),
        getLeaveBalances(userId),
        getLeaveRequests(userId, {}),
        supabase.from('attendance_records').select('*').eq('user_id', userId).order('date', { ascending: false }).limit(60),
        getUserDocuments(userId),
        getDocumentCompletion(userId),
        supabase.from('payroll_employee_profiles').select('*').eq('user_id', userId).maybeSingle(),
        getAllBenefits(userId),
        getAllEmployeeTraining({ userId }),
        getAllSkills(userId),
        supabase.from('asset_assignments').select('*, assets(name,category,asset_tag)').eq('user_id', userId).is('returned_at', null),
        getAllDisciplinaryCases(),
      ]);

      if (profileRes.error) throw profileRes.error;
      // Resolve department name separately to avoid ambiguous FK error
      let deptName: string | undefined;
      if (profileRes.data?.department_id) {
        const { data: dept } = await supabase
          .from('departments')
          .select('name')
          .eq('id', profileRes.data.department_id)
          .single();
        deptName = dept?.name;
      }
      setProfile({ ...profileRes.data, departments: deptName ? { name: deptName } : null } as any);
      setFaceRegistered(!!(profileRes.data as any)?.profile_photo_url);
      if (leaveBal.data)  setLeaveBalances(leaveBal.data);
      if (leaveReqs.data) setLeaveRequests(leaveReqs.data);
      if (attRes.data)    setAttendance(attRes.data);
      if (docsRes.data)   setDocs(docsRes.data);
      if (docComp.data)   setDocCompletion(docComp.data);
      if (payRes.data)    setPayrollProfile(payRes.data);
      setBenefits(benRes);
      setTraining(trainRes);
      setSkills(skillRes);
      if (assetsRes.data) setAssets(assetsRes.data);
      if (discRes.data)   setDisciplinary(discRes.data.filter((c: DisciplinaryCase) => c.user_id === userId));
    } catch (e: any) {
      setError(e.message || 'Failed to load employee profile');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset face registration ─────────────────────────────────────────────────
  const handleResetFace = async () => {
    if (!id) return;
    if (!window.confirm('This will remove the employee\'s registered face photo and require them to re-register. Continue?')) return;
    setFaceResetting(true);
    const { error: resetErr } = await supabase
      .from('users_profile')
      .update({ profile_photo_url: null, face_descriptor: null })
      .eq('id', id);
    setFaceResetting(false);
    if (resetErr) { setError('Failed to reset face registration: ' + resetErr.message); return; }
    setFaceRegistered(false);
  };

  // ── Computed stats ──────────────────────────────────────────────────────────
  const totalLeaveDaysRemaining = leaveBalances.reduce((s, b) => s + Math.max(0, (b.annual_allocation ?? 0) + (b.carryforward_days ?? 0) - (b.used_days ?? 0) - (b.pending_days ?? 0)), 0);
  const last30 = attendance.filter(a => {
    const d = new Date(a.date);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    return d >= cutoff;
  });
  const presentDays = last30.filter(a => a.status === 'present' || a.check_in_time).length;
  const attendancePct = last30.length > 0 ? Math.round((presentDays / last30.length) * 100) : null;
  const docPct = docCompletion?.completion_percentage ?? null;
  const activeAssets = assets.length;

  // ── Tabs config ─────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview',     label: 'Overview',     icon: '🏠' },
    { id: 'leave',        label: 'Leave',         icon: '🏖️' },
    { id: 'attendance',   label: 'Attendance',    icon: '📅' },
    { id: 'documents',    label: 'Documents',     icon: '📁' },
    { id: 'payroll',      label: 'Payroll',       icon: '💰' },
    { id: 'benefits',     label: 'Benefits',      icon: '🎁' },
    { id: 'training',     label: 'Training',      icon: '🎓' },
    { id: 'assets',       label: 'Assets',        icon: '📦' },
    { id: 'disciplinary', label: 'Disciplinary',  icon: '⚖️' },
  ];

  if (loading) return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
          <p>Loading employee profile…</p>
        </div>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
        <div className="alert alert-error">{error || 'Employee not found'}</div>
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
      </div>
    </div>
  );

  const initials = `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase();
  const fullName = `${profile.first_name} ${profile.last_name}`;

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Back</button>
          <NotificationBell />
        </div>

        {/* ── Profile header ───────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '1.75rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
            {/* Avatar */}
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem', fontWeight: 700, color: 'white', flexShrink: 0 }}>
              {initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>{fullName}</h1>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 9999,
                  background: profile.is_active ? '#d1fae5' : '#fee2e2',
                  color: profile.is_active ? '#065f46' : '#991b1b'
                }}>
                  {profile.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                {ROLE_LABELS[profile.role] ?? profile.role}
                {profile.secondary_role && ` · ${ROLE_LABELS[profile.secondary_role] ?? profile.secondary_role}`}
                {(profile as any).departments?.name && ` · ${(profile as any).departments.name}`}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.83rem', color: '#64748b', marginBottom: '0.75rem' }}>
                <span>🪪 {profile.employee_id || '—'}</span>
                <span>✉️ {profile.email}</span>
                {profile.phone && <span>📞 {profile.phone}</span>}
              </div>
              {/* Face registration status + reset (HR/Admin only) */}
              {(authProfile?.role === 'hr_admin' || authProfile?.role === 'super_admin') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px', borderRadius: 9999,
                    background: faceRegistered ? '#d1fae5' : '#fef3c7',
                    color: faceRegistered ? '#065f46' : '#92400e',
                  }}>
                    {faceRegistered ? '🤳 Face Registered' : '⚠️ Face Not Registered'}
                  </span>
                  {faceRegistered && (
                    <button
                      className="btn btn-sm"
                      onClick={handleResetFace}
                      disabled={faceResetting}
                      style={{ fontSize: '0.75rem', padding: '2px 10px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 9999, cursor: 'pointer' }}
                    >
                      {faceResetting ? 'Resetting…' : '↺ Reset Face'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flexShrink: 0 }}>
              {[
                { label: 'Leave Days Left', value: totalLeaveDaysRemaining, color: '#6366f1', icon: '🏖️' },
                { label: 'Attendance (30d)', value: attendancePct !== null ? `${attendancePct}%` : '—', color: attendancePct !== null && attendancePct < 80 ? '#ef4444' : '#22c55e', icon: '📅' },
                { label: 'Doc Compliance', value: docPct !== null ? `${Math.round(docPct)}%` : '—', color: docPct !== null && docPct < 80 ? '#f59e0b' : '#22c55e', icon: '📁' },
                { label: 'Active Assets', value: activeAssets, color: '#3b82f6', icon: '📦' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', background: '#f8fafc', borderRadius: '10px', padding: '0.75rem 1rem', minWidth: 90 }}>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.2rem' }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tab navigation ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.4rem', marginBottom: '1.5rem', flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '0.45rem 0.9rem', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                background: activeTab === t.id ? '#6366f1' : 'transparent',
                color: activeTab === t.id ? 'white' : '#64748b',
                transition: 'all 0.15s',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Employee Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1rem' }}>
                {[
                  { title: 'Leave Balances', icon: '🏖️', tab: 'leave' as Tab, items: leaveBalances.slice(0, 3).map(b => { const rem = Math.max(0, (b.annual_allocation ?? 0) + (b.carryforward_days ?? 0) - (b.used_days ?? 0) - (b.pending_days ?? 0)); return `${(b as any).leave_types?.name ?? 'Leave'}: ${rem} days left`; }) },
                  { title: 'Recent Attendance', icon: '📅', tab: 'attendance' as Tab, items: attendance.slice(0, 3).map(a => `${fmtDate(a.date)} — ${a.status ?? (a.check_in_time ? 'present' : 'absent')}`) },
                  { title: 'Documents', icon: '📁', tab: 'documents' as Tab, items: [`${docCompletion?.completed ?? 0} / ${docCompletion?.total_required ?? 0} required docs submitted`, `${Math.max(0, (docCompletion?.total_required ?? 0) - (docCompletion?.completed ?? 0))} missing`] },
                  { title: 'Payroll', icon: '💰', tab: 'payroll' as Tab, items: payrollProfile ? [`Basic salary: KES ${Number(payrollProfile.basic_salary ?? 0).toLocaleString('en-KE')}`, `KRA PIN: ${payrollProfile.kra_pin || 'Not set'}`] : ['No payroll profile'] },
                  { title: 'Active Assets', icon: '📦', tab: 'assets' as Tab, items: assets.slice(0, 3).map(a => a.assets?.name ?? 'Asset') },
                  { title: 'Benefits', icon: '🎁', tab: 'benefits' as Tab, items: benefits.slice(0, 3).map(b => BENEFIT_TYPE_LABELS[b.benefit_type] ?? b.benefit_type) },
                  { title: 'Training', icon: '🎓', tab: 'training' as Tab, items: training.slice(0, 3).map(t => t.course_title) },
                  { title: 'Disciplinary', icon: '⚖️', tab: 'disciplinary' as Tab, items: disciplinary.length === 0 ? ['No records'] : disciplinary.slice(0, 3).map(d => `${d.action_type} — ${fmtDate(d.incident_date)}`) },
                ].map(card => (
                  <div
                    key={card.title}
                    onClick={() => setActiveTab(card.tab)}
                    style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', cursor: 'pointer', transition: 'box-shadow 0.15s', background: '#fafafa' }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
                  >
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.6rem', fontSize: '0.88rem' }}>
                      {card.icon} {card.title}
                    </div>
                    {card.items.length === 0
                      ? <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>No data</p>
                      : card.items.map((item, i) => (
                        <p key={i} style={{ margin: '0 0 0.25rem', color: '#64748b', fontSize: '0.8rem' }}>• {item}</p>
                      ))
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LEAVE */}
          {activeTab === 'leave' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Leave Balances — {new Date().getFullYear()}</h3>
              {leaveBalances.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No leave balances for this year.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
                  {leaveBalances.map(b => {
                    const used = b.used_days ?? 0;
                    const total = (b.annual_allocation ?? 0) + (b.carryforward_days ?? 0);
                    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                    return (
                      <div key={b.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.5rem' }}>
                          {(b as any).leave_types?.name ?? 'Leave'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginBottom: '0.4rem' }}>
                          <span>Used: {used}</span><span>Total: {total}</span>
                        </div>
                        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3 }}>
                          <div style={{ height: 6, width: `${Math.min(pct, 100)}%`, background: pct > 80 ? '#ef4444' : '#6366f1', borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                          {Math.max(0, total - used)} days remaining
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Leave History</h3>
              {leaveRequests.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No leave requests found.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Type', 'From', 'To', 'Days', 'Status', 'Applied'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests.slice(0, 20).map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{(r as any).leave_types?.name ?? '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{fmtDate(r.start_date)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{fmtDate(r.end_date)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{r.total_days}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: `${STATUS_COLOR[r.status] ?? '#94a3b8'}22`, color: STATUS_COLOR[r.status] ?? '#64748b' }}>
                            {r.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8' }}>{fmtDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                {[
                  { label: 'Days Present (30d)', value: presentDays, color: '#22c55e' },
                  { label: 'Days Absent (30d)', value: last30.length - presentDays, color: '#ef4444' },
                  { label: 'Attendance Rate', value: attendancePct !== null ? `${attendancePct}%` : '—', color: '#6366f1' },
                ].map(s => (
                  <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '1rem 1.5rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Recent Records</h3>
              {attendance.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No attendance records found.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Date', 'Check In', 'Check Out', 'Status', 'Location'].map(h => (
                        <th key={h} style={{ padding: '0.6rem 0.75rem', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attendance.slice(0, 30).map((a, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{fmtDate(a.date)}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>{a.check_out_time ? new Date(a.check_out_time).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td style={{ padding: '0.6rem 0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: a.status === 'present' ? '#d1fae5' : a.status === 'late' ? '#fef3c7' : '#fee2e2', color: a.status === 'present' ? '#065f46' : a.status === 'late' ? '#b45309' : '#991b1b' }}>
                            {a.status ?? (a.check_in_time ? 'present' : 'absent')}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.75rem', color: '#94a3b8', fontSize: '0.78rem' }}>{a.location_name || a.office_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* DOCUMENTS */}
          {activeTab === 'documents' && (
            <div>
              {docCompletion && (
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Submitted', value: docCompletion.completed, color: '#22c55e' },
                    { label: 'Required', value: docCompletion.total_required, color: '#6366f1' },
                    { label: 'Missing', value: Math.max(0, (docCompletion.total_required ?? 0) - (docCompletion.completed ?? 0)), color: '#ef4444' },
                    { label: 'Compliance', value: `${Math.round(docCompletion.completion_percentage ?? 0)}%`, color: (docCompletion.completion_percentage ?? 0) >= 80 ? '#22c55e' : '#f59e0b' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#f8fafc', borderRadius: '10px', padding: '1rem 1.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {docCompletion && (docCompletion.total_required ?? 0) > (docCompletion.completed ?? 0) && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '10px', padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
                  <strong style={{ color: '#c2410c', fontSize: '0.85rem' }}>
                    ⚠️ {(docCompletion.total_required ?? 0) - (docCompletion.completed ?? 0)} required document(s) not yet uploaded
                  </strong>
                </div>
              )}
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Uploaded Documents</h3>
              {docs.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No documents uploaded.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {docs.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafafa' }}>
                      <span style={{ fontSize: '1.25rem' }}>📄</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{d.document_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{d.document_type_display || d.document_type} · {fmtDate(d.created_at)}</div>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: d.is_verified ? '#d1fae5' : '#fef3c7', color: d.is_verified ? '#065f46' : '#b45309' }}>
                        {d.is_verified ? '✓ Verified' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PAYROLL */}
          {activeTab === 'payroll' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Payroll Profile</h3>
              {!payrollProfile ? (
                <p style={{ color: '#94a3b8' }}>No payroll profile set up for this employee.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: '0.75rem' }}>
                  {[
                    { label: 'Basic Salary', value: `KES ${Number(payrollProfile.basic_salary ?? 0).toLocaleString('en-KE')}` },
                    { label: 'Employment Type', value: payrollProfile.employment_type ?? '—' },
                    { label: 'KRA PIN', value: payrollProfile.kra_pin || 'Not set' },
                    { label: 'NSSF Number', value: payrollProfile.nssf_number || 'Not set' },
                    { label: 'SHA/SHIF Number', value: payrollProfile.sha_number || payrollProfile.nhif_number || 'Not set' },
                    { label: 'HELB Deduction', value: payrollProfile.helb_monthly_deduction ? `KES ${Number(payrollProfile.helb_monthly_deduction).toLocaleString('en-KE')}` : 'None' },
                    { label: 'Bank', value: payrollProfile.bank_name || '—' },
                    { label: 'Account Number', value: payrollProfile.bank_account_number ? `****${String(payrollProfile.bank_account_number).slice(-4)}` : '—' },
                    { label: 'Payroll Active', value: payrollProfile.is_payroll_active ? '✅ Yes' : '❌ No' },
                  ].map(row => (
                    <div key={row.label} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.875rem 1rem', background: '#fafafa' }}>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>{row.label}</div>
                      <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{row.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* BENEFITS */}
          {activeTab === 'benefits' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Benefits</h3>
              {benefits.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No benefits recorded.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {benefits.map(b => (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafafa' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>{BENEFIT_TYPE_LABELS[b.benefit_type] ?? b.benefit_type}</div>
                        {b.provider && <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Provider: {b.provider}</div>}
                        {b.effective_date && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Effective: {fmtDate(b.effective_date)}</div>}
                      </div>
                      {(b.employer_contribution ?? b.employee_contribution) && (
                        <div style={{ fontWeight: 700, color: '#6366f1', fontSize: '0.9rem' }}>{formatKES((b.employer_contribution ?? b.employee_contribution)!)}/mo</div>
                      )}
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: b.is_active ? '#d1fae5' : '#f1f5f9', color: b.is_active ? '#065f46' : '#94a3b8' }}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TRAINING */}
          {activeTab === 'training' && (
            <div>
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1' }}>{training.length}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Training records</div>
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{skills.length}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Skills</div>
                </div>
              </div>

              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Training History</h3>
              {training.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No training records.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {training.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafafa' }}>
                      <span style={{ fontSize: '1.1rem' }}>🎓</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>{t.course_title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t.provider ?? ''}{t.completion_date ? ` · Completed ${fmtDate(t.completion_date)}` : ''}</div>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#d1fae5', color: '#065f46' }}>
                        {t.status ?? 'Completed'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {skills.length > 0 && (
                <>
                  <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 700 }}>Skills</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {skills.map(s => (
                      <span key={s.id} style={{ background: '#ede9fe', color: '#6d28d9', padding: '4px 12px', borderRadius: 9999, fontSize: '0.8rem', fontWeight: 500 }}>
                        {s.skill_name} {s.proficiency ? `· ${s.proficiency}` : ''}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ASSETS */}
          {activeTab === 'assets' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Assigned Assets</h3>
              {assets.length === 0 ? (
                <p style={{ color: '#94a3b8' }}>No assets currently assigned.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {assets.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fafafa' }}>
                      <span style={{ fontSize: '1.5rem' }}>📦</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#1e293b' }}>{a.assets?.name ?? 'Asset'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {a.assets?.category ?? ''}{a.assets?.asset_tag ? ` · Tag: ${a.assets.asset_tag}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Issued: {fmtDate(a.issued_at)}</div>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999, background: '#dbeafe', color: '#1e40af' }}>
                        {a.condition_on_issue ?? 'Active'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DISCIPLINARY */}
          {activeTab === 'disciplinary' && (
            <div>
              <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 700 }}>Disciplinary Records</h3>
              {disciplinary.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>Clean record — no disciplinary cases.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {disciplinary.map(d => (
                    <div key={d.id} style={{ border: '1px solid #fecaca', borderRadius: '10px', padding: '1rem', background: '#fff5f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.88rem' }}>{d.action_type}</div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{fmtDate(d.incident_date)}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#475569' }}>{d.incident_description}</div>
                      {d.outcome && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', borderTop: '1px solid #fecaca', paddingTop: '0.5rem' }}>
                          <strong>Resolution:</strong> {d.outcome}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
