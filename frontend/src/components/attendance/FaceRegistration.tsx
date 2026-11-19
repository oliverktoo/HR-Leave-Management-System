// FaceRegistration — allows an employee to register (or update) their profile photo,
// which is used for identity verification during selfie clock-in.

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import { SelfieCapture } from './SelfieCapture';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import {
  extractDescriptorFromDataUrl,
  descriptorToArray,
} from '../../services/faceVerificationService';

export function FaceRegistration() {
  const { user, profile } = useAuth();

  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ── Load current photo from users_profile ────────────────────────────────

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('users_profile')
          .select('profile_photo_url')
          .eq('id', user.id)
          .single();

        if (fetchError) throw fetchError;
        setCurrentPhotoUrl(data?.profile_photo_url ?? null);
      } catch (err: any) {
        setError('Failed to load your profile photo: ' + (err.message ?? 'Unknown error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ── Called by SelfieCapture once the photo has been uploaded ─────────────

  const handleCapture = async (_photoUrl: string, _blob: Blob, dataUrl: string) => {
    // dataUrl is the raw captured image; _photoUrl is the Supabase-hosted URL.
    const photoUrl = _photoUrl;
    setShowCamera(false);

    if (!user) {
      setError('You are not logged in. Please refresh and try again.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Show loading state while extracting face data
      setSuccess('Extracting face data...');

      const descriptor = await extractDescriptorFromDataUrl(dataUrl);

      if (!descriptor) {
        setSuccess(null);
        setError('No face detected. Please retake with your face clearly visible.');
        setSaving(false);
        return;
      }

      const faceDescriptorArray = descriptorToArray(descriptor);

      const { error: updateError } = await supabase
        .from('users_profile')
        .update({
          profile_photo_url: photoUrl,
          face_descriptor: faceDescriptorArray,
        })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setCurrentPhotoUrl(photoUrl);
      setSuccess('Face registered and verified \u2713');
    } catch (err: any) {
      setError('Failed to save your photo: ' + (err.message ?? 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const dismissSuccess = () => setSuccess(null);
  const dismissError = () => setError(null);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <AdminSidebar />

      <main className="admin-main">
        <div className="admin-container">

          {/* Page header */}
          <header className="admin-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
              <div>
                <h1 className="page-title">Face Registration</h1>
                <p className="page-subtitle admin-subtitle">Register your face for clock-in verification</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell />
            </div>
          </header>

          {/* Alerts */}
          {error && (
            <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{error}</span>
              <button onClick={dismissError} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'inherit', padding: '0 4px' }}>×</button>
            </div>
          )}
          {success && (
            <div className="alert alert-success mb-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{success}</span>
              <button onClick={dismissSuccess} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'inherit', padding: '0 4px' }}>×</button>
            </div>
          )}

          {/* ── Main card ──────────────────────────────────────────────────── */}
          <div className="card" style={{ maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            <div className="card-header">
              <h3 className="card-title">Your Profile Photo</h3>
            </div>

            <div className="card-body" style={{ padding: '24px 24px 28px' }}>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                  <p style={{ margin: 0, fontSize: 14 }}>Loading your profile…</p>
                </div>
              ) : (
                <>
                  {/* Instructions banner */}
                  <div style={{
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 10,
                    padding: '14px 16px',
                    marginBottom: 24,
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
                    <div style={{ fontSize: 14, color: '#1e40af', lineHeight: 1.5 }}>
                      <strong>Why register your face?</strong>
                      <br />
                      This photo will be used to verify your identity when you clock in. Please use a clear, well-lit
                      photo of your face without sunglasses or hats.
                    </div>
                  </div>

                  {/* Photo display */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                    {currentPhotoUrl ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <img
                            src={currentPhotoUrl}
                            alt="Your registered face photo"
                            style={{
                              width: 180,
                              height: 180,
                              borderRadius: '50%',
                              objectFit: 'cover',
                              border: '4px solid #3b82f6',
                              display: 'block',
                            }}
                          />
                          {/* Green "registered" badge */}
                          <span style={{
                            position: 'absolute',
                            bottom: 8,
                            right: 8,
                            background: '#22c55e',
                            color: '#fff',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 16,
                            border: '2px solid #fff',
                          }}>
                            ✓
                          </span>
                        </div>
                        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
                          Photo registered
                        </p>
                        {(profile?.first_name || profile?.last_name) && (
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>
                            {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div style={{
                        width: 180, height: 180, borderRadius: '50%',
                        background: '#f3f4f6', border: '3px dashed #d1d5db',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <span style={{ fontSize: 48, color: '#9ca3af' }}>👤</span>
                        <span style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '0 16px' }}>
                          No photo yet
                        </span>
                      </div>
                    )}

                    {/* Action button — only allow registration if no photo yet */}
                    {currentPhotoUrl ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#f1f5f9', border: '1px solid #cbd5e1',
                        borderRadius: 10, padding: '12px 20px',
                        fontSize: 14, color: '#475569',
                      }}>
                        <span style={{ fontSize: 18 }}>🔒</span>
                        <span>To update your face photo, please contact HR.</span>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          setShowCamera(true);
                        }}
                        disabled={saving}
                        style={{ minWidth: 200 }}
                      >
                        {saving ? 'Saving…' : '📷 Register Face Photo'}
                      </button>
                    )}

                    {/* Tips */}
                    <div style={{
                      width: '100%',
                      background: '#f9fafb',
                      borderRadius: 10,
                      padding: '14px 16px',
                      fontSize: 13,
                      color: '#374151',
                    }}>
                      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Tips for a good photo:</p>
                      <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <li>Face the camera directly in good lighting</li>
                        <li>Remove sunglasses, hats, or masks</li>
                        <li>Keep a neutral or slight smile expression</li>
                        <li>Make sure your full face is visible</li>
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* SelfieCapture modal */}
      {showCamera && user && (
        <SelfieCapture
          userId={user.id}
          context="face_registration"
          onCapture={handleCapture}
          onCancel={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

export default FaceRegistration;
