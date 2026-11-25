import { errorMessage } from '../../utils/errorMessage';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getAllBenefits,
  saveBenefit,
  deactivateBenefit,
  deleteBenefit,
  formatKES,
  EmployeeBenefit,
  BenefitType,
  BENEFIT_TYPE_LABELS,
} from '../../services/benefitsService';
import { supabase } from '../../lib/supabaseClient';

// ─── Constants ────────────────────────────────────────────────────────────────

const BENEFIT_TYPES: BenefitType[] = [
  'health_insurance',
  'nssf_tier2',
  'helb',
  'group_life',
  'personal_accident',
  'pension',
  'other',
];

const TYPE_COLORS: Record<BenefitType, string> = {
  health_insurance:  '#0284c7',
  nssf_tier2:        '#7c3aed',
  helb:              '#d97706',
  group_life:        '#16a34a',
  personal_accident: '#dc2626',
  pension:           '#0891b2',
  other:             '#6b7280',
};

interface EmployeeOption {
  id: string;
  name: string;
  employee_id: string | null;
}

// ─── Empty form ───────────────────────────────────────────────────────────────

function emptyForm(): Partial<EmployeeBenefit> {
  return {
    benefit_type:          'health_insurance',
    scheme_name:           '',
    provider:              '',
    policy_number:         '',
    cover_level:           '',
    employee_contribution: undefined,
    employer_contribution: undefined,
    effective_date:        '',
    expiry_date:           '',
    notes:                 '',
    is_active:             true,
    details:               {},
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BenefitsManagement() {
  useAuth();

  // Data
  const [benefits, setBenefits]       = useState<EmployeeBenefit[]>([]);
  const [employees, setEmployees]     = useState<EmployeeOption[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  // Filters
  const [searchTerm, setSearchTerm]           = useState('');
  const [filterType, setFilterType]           = useState<BenefitType | 'all'>('all');
  const [activeOnly, setActiveOnly]           = useState(true);

  // Modal
  const [showModal, setShowModal]             = useState(false);
  const [editing, setEditing]                 = useState<EmployeeBenefit | null>(null);
  const [form, setForm]                       = useState<Partial<EmployeeBenefit>>(emptyForm());
  const [selectedUserId, setSelectedUserId]   = useState('');
  const [employeeSearch, setEmployeeSearch]   = useState('');
  const [saving, setSaving]                   = useState(false);
  const [modalError, setModalError]           = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
    loadEmployees();
  }, []);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const data = await getAllBenefits();
      setBenefits(data);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    const { data } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, employee_id')
      .order('first_name');
    if (data) {
      setEmployees(
        data.map((p: any) => ({
          id:          p.id,
          name:        `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          employee_id: p.employee_id,
        }))
      );
    }
  }

  // ── Summary cards ─────────────────────────────────────────────────────────

  const summaryCards = useMemo(() => {
    const active = benefits.filter(b => b.is_active);
    const healthIds  = new Set(active.filter(b => b.benefit_type === 'health_insurance').map(b => b.user_id));
    const helbIds    = new Set(active.filter(b => b.benefit_type === 'helb').map(b => b.user_id));
    const groupIds   = new Set(active.filter(b => b.benefit_type === 'group_life').map(b => b.user_id));
    return [
      { label: 'Health Insurance',  value: healthIds.size, icon: '🏥', color: '#0284c7' },
      { label: 'HELB Deductions',   value: helbIds.size,   icon: '🎓', color: '#d97706' },
      { label: 'Group Life',        value: groupIds.size,  icon: '🛡️', color: '#16a34a' },
    ];
  }, [benefits]);

  // ── Filtered benefits ─────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return benefits.filter(b => {
      if (activeOnly && !b.is_active) return false;
      if (filterType !== 'all' && b.benefit_type !== filterType) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = (b.employee_name ?? '').toLowerCase();
        const eid  = (b.employee_id_code ?? '').toLowerCase();
        if (!name.includes(term) && !eid.includes(term)) return false;
      }
      return true;
    });
  }, [benefits, activeOnly, filterType, searchTerm]);

  // ── Modal helpers ─────────────────────────────────────────────────────────

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setSelectedUserId('');
    setEmployeeSearch('');
    setModalError('');
    setShowModal(true);
  }

  function openEdit(b: EmployeeBenefit) {
    setEditing(b);
    setForm({ ...b });
    setSelectedUserId(b.user_id);
    const emp = employees.find(e => e.id === b.user_id);
    setEmployeeSearch(emp ? emp.name : '');
    setModalError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm());
    setSelectedUserId('');
    setEmployeeSearch('');
    setModalError('');
  }

  function setField<K extends keyof EmployeeBenefit>(key: K, val: EmployeeBenefit[K]) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function setDetail(key: string, val: string) {
    setForm(prev => ({
      ...prev,
      details: { ...(prev.details ?? {}), [key]: val },
    }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedUserId) { setModalError('Please select an employee.'); return; }
    if (!form.benefit_type) { setModalError('Please select a benefit type.'); return; }

    setSaving(true);
    setModalError('');
    try {
      const payload: Partial<EmployeeBenefit> = {
        ...form,
        user_id:    selectedUserId,
      };
      if (editing?.id) payload.id = editing.id;

      const saved = await saveBenefit(payload);

      setBenefits(prev => {
        if (editing?.id) return prev.map(b => b.id === saved.id ? { ...saved, employee_name: b.employee_name, employee_id_code: b.employee_id_code, department: b.department } : b);
        const emp = employees.find(e => e.id === selectedUserId);
        return [{ ...saved, employee_name: emp?.name, employee_id_code: emp?.employee_id ?? undefined }, ...prev];
      });

      showSuccess(editing ? 'Benefit updated.' : 'Benefit added.');
      closeModal();
    } catch (e: unknown) {
      setModalError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────

  async function handleDeactivate(id: string) {
    try {
      await deactivateBenefit(id);
      setBenefits(prev => prev.map(b => b.id === id ? { ...b, is_active: false } : b));
      showSuccess('Benefit deactivated.');
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    try {
      await deleteBenefit(id);
      setBenefits(prev => prev.filter(b => b.id !== id));
      setConfirmDelete(null);
      showSuccess('Benefit deleted.');
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  }

  // ── Employee picker filtered list ─────────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees.slice(0, 30);
    const term = employeeSearch.toLowerCase();
    return employees.filter(e =>
      e.name.toLowerCase().includes(term) ||
      (e.employee_id ?? '').toLowerCase().includes(term)
    ).slice(0, 20);
  }, [employees, employeeSearch]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* Header */}
        <div className="admin-topbar">
          <div>
            <h1 className="page-title">Benefits Administration</h1>
            <p className="page-subtitle">Manage employee benefits — health, HELB, pension, and more</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <NotificationBell />
            <button className="btn btn-primary" onClick={openAdd}>
              + Add Benefit
            </button>
          </div>
        </div>

        <div className="page-content">
          {/* Alerts */}
          {error   && <div className="alert alert-error"   style={alertStyle('danger')}>  {error}   <button onClick={() => setError('')}  style={closeBtnStyle}>✕</button></div>}
          {success && <div className="alert alert-success" style={alertStyle('success')}> {success} <button onClick={() => setSuccess('')} style={closeBtnStyle}>✕</button></div>}

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {summaryCards.map(card => (
              <div key={card.label} className="stat-card" style={{ borderLeft: `4px solid ${card.color}` }}>
                <div style={{ fontSize: '1.75rem' }}>{card.icon}</div>
                <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
              <input
                className="form-control"
                placeholder="Search employee name or ID…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ flex: '1 1 220px', minWidth: 0 }}
              />
              <select
                className="form-control"
                value={filterType}
                onChange={e => setFilterType(e.target.value as BenefitType | 'all')}
                style={{ flex: '0 0 200px' }}
              >
                <option value="all">All Benefit Types</option>
                {BENEFIT_TYPES.map(t => (
                  <option key={t} value={t}>{BENEFIT_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', color: 'var(--gray-700)', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={e => setActiveOnly(e.target.checked)}
                />
                Active only
              </label>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="loading-spinner">Loading benefits…</div>
          ) : (
            <div className="card">
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Benefit Type</th>
                      <th>Scheme / Provider</th>
                      <th>Cover Level</th>
                      <th style={{ textAlign: 'right' }}>Emp. Contribution</th>
                      <th style={{ textAlign: 'right' }}>Emp'r Contribution</th>
                      <th>Effective</th>
                      <th>Expiry</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', color: 'var(--gray-500)', padding: '2rem' }}>
                          No benefits found.
                        </td>
                      </tr>
                    ) : (
                      filtered.map(b => (
                        <tr key={b.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{b.employee_name || '—'}</div>
                            {b.employee_id_code && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{b.employee_id_code}</div>
                            )}
                            {b.department && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>{b.department}</div>
                            )}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: TYPE_COLORS[b.benefit_type] + '18',
                              color: TYPE_COLORS[b.benefit_type],
                              border: `1px solid ${TYPE_COLORS[b.benefit_type]}40`,
                            }}>
                              {BENEFIT_TYPE_LABELS[b.benefit_type]}
                            </span>
                          </td>
                          <td>
                            <div>{b.scheme_name || '—'}</div>
                            {b.provider && <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>{b.provider}</div>}
                          </td>
                          <td style={{ color: 'var(--gray-700)' }}>{b.cover_level || '—'}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {b.employee_contribution != null ? formatKES(b.employee_contribution) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {b.employer_contribution != null ? formatKES(b.employer_contribution) : '—'}
                          </td>
                          <td style={{ color: 'var(--gray-600)', fontSize: '0.85rem' }}>{b.effective_date || '—'}</td>
                          <td style={{ fontSize: '0.85rem' }}>
                            {b.expiry_date ? (
                              <ExpiryBadge date={b.expiry_date} />
                            ) : '—'}
                          </td>
                          <td>
                            <span style={{
                              padding: '0.2rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              background: b.is_active ? 'var(--success-100)' : 'var(--gray-100)',
                              color:      b.is_active ? 'var(--success-700)' : 'var(--gray-500)',
                            }}>
                              {b.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className="btn btn-sm"
                                style={actionBtnStyle}
                                onClick={() => openEdit(b)}
                                title="Edit"
                              >
                                Edit
                              </button>
                              {b.is_active && (
                                <button
                                  className="btn btn-sm"
                                  style={{ ...actionBtnStyle, color: 'var(--warning-700)', borderColor: 'var(--warning-300)' }}
                                  onClick={() => handleDeactivate(b.id)}
                                  title="Deactivate"
                                >
                                  Deactivate
                                </button>
                              )}
                              <button
                                className="btn btn-sm"
                                style={{ ...actionBtnStyle, color: 'var(--danger-600)', borderColor: 'var(--danger-300)' }}
                                onClick={() => setConfirmDelete(b.id)}
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--gray-100)', fontSize: '0.8rem', color: 'var(--gray-400)' }}>
                Showing {filtered.length} of {benefits.length} records
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="modal" style={{ maxWidth: 640, width: '95%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Edit Benefit' : 'Add Benefit'}</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {modalError && (
                <div style={{ ...alertStyle('danger'), fontSize: '0.875rem' }}>{modalError}</div>
              )}

              {/* Employee picker */}
              {!editing && (
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Employee *</label>
                  <input
                    className="form-control"
                    placeholder="Search name or employee ID…"
                    value={employeeSearch}
                    onChange={e => {
                      setEmployeeSearch(e.target.value);
                      if (!e.target.value) setSelectedUserId('');
                    }}
                  />
                  {employeeSearch && !selectedUserId && (
                    <div style={dropdownStyle}>
                      {filteredEmployees.length === 0 ? (
                        <div style={dropdownEmptyStyle}>No employees found</div>
                      ) : (
                        filteredEmployees.map(emp => (
                          <div
                            key={emp.id}
                            style={dropdownItemStyle}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-50)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                            onClick={() => {
                              setSelectedUserId(emp.id);
                              setEmployeeSearch(emp.name + (emp.employee_id ? ` (${emp.employee_id})` : ''));
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{emp.name}</span>
                            {emp.employee_id && (
                              <span style={{ color: 'var(--gray-400)', marginLeft: '0.5rem', fontSize: '0.8rem' }}>{emp.employee_id}</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {selectedUserId && (
                    <div style={{ marginTop: '0.25rem', fontSize: '0.8rem', color: 'var(--success-600)' }}>
                      ✓ Employee selected
                    </div>
                  )}
                </div>
              )}

              {/* Benefit type */}
              <div className="form-group">
                <label className="form-label">Benefit Type *</label>
                <select
                  className="form-control"
                  value={form.benefit_type ?? 'health_insurance'}
                  onChange={e => setField('benefit_type', e.target.value as BenefitType)}
                >
                  {BENEFIT_TYPES.map(t => (
                    <option key={t} value={t}>{BENEFIT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>

              {/* Two-column grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Scheme Name</label>
                  <input className="form-control" value={form.scheme_name ?? ''} onChange={e => setField('scheme_name', e.target.value)} placeholder="e.g. Jubilee Health Gold" />
                </div>
                <div className="form-group">
                  <label className="form-label">Provider / Insurer</label>
                  <input className="form-control" value={form.provider ?? ''} onChange={e => setField('provider', e.target.value)} placeholder="e.g. Jubilee Insurance" />
                </div>
                <div className="form-group">
                  <label className="form-label">Policy Number</label>
                  <input className="form-control" value={form.policy_number ?? ''} onChange={e => setField('policy_number', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cover Level</label>
                  <input className="form-control" value={form.cover_level ?? ''} onChange={e => setField('cover_level', e.target.value)} placeholder="e.g. Individual, Family, 3x salary" />
                </div>
                <div className="form-group">
                  <label className="form-label">Employee Contribution (KES/month)</label>
                  <input
                    className="form-control"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.employee_contribution ?? ''}
                    onChange={e => setField('employee_contribution', e.target.value ? Number(e.target.value) : null as any)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Employer Contribution (KES/month)</label>
                  <input
                    className="form-control"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.employer_contribution ?? ''}
                    onChange={e => setField('employer_contribution', e.target.value ? Number(e.target.value) : null as any)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Effective Date</label>
                  <input className="form-control" type="date" value={form.effective_date ?? ''} onChange={e => setField('effective_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Expiry Date</label>
                  <input className="form-control" type="date" value={form.expiry_date ?? ''} onChange={e => setField('expiry_date', e.target.value)} />
                </div>
              </div>

              {/* Dynamic extra fields by benefit type */}
              {form.benefit_type === 'helb' && (
                <div style={extraFieldsBoxStyle}>
                  <div style={extraFieldsTitleStyle}>HELB Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Loan Reference Number</label>
                      <input
                        className="form-control"
                        value={String(form.details?.loan_ref ?? '')}
                        onChange={e => setDetail('loan_ref', e.target.value)}
                        placeholder="e.g. HELB-123456"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Current Balance (KES)</label>
                      <input
                        className="form-control"
                        type="number"
                        min={0}
                        step={0.01}
                        value={String(form.details?.helb_balance ?? '')}
                        onChange={e => setDetail('helb_balance', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}

              {form.benefit_type === 'health_insurance' && (
                <div style={extraFieldsBoxStyle}>
                  <div style={extraFieldsTitleStyle}>Health Insurance Details</div>
                  <div className="form-group">
                    <label className="form-label">Family Members Covered</label>
                    <input
                      className="form-control"
                      value={String(form.details?.family_members_covered ?? '')}
                      onChange={e => setDetail('family_members_covered', e.target.value)}
                      placeholder="e.g. Spouse + 2 children"
                    />
                  </div>
                </div>
              )}

              {form.benefit_type === 'pension' && (
                <div style={extraFieldsBoxStyle}>
                  <div style={extraFieldsTitleStyle}>Pension Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label">Employee Contribution %</label>
                      <input
                        className="form-control"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={String(form.details?.employee_pct ?? '')}
                        onChange={e => setDetail('employee_pct', e.target.value)}
                        placeholder="e.g. 5"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Employer Contribution %</label>
                      <input
                        className="form-control"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={String(form.details?.employer_pct ?? '')}
                        onChange={e => setDetail('employer_pct', e.target.value)}
                        placeholder="e.g. 10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={e => setField('notes', e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>

              {/* Active toggle (edit only) */}
              {editing && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--gray-700)' }}>
                  <input
                    type="checkbox"
                    checked={form.is_active ?? true}
                    onChange={e => setField('is_active', e.target.checked)}
                  />
                  Active
                </label>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Benefit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Benefit</h2>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-700)' }}>Are you sure you want to permanently delete this benefit record? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn" style={{ background: 'var(--danger-600)', color: 'white' }} onClick={() => handleDelete(confirmDelete)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpiryBadge({ date }: { date: string }) {
  const now = Date.now();
  const exp = new Date(date).getTime();
  const diff = exp - now;
  const expired = diff < 0;
  const soon    = !expired && diff < 30 * 86_400_000;

  if (expired) {
    return (
      <span style={{ color: 'var(--danger-600)', fontWeight: 600 }}>{date} (Expired)</span>
    );
  }
  if (soon) {
    return (
      <span style={{ color: 'var(--warning-700)', fontWeight: 600, background: 'var(--warning-100)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
        {date} ⚠
      </span>
    );
  }
  return <span style={{ color: 'var(--gray-600)' }}>{date}</span>;
}

// ─── Inline style helpers ─────────────────────────────────────────────────────

const closeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  marginLeft: '0.5rem',
  fontWeight: 700,
  fontSize: '1rem',
  opacity: 0.7,
};

function alertStyle(type: 'danger' | 'success'): React.CSSProperties {
  return {
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: type === 'danger' ? 'var(--danger-50)' : 'var(--success-50)',
    border:     `1px solid ${type === 'danger' ? 'var(--danger-200)' : 'var(--success-200)'}`,
    color:      type === 'danger' ? 'var(--danger-700)' : 'var(--success-700)',
  };
}

const actionBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.6rem',
  fontSize: '0.75rem',
  border: '1px solid var(--gray-300)',
  background: 'white',
  borderRadius: '4px',
  cursor: 'pointer',
  color: 'var(--gray-700)',
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  zIndex: 1000,
  background: 'white',
  border: '1px solid var(--gray-200)',
  borderRadius: '6px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
  maxHeight: '200px',
  overflowY: 'auto',
  width: '100%',
  marginTop: '2px',
};

const dropdownEmptyStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  color: 'var(--gray-400)',
  fontSize: '0.875rem',
};

const dropdownItemStyle: React.CSSProperties = {
  padding: '0.65rem 1rem',
  cursor: 'pointer',
  borderBottom: '1px solid var(--gray-100)',
  fontSize: '0.875rem',
  background: 'white',
};

const extraFieldsBoxStyle: React.CSSProperties = {
  background: 'var(--gray-50)',
  border: '1px solid var(--gray-200)',
  borderRadius: '8px',
  padding: '1rem',
};

const extraFieldsTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  color: 'var(--gray-700)',
  marginBottom: '0.75rem',
  fontSize: '0.875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};
