// SelfieVerificationPanel — Panel for supervisors/HR to verify or flag selfie photos

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SelfieVerificationPanelProps {
  type: 'attendance' | 'field';
}

interface PendingSelfie {
  id: string;
  user_id: string;
  selfie_url: string;
  face_match_score?: number | null;
  created_at: string;
  // attendance_records specific
  clock_in_time?: string;
  // field_clock_logs specific
  clock_in_time_field?: string;
  // resolved after joining profiles
  employee_name?: string;
  reference_photo_url?: string | null;
  signed_url?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the storage object path from a full public URL.
 *  e.g. "https://…/storage/v1/object/public/attendance-selfies/user/abc.jpg"
 *       → "user/abc.jpg"
 */
function extractStoragePath(fullUrl: string): string {
  const marker = '/attendance-selfies/';
  const idx = fullUrl.indexOf(marker);
  if (idx === -1) return fullUrl;
  return fullUrl.slice(idx + marker.length);
}

function faceMatchBadge(score: number | null | undefined): React.ReactElement | null {
  if (score == null) return null;
  let bg: string, color: string, label: string;
  if (score < 0.4) {
    bg = '#dcfce7'; color = '#15803d'; label = `Match ${(score * 100).toFixed(0)}%`;
  } else if (score <= 0.6) {
    bg = '#fef9c3'; color = '#854d0e'; label = `Partial ${(score * 100).toFixed(0)}%`;
  } else {
    bg = '#fee2e2'; color = '#b91c1c'; label = `Low ${(score * 100).toFixed(0)}%`;
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
      background: bg, color,
    }}>
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SelfieVerificationPanel({ type }: SelfieVerificationPanelProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<PendingSelfie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoVerifiedCount, setAutoVerifiedCount] = useState(0);
  const [flagPrompt, setFlagPrompt] = useState<{ id: string; reason: string } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null); // id being processed

  const table = type === 'attendance' ? 'attendance_records' : 'field_clock_logs';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch records with unverified, unflagged selfies
      const photoCol = type === 'attendance' ? 'selfie_url' : 'clock_in_photo_url';
      const timeCol  = type === 'attendance' ? 'check_in_time' : 'clock_in_time';

      const { data: rows, error: fetchErr } = await supabase
        .from(table)
        .select(`id, user_id, ${photoCol}, face_match_score, created_at, ${timeCol}`)
        .not(photoCol, 'is', null)
        .eq('selfie_verified', false)
        .eq('selfie_flagged', false)
        .order('created_at', { ascending: false })
        .limit(100);

      if (fetchErr) throw fetchErr;
      if (!rows || rows.length === 0) { setItems([]); setLoading(false); return; }

      // 2. Batch-fetch employee names + reference photos from users_profile
      const userIds = [...new Set(rows.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('users_profile')
        .select('id, full_name, first_name, last_name, photo_url')
        .in('id', userIds);

      const nameMap: Record<string, string> = {};
      const photoMap: Record<string, string | null> = {};
      (profiles ?? []).forEach(p => {
        nameMap[p.id] = p.full_name?.trim() || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.id;
        photoMap[p.id] = p.photo_url ?? null;
      });

      // 2b. Auto-verify records that already passed the face match threshold (score < 0.4)
      const autoVerifyIds = rows
        .filter(r => r.face_match_score != null && r.face_match_score < 0.4)
        .map(r => r.id);
      if (autoVerifyIds.length > 0) {
        await supabase
          .from(table)
          .update({ selfie_verified: true, selfie_verified_at: new Date().toISOString() })
          .in('id', autoVerifyIds);
        setAutoVerifiedCount(autoVerifyIds.length);
      } else {
        setAutoVerifiedCount(0);
      }
      // Exclude auto-verified from the queue
      const pendingRows = rows.filter(r => !autoVerifyIds.includes(r.id));

      // 3. Generate signed URLs
      const enriched: PendingSelfie[] = await Promise.all(
        pendingRows.map(async (row) => {
          let signed_url: string | undefined;
          try {
            const path = extractStoragePath((row as any).selfie_url);
            const { data: signedData } = await supabase.storage
              .from('attendance-selfies')
              .createSignedUrl(path, 3600);
            signed_url = signedData?.signedUrl;
          } catch {
            signed_url = (row as any).selfie_url; // fallback to original URL
          }

          const rawPhotoUrl = (row as any).selfie_url ?? (row as any).clock_in_photo_url;
          return {
            id: row.id,
            user_id: row.user_id,
            selfie_url: rawPhotoUrl,
            face_match_score: row.face_match_score,
            created_at: row.created_at,
            clock_in_time: (row as any).check_in_time ?? (row as any).clock_in_time,
            employee_name: nameMap[row.user_id] ?? row.user_id,
            reference_photo_url: photoMap[row.user_id] ?? null,
            signed_url,
          };
        })
      );

      setItems(enriched);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load selfies');
    } finally {
      setLoading(false);
    }
  }, [table, type]);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (id: string) => {
    setProcessing(id);
    try {
      const { error: updateErr } = await supabase
        .from(table)
        .update({
          selfie_verified: true,
          selfie_verified_by: profile?.id,
          selfie_verified_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updateErr) throw updateErr;
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err: any) {
      setError(err.message ?? 'Verification failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleFlagSubmit = async () => {
    if (!flagPrompt || !flagPrompt.reason.trim()) return;
    setProcessing(flagPrompt.id);
    try {
      const { error: updateErr } = await supabase
        .from(table)
        .update({
          selfie_flagged: true,
          selfie_flag_reason: flagPrompt.reason.trim(),
        })
        .eq('id', flagPrompt.id);
      if (updateErr) throw updateErr;
      setItems(prev => prev.filter(i => i.id !== flagPrompt.id));
      setFlagPrompt(null);
    } catch (err: any) {
      setError(err.message ?? 'Flag failed');
    } finally {
      setProcessing(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
        <p>Loading selfies…</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-error mb-4">
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>×</button>
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {type === 'attendance' ? 'Attendance' : 'Field'} Selfies Pending Verification
            {items.length > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 12, fontWeight: 600,
                background: '#fef3c7', color: '#92400e',
                border: '1px solid #fde68a', borderRadius: 10,
                padding: '1px 8px',
              }}>
                {items.length}
              </span>
            )}
          </h3>
          {autoVerifiedCount > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#15803d' }}>
              ✅ {autoVerifiedCount} high-confidence match{autoVerifiedCount > 1 ? 'es' : ''} auto-verified this load
            </p>
          )}
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div style={{
          padding: '40px 20px', textAlign: 'center', color: '#6b7280',
          background: '#f9fafb', borderRadius: 8, border: '1px dashed #d1d5db',
        }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
          <p style={{ margin: 0, fontWeight: 500 }}>All selfies verified</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}>
          {items.map(item => (
            <div
              key={item.id}
              className="card"
              style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            >
              {/* Name + timestamp header */}
              <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{item.employee_name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {item.clock_in_time
                    ? new Date(item.clock_in_time).toLocaleString('en-GB', {
                        timeZone: 'Africa/Nairobi',
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : new Date(item.created_at).toLocaleString('en-GB', {
                        timeZone: 'Africa/Nairobi',
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                  {item.face_match_score == null && (
                    <span style={{ marginLeft: 6, color: '#9ca3af' }}>· No face score</span>
                  )}
                </div>
              </div>

              {/* Photos row: reference + selfie side by side */}
              <div style={{ display: 'flex', background: '#111', lineHeight: 0, position: 'relative' }}>
                {/* Reference photo (profile) */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {item.reference_photo_url ? (
                    <img
                      src={item.reference_photo_url}
                      alt="Reference"
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block', opacity: 0.9 }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#374151', flexDirection: 'column' }}>
                      <span style={{ color: '#6b7280', fontSize: 22 }}>👤</span>
                      <span style={{ color: '#6b7280', fontSize: 9, marginTop: 2 }}>No photo</span>
                    </div>
                  )}
                  <span style={{
                    position: 'absolute', bottom: 4, left: 4, fontSize: 9, fontWeight: 600,
                    background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 5px', borderRadius: 4,
                  }}>PROFILE</span>
                </div>

                {/* Divider */}
                <div style={{ width: 2, background: '#1f2937' }} />

                {/* Clock-in selfie */}
                <div style={{ flex: 1, position: 'relative' }}>
                  {item.signed_url ? (
                    <img
                      src={item.signed_url}
                      alt={`Selfie — ${item.employee_name}`}
                      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                      onError={e => { (e.currentTarget as HTMLImageElement).src = item.selfie_url; }}
                    />
                  ) : (
                    <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#374151' }}>
                      <span style={{ color: '#9ca3af', fontSize: 32 }}>📷</span>
                    </div>
                  )}
                  <span style={{
                    position: 'absolute', bottom: 4, left: 4, fontSize: 9, fontWeight: 600,
                    background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 5px', borderRadius: 4,
                  }}>SELFIE</span>
                  {/* Face match badge overlay */}
                  {item.face_match_score != null && (
                    <div style={{ position: 'absolute', top: 5, right: 5 }}>
                      {faceMatchBadge(item.face_match_score)}
                    </div>
                  )}
                </div>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #e5e7eb' }}>
                <button
                  onClick={() => handleVerify(item.id)}
                  disabled={processing === item.id}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    cursor: processing === item.id ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#15803d',
                    borderRight: '1px solid #e5e7eb',
                    opacity: processing === item.id ? 0.5 : 1,
                  }}
                >
                  {processing === item.id ? '…' : '✅ Verify'}
                </button>
                <button
                  onClick={() => setFlagPrompt({ id: item.id, reason: '' })}
                  disabled={processing === item.id}
                  style={{
                    flex: 1, padding: '10px 0', border: 'none', background: 'transparent',
                    cursor: processing === item.id ? 'not-allowed' : 'pointer',
                    fontSize: 13, fontWeight: 600, color: '#dc2626',
                    opacity: processing === item.id ? 0.5 : 1,
                  }}
                >
                  🚩 Flag
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Flag reason prompt modal ─────────────────────────────────────────── */}
      {flagPrompt && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>🚩 Flag Selfie</h3>
              <button className="modal-close" onClick={() => setFlagPrompt(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Reason for flagging</label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={flagPrompt.reason}
                  onChange={e => setFlagPrompt(prev => prev ? { ...prev, reason: e.target.value } : prev)}
                  placeholder="e.g. Photo unclear, person not visible, proxy suspected…"
                  autoFocus
                />
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px' }}>
              <button className="btn btn-outline" onClick={() => setFlagPrompt(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={handleFlagSubmit}
                disabled={!flagPrompt.reason.trim() || processing === flagPrompt.id}
              >
                {processing === flagPrompt.id ? 'Saving…' : '🚩 Confirm Flag'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
