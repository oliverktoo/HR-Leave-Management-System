import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import {
  getAllExitRequests,
  updateExitStatus,
  updateClearanceItem,
  saveExitInterview,
  type ExitRequest,
  type ClearanceItem,
} from '../../services/exitService';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_ORDER: ExitRequest['status'][] = [
  'pending', 'acknowledged', 'in_progress', 'clearance', 'completed', 'cancelled',
];

const STATUS_LABELS: Record<ExitRequest['status'], string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  clearance: 'Clearance',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<ExitRequest['status'], string> = {
  pending: 'var(--gray-500)',
  acknowledged: 'var(--primary-600)',
  in_progress: 'var(--warning-500)',
  clearance: '#f97316',
  completed: 'var(--success-500)',
  cancelled: 'var(--danger-500)',
};

const STATUS_BG: Record<ExitRequest['status'], string> = {
  pending: 'var(--gray-100)',
  acknowledged: '#dbeafe',
  in_progress: '#fef3c7',
  clearance: '#ffedd5',
  completed: '#dcfce7',
  cancelled: '#fee2e2',
};

const EXIT_TYPE_LABELS: Record<ExitRequest['exit_type'], string> = {
  resignation: 'Resignation',
  retirement: 'Retirement',
  termination: 'Termination',
  contract_end: 'Contract End',
  mutual_agreement: 'Mutual Agreement',
};

type FilterTab = 'all' | 'pending' | 'in_progress' | 'clearance' | 'completed';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const getDaysRemaining = (lastWorkingDate: string): number => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = new Date(lastWorkingDate);
  last.setHours(0, 0, 0, 0);
  return Math.round((last.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const DaysRemainingBadge = ({ lastWorkingDate }: { lastWorkingDate: string }) => {
  const days = getDaysRemaining(lastWorkingDate);
  const color = days < 0 ? 'var(--danger-500)' : days < 7 ? 'var(--warning-500)' : 'var(--success-500)';
  const bg = days < 0 ? '#fee2e2' : days < 7 ? '#fef3c7' : '#dcfce7';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`}
    </span>
  );
};

const StatusBadge = ({ status }: { status: ExitRequest['status'] }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 10,
      fontSize: 12,
      fontWeight: 600,
      background: STATUS_BG[status],
      color: STATUS_COLORS[status],
    }}
  >
    {STATUS_LABELS[status]}
  </span>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const ExitManagement = () => {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ExitRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<ExitRequest | null>(null);

  // Detail panel state
  const [panelStatus, setPanelStatus] = useState<ExitRequest['status']>('pending');
  const [hrNotes, setHrNotes] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [clearanceItems, setClearanceItems] = useState<ClearanceItem[]>([]);

  // Clearance note prompt
  const [clearancePromptKey, setClearancePromptKey] = useState<string | null>(null);
  const [clearanceNoteInput, setClearanceNoteInput] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await getAllExitRequests();
      if (err) throw new Error(err.message || 'Failed to load exit requests');
      setRequests(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  // ── Open detail panel ──────────────────────────────────────────────────────

  const openPanel = (req: ExitRequest) => {
    setSelected(req);
    setPanelStatus(req.status);
    setHrNotes(req.hr_notes || '');
    setInterviewDate(req.exit_interview_date || '');
    setInterviewNotes(req.exit_interview_notes || '');
    // Ensure clearance_items is always an array
    setClearanceItems(
      Array.isArray(req.clearance_items) && req.clearance_items.length > 0
        ? req.clearance_items
        : getDefaultClearanceItems()
    );
    setClearancePromptKey(null);
    setClearanceNoteInput('');
  };

  const closePanel = () => {
    setSelected(null);
    setClearancePromptKey(null);
  };

  const getDefaultClearanceItems = (): ClearanceItem[] => [
    { key: 'equipment', label: 'Equipment Returned', cleared: false },
    { key: 'access_cards', label: 'Access Cards Collected', cleared: false },
    { key: 'system_access', label: 'System Access Revoked', cleared: false },
    { key: 'documents', label: 'Documents Handed Over', cleared: false },
    { key: 'finance', label: 'Finance Clearance', cleared: false },
    { key: 'leave_balance', label: 'Leave Balance Settled', cleared: false },
    { key: 'hr_clearance', label: 'HR Clearance', cleared: false },
  ];

  // ── Save status + HR notes ─────────────────────────────────────────────────

  const handleSaveStatus = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const { error: err } = await updateExitStatus(selected.id, panelStatus, hrNotes);
      if (err) throw new Error(err.message || 'Failed to update status');
      flash('Status updated');
      // Refresh local state
      setRequests(prev =>
        prev.map(r => r.id === selected.id ? { ...r, status: panelStatus, hr_notes: hrNotes } : r)
      );
      setSelected(prev => prev ? { ...prev, status: panelStatus, hr_notes: hrNotes } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Clearance item toggle ──────────────────────────────────────────────────

  const handleClearanceToggle = (key: string, currentlyCleared: boolean) => {
    if (currentlyCleared) {
      // Unmark without prompt
      saveClearanceToggle(key, false, undefined);
      return;
    }
    // Open note prompt
    setClearancePromptKey(key);
    setClearanceNoteInput('');
  };

  const confirmClearanceItem = async () => {
    if (!clearancePromptKey) return;
    await saveClearanceToggle(clearancePromptKey, true, clearanceNoteInput || undefined);
    setClearancePromptKey(null);
    setClearanceNoteInput('');
  };

  const saveClearanceToggle = async (key: string, cleared: boolean, notes?: string) => {
    if (!selected) return;
    const now = new Date().toISOString();
    const updatedItems = clearanceItems.map(item => {
      if (item.key !== key) return item;
      return {
        ...item,
        cleared,
        cleared_by_name: cleared
          ? `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'HR'
          : undefined,
        cleared_at: cleared ? now : undefined,
        notes: cleared ? notes : undefined,
      };
    });
    setClearanceItems(updatedItems);
    setSaving(true);
    try {
      const { error: err } = await updateClearanceItem(selected.id, updatedItems);
      if (err) throw new Error(err.message || 'Failed to update clearance');
      setRequests(prev =>
        prev.map(r => r.id === selected.id ? { ...r, clearance_items: updatedItems } : r)
      );
      setSelected(prev => prev ? { ...prev, clearance_items: updatedItems } : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Save exit interview ────────────────────────────────────────────────────

  const handleSaveInterview = async () => {
    if (!selected || !interviewDate) { setError('Interview date is required'); return; }
    setSaving(true);
    try {
      const { error: err } = await saveExitInterview(selected.id, interviewNotes, interviewDate);
      if (err) throw new Error(err.message || 'Failed to save interview');
      flash('Exit interview saved');
      setRequests(prev =>
        prev.map(r =>
          r.id === selected.id
            ? { ...r, exit_interview_done: true, exit_interview_date: interviewDate, exit_interview_notes: interviewNotes }
            : r
        )
      );
      setSelected(prev =>
        prev ? { ...prev, exit_interview_done: true, exit_interview_date: interviewDate, exit_interview_notes: interviewNotes } : null
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = requests.filter(r => {
    if (filterTab === 'all') return true;
    if (filterTab === 'in_progress') return r.status === 'in_progress';
    return r.status === filterTab;
  });

  // ── Summary counts ─────────────────────────────────────────────────────────

  const counts = {
    pending: requests.filter(r => r.status === 'pending').length,
    in_progress: requests.filter(r => r.status === 'in_progress' || r.status === 'acknowledged').length,
    completed: requests.filter(r => r.status === 'completed').length,
  };

  // ── Styles ─────────────────────────────────────────────────────────────────

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
    padding: '8px 14px',
    background: 'var(--gray-100)',
    color: 'var(--gray-700)',
    border: '1px solid var(--gray-300)',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  };

  // ── Render ─────────────────────────────────────────────────────────────────

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
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: 'var(--gray-900)' }}>
              🚪 Exit Management
            </h1>
            {/* Summary cards */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Pending', value: counts.pending, bg: 'var(--gray-100)', color: 'var(--gray-700)' },
                { label: 'In Progress', value: counts.in_progress, bg: '#fef3c7', color: 'var(--warning-500)' },
                { label: 'Completed', value: counts.completed, bg: '#dcfce7', color: 'var(--success-500)' },
              ].map(s => (
                <div
                  key={s.label}
                  style={{
                    background: s.bg,
                    borderRadius: 8,
                    padding: '6px 14px',
                    minWidth: 80,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 20, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <NotificationBell />
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
            >×</button>
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

        {/* Filter Tabs */}
        <div
          style={{
            padding: '0 24px',
            background: '#fff',
            borderBottom: '1px solid var(--gray-200)',
            display: 'flex',
            gap: 0,
          }}
        >
          {([
            { key: 'all', label: `All (${requests.length})` },
            { key: 'pending', label: `Pending (${counts.pending})` },
            { key: 'in_progress', label: `In Progress (${counts.in_progress})` },
            { key: 'clearance', label: `Clearance (${requests.filter(r => r.status === 'clearance').length})` },
            { key: 'completed', label: `Completed (${counts.completed})` },
          ] as { key: FilterTab; label: string }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              style={{
                padding: '12px 16px',
                border: 'none',
                background: 'none',
                fontSize: 13,
                fontWeight: filterTab === tab.key ? 700 : 500,
                color: filterTab === tab.key ? 'var(--primary-600)' : 'var(--gray-600)',
                borderBottom: filterTab === tab.key ? '2px solid var(--primary-600)' : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--gray-500)' }}>Loading...</div>
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
              <div style={{ fontSize: 36, marginBottom: 8 }}>🚪</div>
              <p>No exit requests found</p>
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
                      {['Employee', 'Department', 'Exit Type', 'Notice Date', 'Last Working Day', 'Status', 'Days Remaining', 'Actions'].map(h => (
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
                    {filtered.map((req, idx) => (
                      <tr
                        key={req.id}
                        style={{
                          borderBottom: idx < filtered.length - 1 ? '1px solid var(--gray-100)' : 'none',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                        onClick={() => openPanel(req)}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--gray-900)' }}>
                          {req.employee_name || 'Unknown'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-600)' }}>
                          {req.department_name || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-700)' }}>
                          {EXIT_TYPE_LABELS[req.exit_type]}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                          {fmt(req.notice_date)}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--gray-600)', whiteSpace: 'nowrap' }}>
                          {fmt(req.last_working_date)}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <StatusBadge status={req.status} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {req.status !== 'completed' && req.status !== 'cancelled' ? (
                            <DaysRemainingBadge lastWorkingDate={req.last_working_date} />
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                          <button
                            style={{
                              padding: '4px 12px',
                              background: 'var(--primary-600)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 5,
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                            onClick={() => openPanel(req)}
                          >
                            Manage
                          </button>
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

      {/* ── Detail Side Panel / Modal ─────────────────────────────────────── */}
      {selected && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) closePanel(); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#fff',
              height: '100%',
              overflowY: 'auto',
              boxShadow: '-4px 0 30px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--gray-200)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                background: 'var(--gray-50)',
                flexShrink: 0,
              }}
            >
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 700, color: 'var(--gray-900)' }}>
                  {selected.employee_name}
                </h2>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 6 }}>
                  {selected.department_name || '—'} · {EXIT_TYPE_LABELS[selected.exit_type]}
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <button
                onClick={closePanel}
                style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--gray-400)', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {/* Employee info */}
              <div
                style={{
                  background: 'var(--gray-50)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px 16px',
                  fontSize: 13,
                }}
              >
                {[
                  { label: 'Notice Date', value: fmt(selected.notice_date) },
                  { label: 'Last Working Day', value: fmt(selected.last_working_date) },
                  { label: 'Submitted', value: fmt(selected.created_at) },
                  { label: 'Days Remaining', value: <DaysRemainingBadge lastWorkingDate={selected.last_working_date} /> },
                ].map(row => (
                  <div key={row.label}>
                    <span style={{ color: 'var(--gray-500)', marginRight: 4 }}>{row.label}:</span>
                    <span style={{ fontWeight: 600, color: 'var(--gray-800)' }}>{row.value}</span>
                  </div>
                ))}
                {selected.reason && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: 'var(--gray-500)' }}>Reason: </span>
                    <span style={{ color: 'var(--gray-700)' }}>{selected.reason}</span>
                  </div>
                )}
              </div>

              {/* Status Update */}
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Update Status
                </h3>
                <select
                  style={{ ...inputStyle, marginBottom: 8 }}
                  value={panelStatus}
                  onChange={e => setPanelStatus(e.target.value as ExitRequest['status'])}
                >
                  {STATUS_ORDER.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>HR Notes</label>
                  <textarea
                    style={{ ...inputStyle, height: 64, resize: 'vertical' }}
                    value={hrNotes}
                    onChange={e => setHrNotes(e.target.value)}
                    placeholder="Internal HR notes..."
                  />
                </div>
                <button style={btnPrimary} onClick={handleSaveStatus} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Status'}
                </button>
              </section>

              {/* Clearance Checklist */}
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Clearance Checklist
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-500)', marginLeft: 8, textTransform: 'none' }}>
                    ({clearanceItems.filter(i => i.cleared).length}/{clearanceItems.length} cleared)
                  </span>
                </h3>
                <div
                  style={{
                    border: '1px solid var(--gray-200)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {clearanceItems.map((item, idx) => (
                    <div
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '10px 14px',
                        borderBottom: idx < clearanceItems.length - 1 ? '1px solid var(--gray-100)' : 'none',
                        background: item.cleared ? '#f0fdf4' : '#fff',
                        transition: 'background 0.15s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.cleared}
                        onChange={() => handleClearanceToggle(item.key, item.cleared)}
                        style={{ marginTop: 2, cursor: 'pointer', accentColor: 'var(--success-500)' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: item.cleared ? 'var(--success-500)' : 'var(--gray-800)',
                            textDecoration: item.cleared ? 'line-through' : 'none',
                          }}
                        >
                          {item.label}
                        </div>
                        {item.cleared && (
                          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>
                            Cleared by {item.cleared_by_name || 'HR'} · {fmt(item.cleared_at || null)}
                            {item.notes && ` · ${item.notes}`}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Exit Interview */}
              <section style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'var(--gray-800)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Exit Interview
                  {selected.exit_interview_done && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--success-500)', marginLeft: 8, background: '#dcfce7', padding: '1px 7px', borderRadius: 8, textTransform: 'none' }}>
                      Done
                    </span>
                  )}
                </h3>
                <div style={{ marginBottom: 8 }}>
                  <label style={labelStyle}>Interview Date</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={interviewDate}
                    onChange={e => setInterviewDate(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Interview Notes</label>
                  <textarea
                    style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                    value={interviewNotes}
                    onChange={e => setInterviewNotes(e.target.value)}
                    placeholder="Key points from exit interview..."
                  />
                </div>
                <button
                  style={{ ...btnPrimary, background: 'var(--success-500)' }}
                  onClick={handleSaveInterview}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Interview'}
                </button>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ── Clearance Note Prompt ─────────────────────────────────────────── */}
      {clearancePromptKey && (
        <div style={overlayStyle}>
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--gray-900)' }}>
              Mark as Cleared
            </h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--gray-500)' }}>
              {clearanceItems.find(i => i.key === clearancePromptKey)?.label}
            </p>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea
              style={{ ...inputStyle, height: 72, resize: 'vertical', marginBottom: 14 }}
              value={clearanceNoteInput}
              onChange={e => setClearanceNoteInput(e.target.value)}
              placeholder="Any relevant notes..."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                style={btnSecondary}
                onClick={() => { setClearancePromptKey(null); setClearanceNoteInput(''); }}
              >
                Cancel
              </button>
              <button
                style={{ ...btnPrimary, background: 'var(--success-500)' }}
                onClick={confirmClearanceItem}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
