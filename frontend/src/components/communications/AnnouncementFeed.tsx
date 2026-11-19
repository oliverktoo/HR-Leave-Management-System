import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getMyAnnouncements,
  markAnnouncementRead,
  type Announcement,
} from '../../services/announcementService';

export const AnnouncementFeed = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  // Track which IDs we've already auto-marked to avoid duplicate calls on re-renders
  const autoMarkedRef = useRef<Set<string>>(new Set());

  const unreadCount = announcements.filter(a => !a.is_read).length;

  const load = useCallback(async (): Promise<Announcement[]> => {
    setLoading(true);
    try {
      const result = await getMyAnnouncements();
      if (result.error) throw new Error(result.error.message || 'Failed to load');
      const data = result.data ?? [];
      setAnnouncements(data);
      return data;
    } catch (err: any) {
      setError(err.message || 'Failed to load announcements');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-mark pinned announcements as read when viewed
  const autoMarkPinned = useCallback(async (items: Announcement[]) => {
    const pinnedUnread = items.filter(
      a => a.is_pinned && !a.is_read && !autoMarkedRef.current.has(a.id)
    );
    if (pinnedUnread.length === 0) return;

    for (const ann of pinnedUnread) {
      autoMarkedRef.current.add(ann.id);
      try {
        await markAnnouncementRead(ann.id);
      } catch {
        // Best-effort — don't surface errors for auto-mark
      }
    }

    const markedIds = new Set(pinnedUnread.map(a => a.id));
    setAnnouncements(prev => prev.map(a => markedIds.has(a.id) ? { ...a, is_read: true } : a));
  }, []);

  useEffect(() => {
    load().then(data => {
      if (data.length > 0) autoMarkPinned(data);
    });
  }, [load, autoMarkPinned]);

  const handleMarkRead = async (ann: Announcement) => {
    if (ann.is_read) return;
    setMarkingId(ann.id);
    try {
      await markAnnouncementRead(ann.id);
      setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_read: true } : a));
    } catch (err: any) {
      setError(err.message || 'Failed to mark as read');
      setTimeout(() => setError(null), 3000);
    } finally {
      setMarkingId(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-KE', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const targetBadgeStyle = (target: string): React.CSSProperties => {
    const base: React.CSSProperties = {
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
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

  // Pinned first, then newest
  const sorted = [...announcements].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main" style={{ padding: '24px' }}>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: 'var(--gray-900, #111827)' }}>
              📢 Announcements
            </h1>
            {unreadCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '22px', height: '22px',
                background: 'var(--primary-600, #2563eb)',
                color: '#fff',
                borderRadius: '11px',
                fontSize: '12px',
                fontWeight: 700,
                padding: '0 6px',
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <NotificationBell />
        </div>

        {/* ── Error message ── */}
        {error && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b',
            borderRadius: '8px', padding: '10px 16px', marginBottom: '16px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#991b1b' }}
            >×</button>
          </div>
        )}

        {/* ── Loading state ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--gray-400, #9ca3af)' }}>
            <div style={{
              width: '36px', height: '36px',
              border: '3px solid var(--primary-200, #bfdbfe)',
              borderTopColor: 'var(--primary-600, #2563eb)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              margin: '0 auto 14px',
            }} />
            <p style={{ margin: 0, fontSize: '14px' }}>Loading announcements…</p>
          </div>
        ) : sorted.length === 0 ? (
          /* ── Empty state ── */
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            padding: '80px 24px',
            textAlign: 'center',
            color: 'var(--gray-400, #9ca3af)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: '48px', marginBottom: '14px' }}>📭</div>
            <p style={{ margin: 0, fontSize: '17px', fontWeight: 600, color: 'var(--gray-500, #6b7280)' }}>
              No announcements for you right now
            </p>
            <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
              Check back later — your HR team will post updates here.
            </p>
          </div>
        ) : (
          /* ── Announcement cards ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {sorted.map(ann => {
              const isPinned = ann.is_pinned;
              const isUnread = !ann.is_read;

              const cardStyle: React.CSSProperties = {
                background: isPinned
                  ? 'linear-gradient(135deg, #fffbeb 0%, #fff 60%)'
                  : '#fff',
                borderRadius: '10px',
                padding: '18px 20px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
                borderLeft: isUnread
                  ? '4px solid var(--primary-500, #3b82f6)'
                  : isPinned
                    ? '4px solid var(--warning-500, #f59e0b)'
                    : '4px solid transparent',
                opacity: isUnread ? 1 : 0.8,
                transition: 'opacity 0.2s',
              };

              return (
                <div key={ann.id} style={cardStyle}>
                  {/* Row 1: title + badges + mark-read button */}
                  <div style={{
                    display: 'flex', alignItems: 'flex-start',
                    justifyContent: 'space-between', gap: '10px',
                    marginBottom: '10px', flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                      {isPinned && (
                        <span style={{ fontSize: '16px', flexShrink: 0 }} title="Pinned announcement">📌</span>
                      )}
                      <span style={{
                        fontWeight: 700, fontSize: '15px',
                        color: 'var(--gray-900, #111827)', wordBreak: 'break-word',
                      }}>
                        {ann.title}
                      </span>
                      <span style={targetBadgeStyle(ann.target)}>{targetBadgeLabel(ann)}</span>
                      {isUnread && (
                        <span style={{
                          display: 'inline-block',
                          width: '8px', height: '8px',
                          borderRadius: '50%',
                          background: 'var(--primary-500, #3b82f6)',
                          flexShrink: 0,
                        }} title="Unread" />
                      )}
                    </div>

                    {isUnread ? (
                      <button
                        onClick={() => handleMarkRead(ann)}
                        disabled={markingId === ann.id}
                        style={{
                          padding: '5px 14px',
                          borderRadius: '6px',
                          border: '1px solid var(--primary-300, #93c5fd)',
                          background: 'var(--primary-50, #eff6ff)',
                          color: 'var(--primary-700, #1d4ed8)',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: markingId === ann.id ? 'not-allowed' : 'pointer',
                          opacity: markingId === ann.id ? 0.6 : 1,
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {markingId === ann.id ? 'Marking…' : '✓ Mark as Read'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--gray-400, #9ca3af)', flexShrink: 0, fontStyle: 'italic' }}>
                        Read
                      </span>
                    )}
                  </div>

                  {/* Row 2: body (full text) */}
                  <p style={{
                    margin: '0 0 12px',
                    fontSize: '14px',
                    color: 'var(--gray-700, #374151)',
                    lineHeight: '1.65',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {ann.body}
                  </p>

                  {/* Row 3: meta strip */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    fontSize: '12px',
                    color: 'var(--gray-400, #9ca3af)',
                    flexWrap: 'wrap',
                    borderTop: '1px solid var(--gray-100, #f3f4f6)',
                    paddingTop: '10px',
                    marginTop: '4px',
                  }}>
                    {ann.creator_name && (
                      <span>Posted by {ann.creator_name}</span>
                    )}
                    {ann.created_at && (
                      <span>{formatDate(ann.created_at)}</span>
                    )}
                    {ann.expires_at && (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                        Expires{' '}
                        {new Date(ann.expires_at).toLocaleDateString('en-KE', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
