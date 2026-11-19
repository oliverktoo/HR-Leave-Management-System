import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { supabase } from '../../lib/supabaseClient';
import {
  getAllAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type Announcement,
  type CreateAnnouncementInput,
} from '../../services/announcementService';

type TargetType = 'all' | 'department' | 'role';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'hod', label: 'Head of Department' },
  { value: 'driver', label: 'Driver' },
  { value: 'fleet_manager', label: 'Fleet Manager' },
  { value: 'hr_admin', label: 'HR Admin' },
];

interface Department {
  id: string;
  name: string;
}

export const AnnouncementManager = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetDepartment, setTargetDepartment] = useState('');
  const [targetRole, setTargetRole] = useState('employee');
  const [isPinned, setIsPinned] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const flash = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 4000);
    } else {
      setSuccess(msg);
      setTimeout(() => setSuccess(null), 3500);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, { data: depts }] = await Promise.all([
        getAllAnnouncements(),
        supabase.from('departments').select('id, name').order('name'),
      ]);
      if (result.error) throw new Error(result.error.message || 'Failed to load');
      setAnnouncements(result.data ?? []);
      setDepartments(depts ?? []);
    } catch (err: any) {
      flash(err.message || 'Failed to load announcements', true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setTargetType('all');
    setTargetDepartment('');
    setTargetRole('employee');
    setIsPinned(false);
    setExpiresAt('');
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setBody(ann.body);
    setTargetType(ann.target as TargetType);
    setTargetDepartment(ann.department_id ?? '');
    setTargetRole(ann.target_role ?? 'employee');
    setIsPinned(ann.is_pinned ?? false);
    setExpiresAt(ann.expires_at ? ann.expires_at.slice(0, 10) : '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) { flash('Title is required', true); return; }
    if (!body.trim()) { flash('Body is required', true); return; }

    const input: CreateAnnouncementInput = {
      title: title.trim(),
      body: body.trim(),
      target: targetType,
      department_id: targetType === 'department' ? targetDepartment || undefined : undefined,
      target_role: targetType === 'role' ? targetRole || undefined : undefined,
      is_pinned: isPinned,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        const res = await updateAnnouncement(editingId, input);
        if (res.error) throw new Error(res.error.message || 'Update failed');
        flash('Announcement updated.');
      } else {
        const res = await createAnnouncement(input);
        if (res.error) throw new Error(res.error.message || 'Create failed');
        flash('Announcement created.');
      }
      setShowModal(false);
      resetForm();
      await load();
    } catch (err: any) {
      flash(err.message || 'Save failed', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (ann: Announcement) => {
    try {
      const res = await updateAnnouncement(ann.id, { is_active: !ann.is_active });
      if (res.error) throw new Error(res.error.message || 'Toggle failed');
      setAnnouncements(prev =>
        prev.map(a => a.id === ann.id ? { ...a, is_active: !a.is_active } : a)
      );
    } catch (err: any) {
      flash(err.message || 'Failed to toggle', true);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      const res = await deleteAnnouncement(deletingId);
      if (res.error) throw new Error(res.error.message || 'Delete failed');
      setDeletingId(null);
      flash('Announcement deleted.');
      await load();
    } catch (err: any) {
      flash(err.message || 'Delete failed', true);
    } finally {
      setDeleteLoading(false);
    }
  };

  const targetBadgeStyle = (target: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
      letterSpacing: '0.3px',
    };
    if (target === 'all') return { ...base, background: 'var(--primary-100, #dbeafe)', color: 'var(--primary-700, #1d4ed8)' };
    if (target === 'department') return { ...base, background: '#d1fae5', color: '#065f46' };
    return { ...base, background: '#fff3cd', color: '#92400e' };
  };

  const targetBadgeLabel = (ann: Announcement) => {
    if (ann.target === 'department') return 'Department';
    if (ann.target === 'role') return 'By Role';
    return 'All Staff';
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
    padding: '16px',
  };

  const modalStyle: React.CSSProperties = {
    background: 'var(--gray-50, #f9fafb)',
    borderRadius: '12px',
    padding: '28px 32px',
    width: '100%',
    maxWidth: '560px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--gray-300, #d1d5db)',
    borderRadius: '6px',
    fontSize: '14px',
    background: '#fff',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--gray-700, #374151)',
    marginBottom: '4px',
  };

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '16px',
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main" style={{ padding: '24px' }}>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--gray-900, #111827)' }}>
              📢 Announcements
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '14px', color: 'var(--gray-500, #6b7280)' }}>
              Create and manage staff announcements
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <NotificationBell />
            <button
              onClick={openCreate}
              style={{
                background: 'var(--primary-600, #2563eb)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 18px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              + New Announcement
            </button>
          </div>
        </div>

        {/* ── Flash messages ── */}
        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b',
            borderRadius: '8px', padding: '10px 16px', marginBottom: '16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b' }}>×</button>
          </div>
        )}
        {success && (
          <div style={{
            background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46',
            borderRadius: '8px', padding: '10px 16px', marginBottom: '16px',
          }}>
            {success}
          </div>
        )}

        {/* ── Loading ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--gray-400, #9ca3af)' }}>
            <div style={{
              width: '36px', height: '36px', border: '3px solid var(--primary-200, #bfdbfe)',
              borderTopColor: 'var(--primary-600, #2563eb)', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
            }} />
            <p style={{ margin: 0 }}>Loading announcements…</p>
          </div>
        ) : announcements.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '60px 24px',
            textAlign: 'center', color: 'var(--gray-400, #9ca3af)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
            <p style={{ margin: 0, fontSize: '16px', fontWeight: 500 }}>No announcements yet</p>
            <p style={{ margin: '6px 0 0', fontSize: '14px' }}>Click "New Announcement" to create one.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {announcements.map(ann => (
              <div
                key={ann.id}
                style={{
                  background: '#fff',
                  borderRadius: '10px',
                  padding: '16px 20px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                  borderLeft: ann.is_pinned ? '4px solid var(--warning-500, #f59e0b)' : '4px solid transparent',
                  opacity: ann.is_active ? 1 : 0.6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {/* Row 1: title + badges + actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--gray-900, #111827)', wordBreak: 'break-word' }}>
                      {ann.title}
                    </span>
                    <span style={targetBadgeStyle(ann.target)}>{targetBadgeLabel(ann)}</span>
                    {ann.is_pinned && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                        fontSize: '11px', fontWeight: 600,
                        background: '#fef3c7', color: '#92400e',
                      }}>📌 Pinned</span>
                    )}
                    {!ann.is_active && (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: '12px',
                        fontSize: '11px', fontWeight: 600,
                        background: 'var(--gray-100, #f3f4f6)', color: 'var(--gray-500, #6b7280)',
                      }}>Inactive</span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <button
                      onClick={() => handleToggleActive(ann)}
                      title={ann.is_active ? 'Click to deactivate' : 'Click to activate'}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: `1px solid ${ann.is_active ? '#6ee7b7' : 'var(--gray-300, #d1d5db)'}`,
                        background: ann.is_active ? '#d1fae5' : 'var(--gray-100, #f3f4f6)',
                        color: ann.is_active ? '#065f46' : 'var(--gray-600, #4b5563)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {ann.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => openEdit(ann)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--primary-300, #93c5fd)',
                        background: 'var(--primary-50, #eff6ff)',
                        color: 'var(--primary-700, #1d4ed8)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingId(ann.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '6px',
                        border: '1px solid #fca5a5',
                        background: '#fee2e2',
                        color: '#991b1b',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Row 2: body preview */}
                <p style={{
                  margin: 0,
                  fontSize: '13px',
                  color: 'var(--gray-600, #4b5563)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: '1.5',
                }}>
                  {ann.body}
                </p>

                {/* Row 3: meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--gray-400, #9ca3af)', flexWrap: 'wrap' }}>
                  {ann.creator_name && (
                    <span>By {ann.creator_name}</span>
                  )}
                  {ann.created_at && <span>{formatDate(ann.created_at)}</span>}
                  {typeof ann.read_count === 'number' && (
                    <span>👁 {ann.read_count} read{ann.read_count !== 1 ? 's' : ''}</span>
                  )}
                  {ann.expires_at && (
                    <span style={{ color: '#f59e0b' }}>Expires {formatDate(ann.expires_at)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Create / Edit Modal ── */}
        {showModal && (
          <div
            style={overlayStyle}
            onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); resetForm(); } }}
          >
            <div style={modalStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--gray-900, #111827)' }}>
                  {editingId ? 'Edit Announcement' : 'New Announcement'}
                </h2>
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--gray-400)', lineHeight: 1 }}
                >×</button>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Title <span style={{ color: '#ef4444' }}>*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Announcement title"
                  style={inputStyle}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Body <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="Write your announcement here…"
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '100px', fontFamily: 'inherit' }}
                />
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>Target Audience</label>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {(['all', 'department', 'role'] as TargetType[]).map(opt => (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '14px', color: 'var(--gray-700, #374151)' }}>
                      <input
                        type="radio"
                        name="targetType"
                        value={opt}
                        checked={targetType === opt}
                        onChange={() => setTargetType(opt)}
                        style={{ accentColor: 'var(--primary-600)' }}
                      />
                      {opt === 'all' ? 'All Staff' : opt === 'department' ? 'Department' : 'By Role'}
                    </label>
                  ))}
                </div>
              </div>

              {targetType === 'department' && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Department</label>
                  <select
                    value={targetDepartment}
                    onChange={e => setTargetDepartment(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">-- Select department --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {targetType === 'role' && (
                <div style={fieldGroupStyle}>
                  <label style={labelStyle}>Role</label>
                  <select
                    value={targetRole}
                    onChange={e => setTargetRole(e.target.value)}
                    style={inputStyle}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ ...fieldGroupStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="isPinned"
                  checked={isPinned}
                  onChange={e => setIsPinned(e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary-600)', cursor: 'pointer' }}
                />
                <label htmlFor="isPinned" style={{ fontSize: '14px', color: 'var(--gray-700, #374151)', cursor: 'pointer', margin: 0 }}>
                  📌 Pin this announcement (shows at top of feed)
                </label>
              </div>

              <div style={fieldGroupStyle}>
                <label style={labelStyle}>
                  Expires At{' '}
                  <span style={{ color: 'var(--gray-400, #9ca3af)', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={e => setExpiresAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  onClick={() => { setShowModal(false); resetForm(); }}
                  disabled={saving}
                  style={{
                    padding: '9px 20px', borderRadius: '7px',
                    border: '1px solid var(--gray-300, #d1d5db)', background: '#fff',
                    color: 'var(--gray-700, #374151)', fontSize: '14px', fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '9px 20px', borderRadius: '7px',
                    border: 'none', background: 'var(--primary-600, #2563eb)',
                    color: '#fff', fontSize: '14px', fontWeight: 600,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation Modal ── */}
        {deletingId && (
          <div
            style={overlayStyle}
            onClick={e => { if (e.target === e.currentTarget) setDeletingId(null); }}
          >
            <div style={{ ...modalStyle, maxWidth: '400px' }}>
              <h2 style={{ margin: '0 0 10px', fontSize: '18px', fontWeight: 700, color: 'var(--gray-900, #111827)' }}>
                Delete Announcement?
              </h2>
              <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--gray-600, #4b5563)' }}>
                This action cannot be undone. The announcement will be permanently removed.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setDeletingId(null)}
                  disabled={deleteLoading}
                  style={{
                    padding: '9px 20px', borderRadius: '7px',
                    border: '1px solid var(--gray-300, #d1d5db)', background: '#fff',
                    color: 'var(--gray-700, #374151)', fontSize: '14px', fontWeight: 600,
                    cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  style={{
                    padding: '9px 20px', borderRadius: '7px',
                    border: 'none', background: '#dc2626',
                    color: '#fff', fontSize: '14px', fontWeight: 600,
                    cursor: deleteLoading ? 'not-allowed' : 'pointer',
                    opacity: deleteLoading ? 0.7 : 1,
                  }}
                >
                  {deleteLoading ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
