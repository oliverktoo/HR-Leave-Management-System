import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import {
  getAllAssets,
  createAsset,
  updateAsset,
  issueAsset,
  returnAsset,
  getAssetHistory,
  type Asset,
  type AssetAssignment,
} from '../../services/assetService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES: Asset['category'][] = [
  'laptop', 'phone', 'tablet', 'vehicle_key', 'access_card',
  'uniform', 'equipment', 'furniture', 'other',
];

const CATEGORY_ICONS: Record<Asset['category'], string> = {
  laptop: '💻',
  phone: '📱',
  tablet: '🖥️',
  vehicle_key: '🔑',
  access_card: '🪪',
  uniform: '👔',
  equipment: '🔧',
  furniture: '🪑',
  other: '📦',
};

const CATEGORY_LABELS: Record<Asset['category'], string> = {
  laptop: 'Laptop',
  phone: 'Phone',
  tablet: 'Tablet',
  vehicle_key: 'Vehicle Key',
  access_card: 'Access Card',
  uniform: 'Uniform',
  equipment: 'Equipment',
  furniture: 'Furniture',
  other: 'Other',
};

const STATUS_COLORS: Record<Asset['status'], string> = {
  available: 'var(--success-500)',
  assigned: 'var(--primary-600)',
  maintenance: 'var(--warning-500)',
  disposed: 'var(--gray-400)',
  lost: 'var(--danger-500)',
};

const STATUS_BG: Record<Asset['status'], string> = {
  available: '#dcfce7',
  assigned: '#dbeafe',
  maintenance: '#fef3c7',
  disposed: 'var(--gray-100)',
  lost: '#fee2e2',
};

const CONDITION_OPTIONS_ISSUE = ['new', 'good', 'fair', 'poor'] as const;
const CONDITION_OPTIONS_RETURN = ['good', 'fair', 'poor', 'damaged', 'lost'] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeOption {
  id: string;
  first_name: string;
  last_name: string;
  employee_id?: string;
}

interface AssetFormData {
  asset_tag: string;
  name: string;
  category: Asset['category'];
  make: string;
  model: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  notes: string;
  status: Asset['status'];
}

const defaultAssetForm: AssetFormData = {
  asset_tag: '',
  name: '',
  category: 'laptop',
  make: '',
  model: '',
  serial_number: '',
  purchase_date: '',
  purchase_cost: '',
  notes: '',
  status: 'available',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const StatusBadge = ({ status }: { status: Asset['status'] }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: STATUS_BG[status],
      color: STATUS_COLORS[status],
      textTransform: 'capitalize',
    }}
  >
    {status}
  </span>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const AssetManagement = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filtered, setFiltered] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Employees for assignment dropdown
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  // Modals
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [assetForm, setAssetForm] = useState<AssetFormData>(defaultAssetForm);

  const [issueTarget, setIssueTarget] = useState<Asset | null>(null);
  const [issueUserId, setIssueUserId] = useState('');
  const [issueCondition, setIssueCondition] = useState<AssetAssignment['condition_on_issue']>('good');
  const [issueNotes, setIssueNotes] = useState('');

  const [returnTarget, setReturnTarget] = useState<Asset | null>(null);
  const [returnCondition, setReturnCondition] = useState<NonNullable<AssetAssignment['condition_on_return']>>('good');
  const [returnNotes, setReturnNotes] = useState('');
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);

  const [historyTarget, setHistoryTarget] = useState<Asset | null>(null);
  const [history, setHistory] = useState<AssetAssignment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyProfiles, setHistoryProfiles] = useState<Record<string, string>>({});

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsResult, empResult] = await Promise.all([
        getAllAssets(),
        supabase
          .from('users_profile')
          .select('id, first_name, last_name, employee_id')
          .eq('is_active', true)
          .order('first_name'),
      ]);
      if (assetsResult.error) throw new Error(assetsResult.error.message || 'Failed to load assets');
      setAssets(assetsResult.data || []);
      setEmployees(empResult.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Apply filters ──────────────────────────────────────────────────────────

  useEffect(() => {
    let list = [...assets];
    const q = search.toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.asset_tag.toLowerCase().includes(q) ||
        (a.make || '').toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q)
      );
    }
    if (filterCategory !== 'all') list = list.filter(a => a.category === filterCategory);
    if (filterStatus !== 'all') list = list.filter(a => a.status === filterStatus);
    setFiltered(list);
  }, [assets, search, filterCategory, filterStatus]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: assets.length,
    available: assets.filter(a => a.status === 'available').length,
    assigned: assets.filter(a => a.status === 'assigned').length,
    maintenance: assets.filter(a => a.status === 'maintenance' || a.status === 'lost').length,
  };

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // ── Asset Form ─────────────────────────────────────────────────────────────

  const openAddModal = () => {
    setEditingAsset(null);
    setAssetForm(defaultAssetForm);
    setShowAssetModal(true);
  };

  const openEditModal = (asset: Asset) => {
    setEditingAsset(asset);
    setAssetForm({
      asset_tag: asset.asset_tag,
      name: asset.name,
      category: asset.category,
      make: asset.make || '',
      model: asset.model || '',
      serial_number: asset.serial_number || '',
      purchase_date: asset.purchase_date || '',
      purchase_cost: asset.purchase_cost !== null ? String(asset.purchase_cost) : '',
      notes: asset.notes || '',
      status: asset.status,
    });
    setShowAssetModal(true);
  };

  const handleSaveAsset = async () => {
    if (!assetForm.asset_tag.trim()) { setError('Asset tag is required'); return; }
    if (!assetForm.name.trim()) { setError('Asset name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        asset_tag: assetForm.asset_tag.trim(),
        name: assetForm.name.trim(),
        category: assetForm.category,
        make: assetForm.make.trim() || null,
        model: assetForm.model.trim() || null,
        serial_number: assetForm.serial_number.trim() || null,
        purchase_date: assetForm.purchase_date || null,
        purchase_cost: assetForm.purchase_cost ? parseFloat(assetForm.purchase_cost) : null,
        notes: assetForm.notes.trim() || null,
        status: assetForm.status,
      };

      if (editingAsset) {
        const { error: err } = await updateAsset(editingAsset.id, payload);
        if (err) throw new Error(err.message || 'Failed to update asset');
        flash('Asset updated successfully');
      } else {
        const { error: err } = await createAsset(payload);
        if (err) throw new Error(err.message || 'Failed to create asset');
        flash('Asset created successfully');
      }

      setShowAssetModal(false);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Issue ──────────────────────────────────────────────────────────────────

  const openIssueModal = (asset: Asset) => {
    setIssueTarget(asset);
    setIssueUserId('');
    setIssueCondition('good');
    setIssueNotes('');
  };

  const handleIssue = async () => {
    if (!issueTarget || !issueUserId) { setError('Please select an employee'); return; }
    setSaving(true);
    try {
      const { error: err } = await issueAsset(issueTarget.id, issueUserId, issueCondition, issueNotes || undefined);
      if (err) throw new Error(err.message || 'Failed to issue asset');
      flash(`${issueTarget.name} issued successfully`);
      setIssueTarget(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Return ─────────────────────────────────────────────────────────────────

  const openReturnModal = async (asset: Asset) => {
    // Fetch active assignment ID
    const { data } = await supabase
      .from('asset_assignments')
      .select('id')
      .eq('asset_id', asset.id)
      .is('returned_at', null)
      .limit(1)
      .maybeSingle();
    setActiveAssignmentId(data?.id || null);
    setReturnTarget(asset);
    setReturnCondition('good');
    setReturnNotes('');
  };

  const handleReturn = async () => {
    if (!returnTarget || !activeAssignmentId) { setError('Could not find active assignment'); return; }
    setSaving(true);
    try {
      const { error: err } = await returnAsset(activeAssignmentId, returnTarget.id, returnCondition, returnNotes || undefined);
      if (err) throw new Error(err.message || 'Failed to return asset');
      flash(`${returnTarget.name} returned successfully`);
      setReturnTarget(null);
      setActiveAssignmentId(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── History ────────────────────────────────────────────────────────────────

  const openHistory = async (asset: Asset) => {
    setHistoryTarget(asset);
    setHistoryLoading(true);
    try {
      const { data } = await getAssetHistory(asset.id);
      const rows = data || [];
      setHistory(rows);

      // Fetch names for all user_ids in history
      const userIds = [...new Set(rows.map(r => r.user_id))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('users_profile')
          .select('id, first_name, last_name')
          .in('id', userIds);
        const map: Record<string, string> = {};
        for (const p of profiles || []) map[p.id] = `${p.first_name} ${p.last_name}`;
        setHistoryProfiles(map);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--gray-300)',
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    background: 'var(--gray-50)',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--gray-700)',
    marginBottom: 4,
  };

  const btnPrimary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--primary-600)',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    padding: '8px 16px',
    background: 'var(--gray-100)',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  };

  const btnSmall = (bg: string, color = '#fff'): React.CSSProperties => ({
    padding: '4px 10px',
    background: bg,
    color,
    border: 'none',
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  };

  const modalStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 560,
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 28,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  };

  const fieldRow = (children: React.ReactNode): React.ReactNode => (
    <div style={{ marginBottom: 14 }}>{children}</div>
  );

  const gridTwo = (a: React.ReactNode, b: React.ReactNode): React.ReactNode => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
      {a}{b}
    </div>
  );

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <div className="admin-main">
        {/* Header */}
        <div
          style={{
            background: '#fff',
            borderBottom: '1px solid var(--gray-200)',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
              📋 Asset Management
            </h1>
            {/* Stats bar */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Total', value: stats.total, color: 'var(--gray-700)', bg: 'var(--gray-100)' },
                { label: 'Available', value: stats.available, color: 'var(--success-500)', bg: '#dcfce7' },
                { label: 'Assigned', value: stats.assigned, color: 'var(--primary-600)', bg: '#dbeafe' },
                { label: 'Maintenance / Lost', value: stats.maintenance, color: 'var(--warning-500)', bg: '#fef3c7' },
              ].map(s => (
                <div
                  key={s.label}
                  style={{
                    background: s.bg,
                    borderRadius: 8,
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 15, color: s.color }}>{s.value}</span>
                  <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={btnPrimary} onClick={openAddModal}>+ Add Asset</button>
            <NotificationBell />
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              background: '#fee2e2',
              border: '1px solid #fca5a5',
              borderRadius: 8,
              color: 'var(--danger-500)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 14,
            }}
          >
            {error}
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--danger-500)' }}
            >
              ×
            </button>
          </div>
        )}
        {success && (
          <div
            style={{
              margin: '12px 24px 0',
              padding: '10px 14px',
              background: '#dcfce7',
              border: '1px solid #86efac',
              borderRadius: 8,
              color: 'var(--success-500)',
              fontSize: 14,
            }}
          >
            {success}
          </div>
        )}

        {/* Filter Bar */}
        <div
          style={{
            padding: '12px 24px',
            background: '#fff',
            borderBottom: '1px solid var(--gray-200)',
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder="Search by name or asset tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, maxWidth: 260 }}
          />
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            style={{ ...inputStyle, maxWidth: 180 }}
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>
                {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ ...inputStyle, maxWidth: 160 }}
          >
            <option value="all">All Statuses</option>
            {(['available', 'assigned', 'maintenance', 'disposed', 'lost'] as Asset['status'][]).map(s => (
              <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: 'var(--gray-500)', marginLeft: 'auto' }}>
            {filtered.length} asset{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-500)' }}>
              Loading assets...
            </div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 60,
                color: 'var(--gray-400)',
                background: '#fff',
                borderRadius: 12,
                border: '1px dashed var(--gray-200)',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 15 }}>No assets found</p>
            </div>
          ) : (
            <div
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1px solid var(--gray-200)',
                overflow: 'hidden',
              }}
            >
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      {['Asset Tag', 'Name', 'Category', 'Make / Model', 'Status', 'Current Assignee', 'Actions'].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '10px 14px',
                            textAlign: 'left',
                            fontWeight: 600,
                            color: 'var(--gray-600)',
                            fontSize: 12,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((asset, idx) => (
                      <tr
                        key={asset.id}
                        style={{
                          borderBottom: idx < filtered.length - 1 ? '1px solid var(--gray-100)' : 'none',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary-700)' }}>
                          {asset.asset_tag}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 500, color: 'var(--gray-900)' }}>
                          {CATEGORY_ICONS[asset.category]} {asset.name}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-600)' }}>
                          {CATEGORY_LABELS[asset.category]}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-600)' }}>
                          {[asset.make, asset.model].filter(Boolean).join(' ') || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <StatusBadge status={asset.status} />
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-700)' }}>
                          {asset.current_assignee || '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {asset.status === 'available' && (
                              <button
                                style={btnSmall('var(--primary-600)')}
                                onClick={() => openIssueModal(asset)}
                              >
                                Issue
                              </button>
                            )}
                            {asset.status === 'assigned' && (
                              <button
                                style={btnSmall('var(--success-500)')}
                                onClick={() => openReturnModal(asset)}
                              >
                                Return
                              </button>
                            )}
                            <button
                              style={btnSmall('var(--gray-200)', 'var(--gray-700)')}
                              onClick={() => openHistory(asset)}
                            >
                              History
                            </button>
                            <button
                              style={btnSmall('var(--warning-500)')}
                              onClick={() => openEditModal(asset)}
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit Asset Modal ────────────────────────────────────────── */}
      {showAssetModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
              {editingAsset ? 'Edit Asset' : 'Add New Asset'}
            </h2>

            {gridTwo(
              <div>
                <label style={labelStyle}>Asset Tag *</label>
                <input
                  style={inputStyle}
                  value={assetForm.asset_tag}
                  onChange={e => setAssetForm(f => ({ ...f, asset_tag: e.target.value }))}
                  placeholder="e.g. LPT-001"
                />
              </div>,
              <div>
                <label style={labelStyle}>Category *</label>
                <select
                  style={inputStyle}
                  value={assetForm.category}
                  onChange={e => setAssetForm(f => ({ ...f, category: e.target.value as Asset['category'] }))}
                >
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Asset Name *</label>
                <input
                  style={inputStyle}
                  value={assetForm.name}
                  onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dell Latitude 7420"
                />
              </>
            )}

            {gridTwo(
              <div>
                <label style={labelStyle}>Make</label>
                <input
                  style={inputStyle}
                  value={assetForm.make}
                  onChange={e => setAssetForm(f => ({ ...f, make: e.target.value }))}
                  placeholder="e.g. Dell"
                />
              </div>,
              <div>
                <label style={labelStyle}>Model</label>
                <input
                  style={inputStyle}
                  value={assetForm.model}
                  onChange={e => setAssetForm(f => ({ ...f, model: e.target.value }))}
                  placeholder="e.g. Latitude 7420"
                />
              </div>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Serial Number</label>
                <input
                  style={inputStyle}
                  value={assetForm.serial_number}
                  onChange={e => setAssetForm(f => ({ ...f, serial_number: e.target.value }))}
                  placeholder="e.g. SN-123456"
                />
              </>
            )}

            {gridTwo(
              <div>
                <label style={labelStyle}>Purchase Date</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={assetForm.purchase_date}
                  onChange={e => setAssetForm(f => ({ ...f, purchase_date: e.target.value }))}
                />
              </div>,
              <div>
                <label style={labelStyle}>Purchase Cost (KES)</label>
                <input
                  type="number"
                  style={inputStyle}
                  value={assetForm.purchase_cost}
                  onChange={e => setAssetForm(f => ({ ...f, purchase_cost: e.target.value }))}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>
            )}

            {editingAsset && fieldRow(
              <>
                <label style={labelStyle}>Status</label>
                <select
                  style={inputStyle}
                  value={assetForm.status}
                  onChange={e => setAssetForm(f => ({ ...f, status: e.target.value as Asset['status'] }))}
                >
                  {(['available', 'assigned', 'maintenance', 'disposed', 'lost'] as Asset['status'][]).map(s => (
                    <option key={s} value={s} style={{ textTransform: 'capitalize' }}>{s}</option>
                  ))}
                </select>
              </>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Notes</label>
                <textarea
                  style={{ ...inputStyle, height: 72, resize: 'vertical' }}
                  value={assetForm.notes}
                  onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..."
                />
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button style={btnSecondary} onClick={() => setShowAssetModal(false)} disabled={saving}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={handleSaveAsset} disabled={saving}>
                {saving ? 'Saving...' : editingAsset ? 'Save Changes' : 'Create Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Issue Asset Modal ─────────────────────────────────────────────── */}
      {issueTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
              Issue Asset
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--gray-500)' }}>
              {CATEGORY_ICONS[issueTarget.category]} {issueTarget.name} — <span style={{ fontFamily: 'monospace' }}>{issueTarget.asset_tag}</span>
            </p>

            {fieldRow(
              <>
                <label style={labelStyle}>Assign To *</label>
                <select
                  style={inputStyle}
                  value={issueUserId}
                  onChange={e => setIssueUserId(e.target.value)}
                >
                  <option value="">— Select employee —</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name}
                      {emp.employee_id ? ` (${emp.employee_id})` : ''}
                    </option>
                  ))}
                </select>
              </>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Condition on Issue *</label>
                <select
                  style={inputStyle}
                  value={issueCondition}
                  onChange={e => setIssueCondition(e.target.value as AssetAssignment['condition_on_issue'])}
                >
                  {CONDITION_OPTIONS_ISSUE.map(c => (
                    <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                  ))}
                </select>
              </>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Notes</label>
                <textarea
                  style={{ ...inputStyle, height: 64, resize: 'vertical' }}
                  value={issueNotes}
                  onChange={e => setIssueNotes(e.target.value)}
                  placeholder="Optional handover notes..."
                />
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button style={btnSecondary} onClick={() => setIssueTarget(null)} disabled={saving}>Cancel</button>
              <button style={btnPrimary} onClick={handleIssue} disabled={saving || !issueUserId}>
                {saving ? 'Issuing...' : 'Issue Asset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Asset Modal ────────────────────────────────────────────── */}
      {returnTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 440 }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
              Return Asset
            </h2>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--gray-500)' }}>
              {CATEGORY_ICONS[returnTarget.category]} {returnTarget.name} — <span style={{ fontFamily: 'monospace' }}>{returnTarget.asset_tag}</span>
            </p>
            {returnTarget.current_assignee && (
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--gray-600)' }}>
                Currently assigned to: <strong>{returnTarget.current_assignee}</strong>
              </p>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Condition on Return *</label>
                <select
                  style={inputStyle}
                  value={returnCondition}
                  onChange={e => setReturnCondition(e.target.value as NonNullable<AssetAssignment['condition_on_return']>)}
                >
                  {CONDITION_OPTIONS_RETURN.map(c => (
                    <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                  ))}
                </select>
              </>
            )}

            {fieldRow(
              <>
                <label style={labelStyle}>Return Notes</label>
                <textarea
                  style={{ ...inputStyle, height: 64, resize: 'vertical' }}
                  value={returnNotes}
                  onChange={e => setReturnNotes(e.target.value)}
                  placeholder="Any issues or observations..."
                />
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button style={btnSecondary} onClick={() => setReturnTarget(null)} disabled={saving}>Cancel</button>
              <button style={{ ...btnPrimary, background: 'var(--success-500)' }} onClick={handleReturn} disabled={saving}>
                {saving ? 'Processing...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Modal ─────────────────────────────────────────────────── */}
      {historyTarget && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 700 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>
                  Assignment History
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--gray-500)' }}>
                  {CATEGORY_ICONS[historyTarget.category]} {historyTarget.name} — <span style={{ fontFamily: 'monospace' }}>{historyTarget.asset_tag}</span>
                </p>
              </div>
              <button
                onClick={() => setHistoryTarget(null)}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--gray-400)' }}
              >
                ×
              </button>
            </div>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray-400)' }}>Loading history...</div>
            ) : history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--gray-400)' }}>
                No assignment history for this asset.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--gray-50)', borderBottom: '1px solid var(--gray-200)' }}>
                      {['Employee', 'Issued', 'Returned', 'Condition In', 'Condition Out', 'Notes'].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            fontSize: 11,
                            color: 'var(--gray-500)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row, idx) => (
                      <tr
                        key={row.id}
                        style={{ borderBottom: idx < history.length - 1 ? '1px solid var(--gray-100)' : 'none' }}
                      >
                        <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                          {historyProfiles[row.user_id] || row.user_id}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                          {fmt(row.issued_at)}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                          {row.returned_at ? fmt(row.returned_at) : (
                            <span style={{ color: 'var(--primary-600)', fontWeight: 600 }}>Active</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textTransform: 'capitalize', color: 'var(--gray-700)' }}>
                          {row.condition_on_issue}
                        </td>
                        <td style={{ padding: '8px 12px', textTransform: 'capitalize', color: 'var(--gray-700)' }}>
                          {row.condition_on_return || '—'}
                        </td>
                        <td style={{ padding: '8px 12px', color: 'var(--gray-500)', maxWidth: 180 }}>
                          {row.notes || row.return_notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => setHistoryTarget(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
