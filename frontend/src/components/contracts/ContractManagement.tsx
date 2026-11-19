import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getAllContracts,
  createContract,
  updateContract,
  getAllOnboardingChecklists,
  createOnboardingChecklist,
  updateOnboardingTasks,
  type EmployeeContract,
  type OnboardingChecklist,
  type OnboardingTask,
} from '../../services/contractService';

interface EmployeeOption {
  id: string;
  employee_id: string;
  full_name: string;
}

const CONTRACT_TYPES: EmployeeContract['contract_type'][] = [
  'permanent', 'fixed_term', 'probation', 'contract', 'internship', 'casual',
];

const CONTRACT_STATUSES: EmployeeContract['status'][] = [
  'active', 'expired', 'terminated', 'renewed', 'draft',
];

const statusColor = (status: string): React.CSSProperties => {
  const map: Record<string, React.CSSProperties> = {
    active:     { background: '#dcfce7', color: '#15803d' },
    expired:    { background: '#fee2e2', color: '#b91c1c' },
    terminated: { background: '#fecaca', color: '#991b1b' },
    renewed:    { background: '#dbeafe', color: '#1d4ed8' },
    draft:      { background: '#f3f4f6', color: '#4b5563' },
  };
  return map[status] ?? { background: '#f3f4f6', color: '#4b5563' };
};

const expiryStyle = (days: number | null | undefined): React.CSSProperties => {
  if (days === null || days === undefined) return { color: '#15803d', fontWeight: 600 };
  if (days <= 7)  return { color: '#b91c1c', fontWeight: 700 };
  if (days <= 30) return { color: '#d97706', fontWeight: 600 };
  return { color: '#15803d', fontWeight: 600 };
};

const expiryLabel = (contract: EmployeeContract): string => {
  if (!contract.end_date) return 'Permanent';
  if (contract.days_to_expiry === null || contract.days_to_expiry === undefined) return '—';
  if (contract.days_to_expiry < 0) return `Expired ${Math.abs(contract.days_to_expiry)}d ago`;
  return `${contract.days_to_expiry}d`;
};

const DEFAULT_TASKS: OnboardingTask[] = [
  { key: 'contract_signed',     label: 'Contract Signed',           done: false, due_days: 1 },
  { key: 'id_docs_submitted',   label: 'ID/Passport Submitted',     done: false, due_days: 1 },
  { key: 'bank_details',        label: 'Bank Details Provided',     done: false, due_days: 3 },
  { key: 'tax_pin',             label: 'KRA PIN Submitted',         done: false, due_days: 3 },
  { key: 'nssf_number',         label: 'NSSF Number Provided',      done: false, due_days: 5 },
  { key: 'sha_number',          label: 'SHA/NHIF Number Provided',  done: false, due_days: 5 },
  { key: 'email_setup',         label: 'Work Email Setup',          done: false, due_days: 1 },
  { key: 'system_access',       label: 'System Access Granted',     done: false, due_days: 2 },
  { key: 'induction_completed', label: 'Induction Completed',       done: false, due_days: 7 },
  { key: 'it_equipment',        label: 'IT Equipment Issued',       done: false, due_days: 2 },
];

export const ContractManagement = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'contracts' | 'onboarding'>('contracts');

  // ── Contracts state ────────────────────────────────────────────────────────
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [newContract, setNewContract] = useState({
    user_id: '',
    employee_id: '',
    contract_type: 'fixed_term' as EmployeeContract['contract_type'],
    start_date: '',
    end_date: '',
    probation_end_date: '',
    job_title: '',
    gross_salary: '',
    notes: '',
    status: 'active' as EmployeeContract['status'],
  });

  // Status edit modal
  const [editStatusContract, setEditStatusContract] = useState<EmployeeContract | null>(null);
  const [newStatus, setNewStatus] = useState<EmployeeContract['status']>('active');
  const [statusSaving, setStatusSaving] = useState(false);

  // ── Onboarding state ───────────────────────────────────────────────────────
  const [checklists, setChecklists] = useState<OnboardingChecklist[]>([]);
  const [checklistsLoading, setChecklistsLoading] = useState(true);
  const [viewChecklist, setViewChecklist] = useState<OnboardingChecklist | null>(null);
  const [tasksDraft, setTasksDraft] = useState<OnboardingTask[]>([]);
  const [tasksSaving, setTasksSaving] = useState(false);
  const [showCreateChecklist, setShowCreateChecklist] = useState(false);
  const [newChecklistUserId, setNewChecklistUserId] = useState('');
  const [newChecklistContractId, setNewChecklistContractId] = useState('');
  const [createChecklistLoading, setCreateChecklistLoading] = useState(false);
  const [createChecklistError, setCreateChecklistError] = useState('');

  useEffect(() => {
    loadContracts();
    loadEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === 'onboarding') loadChecklists();
  }, [activeTab]);

  const loadContracts = async () => {
    setContractsLoading(true);
    const { data } = await getAllContracts();
    setContracts(data ?? []);
    setContractsLoading(false);
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

  const loadChecklists = async () => {
    setChecklistsLoading(true);
    const { data } = await getAllOnboardingChecklists();
    setChecklists(data ?? []);
    setChecklistsLoading(false);
  };

  // ── Summary cards ──────────────────────────────────────────────────────────
  const totalActive      = contracts.filter(c => c.status === 'active').length;
  const expiring30       = contracts.filter(c => c.status === 'active' && c.days_to_expiry !== null && c.days_to_expiry !== undefined && c.days_to_expiry >= 0 && c.days_to_expiry <= 30).length;
  const expired          = contracts.filter(c => c.status === 'expired' || (c.days_to_expiry !== null && c.days_to_expiry !== undefined && c.days_to_expiry < 0)).length;
  const onProbation      = contracts.filter(c => c.contract_type === 'probation' && c.status === 'active').length;

  // ── Filtered contracts ─────────────────────────────────────────────────────
  const filtered = contracts.filter(c => {
    const nameMatch = (c.employee_name ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.job_title ?? '').toLowerCase().includes(searchTerm.toLowerCase());
    const statusMatch = filterStatus === 'all' || c.status === filterStatus;
    const typeMatch   = filterType   === 'all' || c.contract_type === filterType;
    return nameMatch && statusMatch && typeMatch;
  });

  // ── Add contract ───────────────────────────────────────────────────────────
  const handleAddContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    if (!newContract.user_id) { setAddError('Please select an employee.'); return; }
    if (!newContract.start_date) { setAddError('Start date is required.'); return; }
    setAddLoading(true);
    const emp = employees.find(e => e.id === newContract.user_id);
    const { error } = await createContract({
      user_id:            newContract.user_id,
      employee_id:        emp?.employee_id ?? '',
      contract_type:      newContract.contract_type,
      start_date:         newContract.start_date,
      end_date:           newContract.end_date || null,
      probation_end_date: newContract.probation_end_date || null,
      job_title:          newContract.job_title || null,
      department_id:      null,
      gross_salary:       newContract.gross_salary ? parseFloat(newContract.gross_salary) : null,
      status:             newContract.status,
      notes:              newContract.notes || null,
      document_url:       null,
      renewed_to_id:      null,
    });
    setAddLoading(false);
    if (error) { setAddError(error.message ?? 'Failed to create contract.'); return; }
    setShowAddModal(false);
    setNewContract({ user_id: '', employee_id: '', contract_type: 'fixed_term', start_date: '', end_date: '', probation_end_date: '', job_title: '', gross_salary: '', notes: '', status: 'active' });
    loadContracts();
  };

  // ── Status update ──────────────────────────────────────────────────────────
  const handleStatusUpdate = async () => {
    if (!editStatusContract) return;
    setStatusSaving(true);
    await updateContract(editStatusContract.id, { status: newStatus });
    setStatusSaving(false);
    setEditStatusContract(null);
    loadContracts();
  };

  // ── Onboarding task toggle ─────────────────────────────────────────────────
  const toggleTask = (key: string) => {
    const now = new Date().toISOString();
    const name = profile ? `${(profile as any).first_name} ${(profile as any).last_name}` : 'HR Admin';
    setTasksDraft(prev => prev.map(t =>
      t.key === key
        ? t.done
          ? { ...t, done: false, done_at: undefined, done_by_name: undefined }
          : { ...t, done: true, done_at: now, done_by_name: name }
        : t
    ));
  };

  const markAllComplete = () => {
    const now = new Date().toISOString();
    const name = profile ? `${(profile as any).first_name} ${(profile as any).last_name}` : 'HR Admin';
    setTasksDraft(prev => prev.map(t => ({ ...t, done: true, done_at: t.done_at ?? now, done_by_name: t.done_by_name ?? name })));
  };

  const saveTasks = async () => {
    if (!viewChecklist) return;
    setTasksSaving(true);
    await updateOnboardingTasks(viewChecklist.id, tasksDraft);
    setTasksSaving(false);
    loadChecklists();
    const updated = { ...viewChecklist, tasks: tasksDraft };
    setViewChecklist(updated);
  };

  const openChecklist = (checklist: OnboardingChecklist) => {
    setViewChecklist(checklist);
    setTasksDraft(checklist.tasks?.length ? [...checklist.tasks] : [...DEFAULT_TASKS]);
  };

  // ── Create checklist ───────────────────────────────────────────────────────
  const handleCreateChecklist = async () => {
    if (!newChecklistUserId) { setCreateChecklistError('Please select an employee.'); return; }
    setCreateChecklistLoading(true);
    setCreateChecklistError('');
    const emp = employees.find(e => e.id === newChecklistUserId);
    const { error } = await createOnboardingChecklist(
      newChecklistUserId,
      emp?.employee_id ?? '',
      newChecklistContractId || undefined
    );
    setCreateChecklistLoading(false);
    if (error) { setCreateChecklistError(error.message ?? 'Failed to create checklist.'); return; }
    setShowCreateChecklist(false);
    setNewChecklistUserId('');
    setNewChecklistContractId('');
    loadChecklists();
  };

  const tasksDone  = (tasks: OnboardingTask[]) => tasks.filter(t => t.done).length;
  const tasksTotal = (tasks: OnboardingTask[]) => tasks.length;

  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000, padding: '1rem',
  };
  const modalBox: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: '2rem',
    width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>
              Contracts &amp; Onboarding
            </h1>
            <p style={{ color: 'var(--gray-500)', marginTop: 4, marginBottom: 0 }}>
              Manage employment contracts and onboarding checklists
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <NotificationBell />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--gray-200)', marginBottom: '1.5rem' }}>
          {(['contracts', 'onboarding'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: '0.95rem',
                color: activeTab === tab ? 'var(--primary-600)' : 'var(--gray-500)',
                borderBottom: activeTab === tab ? '2px solid var(--primary-600)' : '2px solid transparent',
                marginBottom: -2, textTransform: 'capitalize',
              }}
            >
              {tab === 'contracts' ? 'Contracts' : 'Onboarding'}
            </button>
          ))}
        </div>

        {/* ── CONTRACTS TAB ────────────────────────────────────────────── */}
        {activeTab === 'contracts' && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              {[
                { label: 'Total Active',        value: totalActive, bg: '#eff6ff', color: '#1d4ed8', icon: '📄' },
                { label: 'Expiring in 30 Days', value: expiring30,  bg: '#fffbeb', color: '#b45309', icon: '⚠️' },
                { label: 'Expired',             value: expired,     bg: '#fef2f2', color: '#b91c1c', icon: '❌' },
                { label: 'On Probation',        value: onProbation, bg: '#f5f3ff', color: '#6d28d9', icon: '🔄' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{card.icon}</span>
                  <div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color }}>{card.value}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--gray-600)', fontWeight: 500 }}>{card.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters + Add button */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="search" placeholder="Search by name or job title…"
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: 1, minWidth: 200, padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', outline: 'none' }}
              />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', background: '#fff' }}>
                <option value="all">All Statuses</option>
                {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                style={{ padding: '0.6rem 0.875rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', background: '#fff' }}>
                <option value="all">All Types</option>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
              <button
                onClick={() => setShowAddModal(true)}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
              >
                + Add Contract
              </button>
            </div>

            {/* Table */}
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', overflow: 'hidden' }}>
              {contractsLoading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading contracts…</div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No contracts found.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                        {['Employee', 'Contract Type', 'Start Date', 'End Date', 'Expiry', 'Job Title', 'Status', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--gray-100)', background: i % 2 === 0 ? '#fff' : 'var(--gray-50)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--gray-800)' }}>{c.employee_name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>
                            {c.contract_type.replace('_', ' ').replace(/\b\w/g, ch => ch.toUpperCase())}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{c.start_date}</td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{c.end_date ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem', ...expiryStyle(c.days_to_expiry) }}>
                            {expiryLabel(c)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--gray-600)' }}>{c.job_title ?? '—'}</td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...statusColor(c.status) }}>
                              {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <button
                              onClick={() => { setEditStatusContract(c); setNewStatus(c.status); }}
                              style={{ padding: '0.3rem 0.75rem', background: 'var(--gray-100)', border: '1px solid var(--gray-300)', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                            >
                              Edit Status
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

        {/* ── ONBOARDING TAB ───────────────────────────────────────────── */}
        {activeTab === 'onboarding' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ color: 'var(--gray-600)', margin: 0 }}>
                {checklists.length} checklist{checklists.length !== 1 ? 's' : ''} total
              </p>
              <button
                onClick={() => setShowCreateChecklist(true)}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              >
                + Create Checklist
              </button>
            </div>

            {checklistsLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {checklists.map(cl => {
                  const done  = tasksDone(cl.tasks ?? []);
                  const total = tasksTotal(cl.tasks ?? DEFAULT_TASKS);
                  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={cl.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--gray-200)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{cl.employee_name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2 }}>
                          Started {new Date(cl.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{ padding: '0.25rem 0.625rem', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, ...(cl.status === 'completed' ? { background: '#dcfce7', color: '#15803d' } : { background: '#fef9c3', color: '#a16207' }) }}>
                        {cl.status === 'completed' ? 'Completed' : 'In Progress'}
                      </span>
                      <div style={{ minWidth: 180 }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--gray-500)', marginBottom: 4 }}>{done}/{total} tasks done</div>
                        <div style={{ background: 'var(--gray-200)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: pct === 100 ? '#22c55e' : 'var(--primary-600)', width: `${pct}%`, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                      <button
                        onClick={() => openChecklist(cl)}
                        style={{ padding: '0.4rem 0.875rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                      >
                        View
                      </button>
                    </div>
                  );
                })}
                {checklists.length === 0 && (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>No onboarding checklists yet.</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── ADD CONTRACT MODAL ─────────────────────────────────────────────── */}
      {showAddModal && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div style={modalBox}>
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.25rem', fontWeight: 700 }}>Add Employment Contract</h2>
            {addError && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{addError}</div>}
            <form onSubmit={handleAddContract} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Employee *</label>
                <select
                  value={newContract.user_id}
                  onChange={e => setNewContract(p => ({ ...p, user_id: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }}
                >
                  <option value="">Select employee…</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Contract Type *</label>
                <select
                  value={newContract.contract_type}
                  onChange={e => setNewContract(p => ({ ...p, contract_type: e.target.value as EmployeeContract['contract_type'] }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }}
                >
                  {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Start Date *</label>
                  <input type="date" required value={newContract.start_date} onChange={e => setNewContract(p => ({ ...p, start_date: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
                </div>
                <div>
                  <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>End Date</label>
                  <input type="date" value={newContract.end_date} onChange={e => setNewContract(p => ({ ...p, end_date: e.target.value }))}
                    style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
                </div>
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Probation End Date</label>
                <input type="date" value={newContract.probation_end_date} onChange={e => setNewContract(p => ({ ...p, probation_end_date: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Job Title</label>
                <input type="text" value={newContract.job_title} onChange={e => setNewContract(p => ({ ...p, job_title: e.target.value }))}
                  placeholder="e.g. Software Engineer"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Gross Salary (KES)</label>
                <input type="number" min="0" value={newContract.gross_salary} onChange={e => setNewContract(p => ({ ...p, gross_salary: e.target.value }))}
                  placeholder="e.g. 80000"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea rows={3} value={newContract.notes} onChange={e => setNewContract(p => ({ ...p, notes: e.target.value }))}
                  style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)}
                  style={{ padding: '0.625rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
                <button type="submit" disabled={addLoading}
                  style={{ padding: '0.625rem 1.5rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: addLoading ? 'not-allowed' : 'pointer', opacity: addLoading ? 0.7 : 1 }}>
                  {addLoading ? 'Saving…' : 'Save Contract'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT STATUS MODAL ────────────────────────────────────────────────── */}
      {editStatusContract && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setEditStatusContract(null)}>
          <div style={{ ...modalBox, maxWidth: 380 }}>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.15rem', fontWeight: 700 }}>Update Contract Status</h2>
            <p style={{ color: 'var(--gray-500)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              {editStatusContract.employee_name} — {editStatusContract.job_title ?? 'No title'}
            </p>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 6 }}>New Status</label>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value as EmployeeContract['status'])}
              style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              {CONTRACT_STATUSES.filter(s => s !== editStatusContract.status).map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditStatusContract(null)}
                style={{ padding: '0.6rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleStatusUpdate} disabled={statusSaving}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: statusSaving ? 'not-allowed' : 'pointer', opacity: statusSaving ? 0.7 : 1 }}>
                {statusSaving ? 'Saving…' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW CHECKLIST PANEL ──────────────────────────────────────────────── */}
      {viewChecklist && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setViewChecklist(null)}>
          <div style={{ ...modalBox, maxWidth: 680 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Onboarding — {viewChecklist.employee_name}</h2>
                <p style={{ color: 'var(--gray-500)', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  Started {new Date(viewChecklist.created_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => setViewChecklist(null)}
                style={{ border: 'none', background: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Overall progress */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.875rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--gray-600)', marginBottom: 6 }}>
                <span>Overall Progress</span>
                <span style={{ fontWeight: 700, color: 'var(--gray-800)' }}>
                  {tasksDraft.filter(t => t.done).length}/{tasksDraft.length} tasks
                </span>
              </div>
              <div style={{ background: 'var(--gray-200)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  background: tasksDraft.every(t => t.done) ? '#22c55e' : 'var(--primary-600)',
                  width: `${tasksDraft.length > 0 ? Math.round((tasksDraft.filter(t => t.done).length / tasksDraft.length) * 100) : 0}%`,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>

            {/* Tasks list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {tasksDraft.map(task => (
                <div key={task.key} style={{
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                  padding: '0.75rem', borderRadius: 8,
                  background: task.done ? '#f0fdf4' : '#fff',
                  border: `1px solid ${task.done ? '#bbf7d0' : 'var(--gray-200)'}`,
                }}>
                  <input
                    type="checkbox" checked={task.done}
                    onChange={() => toggleTask(task.key)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--primary-600)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: task.done ? '#15803d' : 'var(--gray-800)', textDecoration: task.done ? 'line-through' : 'none' }}>
                      {task.label}
                    </div>
                    {task.done && task.done_by_name && (
                      <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: 2 }}>
                        Done by {task.done_by_name} · {task.done_at ? new Date(task.done_at).toLocaleDateString() : ''}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>Due: Day {task.due_days}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={markAllComplete}
                style={{ padding: '0.6rem 1.1rem', border: '1.5px solid var(--success-500)', color: 'var(--success-600)', background: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                Mark All Complete
              </button>
              <button onClick={saveTasks} disabled={tasksSaving}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: tasksSaving ? 'not-allowed' : 'pointer', opacity: tasksSaving ? 0.7 : 1 }}>
                {tasksSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE CHECKLIST MODAL ────────────────────────────────────────────── */}
      {showCreateChecklist && (
        <div style={modalOverlay} onClick={e => e.target === e.currentTarget && setShowCreateChecklist(false)}>
          <div style={{ ...modalBox, maxWidth: 400 }}>
            <h2 style={{ margin: '0 0 1.25rem', fontSize: '1.15rem', fontWeight: 700 }}>Create Onboarding Checklist</h2>
            {createChecklistError && (
              <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: 8, marginBottom: '1rem', fontSize: '0.875rem' }}>{createChecklistError}</div>
            )}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Employee *</label>
              <select value={newChecklistUserId} onChange={e => setNewChecklistUserId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }}>
                <option value="">Select employee…</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>Link to Contract (optional)</label>
              <select value={newChecklistContractId} onChange={e => setNewChecklistContractId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid var(--gray-300)', borderRadius: 8, fontSize: '0.9rem' }}>
                <option value="">No contract linked</option>
                {contracts.filter(c => c.user_id === newChecklistUserId).map(c => (
                  <option key={c.id} value={c.id}>{c.contract_type} — {c.start_date}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateChecklist(false)}
                style={{ padding: '0.6rem 1.25rem', border: '1.5px solid var(--gray-300)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
              <button onClick={handleCreateChecklist} disabled={createChecklistLoading}
                style={{ padding: '0.6rem 1.25rem', background: 'var(--primary-600)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: createChecklistLoading ? 'not-allowed' : 'pointer', opacity: createChecklistLoading ? 0.7 : 1 }}>
                {createChecklistLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
