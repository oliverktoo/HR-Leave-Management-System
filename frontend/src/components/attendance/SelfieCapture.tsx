// SelfieCapture — reusable modal for taking a selfie and uploading to Supabase storage.
// On web: auto-captures when a face is detected (2-second stable hold countdown).
// On native (Capacitor): uses @capacitor/camera with front camera (no auto-detect).

import { useState, useEffect, useRef, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraSource, CameraDirection, CameraResultType } from '@capacitor/camera';
import { supabase } from '../../lib/supabaseClient';
import { loadModels } from '../../services/faceVerificationService';
import * as faceapi from 'face-api.js';

export interface SelfieCaptureProps {
  onCapture: (photoUrl: string, blob: Blob, dataUrl: string) => void;
  onCancel: () => void;
  onSkip?: () => void;
  userId: string;
  context: 'check_in' | 'check_out' | 'field_clock_in' | 'field_clock_out' | 'face_registration';
}

// Convert a data-URL to a Blob
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

const AUTO_CAPTURE_HOLD_MS = 2000; // hold face for 2 seconds before auto-capture
const DETECT_INTERVAL_MS   = 400;  // run detection every 400ms

export function SelfieCapture({ onCapture, onCancel, onSkip, userId, context }: SelfieCaptureProps) {
  type Stage = 'idle' | 'uploading';

  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  // face detection state
  const [faceDetected, setFaceDetected] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0); // 0–100
  const [modelsReady, setModelsReady] = useState(false);
  const [statusText, setStatusText] = useState('Position your face in the frame');

  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const detectRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart  = useRef<number | null>(null);
  const capturing  = useRef(false); // prevent double-capture

  const isNative        = Capacitor.isNativePlatform();
  // For face_registration keep manual flow so user can choose their best angle
  const useAutoCapture  = !isNative && context !== 'face_registration';

  // ── Web camera ──────────────────────────────────────────────────────────────

  const stopDetection = useCallback(() => {
    if (detectRef.current) {
      clearInterval(detectRef.current);
      detectRef.current = null;
    }
  }, []);

  const stopWebCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, [stopDetection]);

  // ── Capture helpers ─────────────────────────────────────────────────────────

  const captureFromVideo = useCallback((): { blob: Blob; dataUrl: string } | null => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { blob: dataUrlToBlob(dataUrl), dataUrl };
  }, []);

  const uploadAndConfirm = useCallback(async (blob: Blob, dataUrl: string) => {
    if (capturing.current) return;
    capturing.current = true;
    stopWebCamera();
    setStage('uploading');
    setError(null);
    try {
      const path = `${userId}/${context}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('attendance-selfies')
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from('attendance-selfies')
        .getPublicUrl(path);
      onCapture(urlData.publicUrl, blob, dataUrl);
    } catch (err: any) {
      setError(err.message ?? 'Upload failed. Please try again.');
      setStage('idle');
      capturing.current = false;
      // restart camera
      startWebCamera();
    }
  }, [userId, context, onCapture, stopWebCamera]); // eslint-disable-line

  // ── Face detection loop (web only) ─────────────────────────────────────────

  const startDetectionLoop = useCallback(() => {
    if (detectRef.current) return;
    detectRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || capturing.current) return;

      try {
        const detection = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
        );

        if (detection) {
          setFaceDetected(true);
          if (holdStart.current === null) {
            holdStart.current = Date.now();
          }
          const elapsed = Date.now() - holdStart.current;
          const progress = Math.min(100, (elapsed / AUTO_CAPTURE_HOLD_MS) * 100);
          setHoldProgress(progress);

          const remaining = Math.ceil((AUTO_CAPTURE_HOLD_MS - elapsed) / 1000);
          setStatusText(remaining > 0 ? `Hold still… ${remaining}` : 'Capturing…');

          if (elapsed >= AUTO_CAPTURE_HOLD_MS) {
            stopDetection();
            const captured = captureFromVideo();
            if (captured) {
              await uploadAndConfirm(captured.blob, captured.dataUrl);
            }
          }
        } else {
          setFaceDetected(false);
          holdStart.current = null;
          setHoldProgress(0);
          setStatusText('Position your face in the frame');
        }
      } catch {
        // silent — detection errors are non-fatal
      }
    }, DETECT_INTERVAL_MS);
  }, [stopDetection, captureFromVideo, uploadAndConfirm]);

  const startWebCamera = useCallback(async () => {
    setError(null);
    capturing.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setCameraReady(true);
          if (useAutoCapture && modelsReady) {
            startDetectionLoop();
          }
        };
      }
    } catch (err: any) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera access denied.\n\nTo fix: click the 🔒 lock icon in your browser address bar → find Camera → change to "Allow" → refresh the page.\n\nOr use the Skip button below to check in without a selfie.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device. Use the Skip button to check in without a selfie.'
          : `Camera error: ${err.message}`
      );
    }
  }, [useAutoCapture, modelsReady, startDetectionLoop]);

  // Load face-api models then start camera
  useEffect(() => {
    if (isNative) return;
    let cancelled = false;
    loadModels().then(() => {
      if (!cancelled) {
        setModelsReady(true);
      }
    }).catch(() => {
      if (!cancelled) setModelsReady(true); // still start camera even if models fail
    });
    return () => { cancelled = true; };
  }, [isNative]);

  useEffect(() => {
    if (!isNative && modelsReady) {
      startWebCamera();
    }
    return () => { stopWebCamera(); };
  }, [isNative, modelsReady]); // eslint-disable-line

  // Start detection once camera is ready (handles case where models loaded before camera)
  useEffect(() => {
    if (useAutoCapture && cameraReady && modelsReady && stage === 'idle') {
      startDetectionLoop();
    }
  }, [useAutoCapture, cameraReady, modelsReady, stage, startDetectionLoop]);

  // ── Native capture ──────────────────────────────────────────────────────────

  const captureNative = useCallback(async () => {
    setError(null);
    try {
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        direction: CameraDirection.Front,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        allowEditing: false,
        saveToGallery: false,
      });
      if (!photo.dataUrl) throw new Error('No photo data returned from camera.');
      const blob = dataUrlToBlob(photo.dataUrl);
      await uploadAndConfirm(blob, photo.dataUrl);
    } catch (err: any) {
      if (err.message !== 'User cancelled photos app') {
        setError(err.message ?? 'Failed to take photo.');
      }
    }
  }, [uploadAndConfirm]);

  // Manual capture fallback for web (also used for face_registration)
  const captureWebManual = useCallback(async () => {
    stopDetection();
    const captured = captureFromVideo();
    if (captured) {
      await uploadAndConfirm(captured.blob, captured.dataUrl);
    }
  }, [stopDetection, captureFromVideo, uploadAndConfirm]);

  // ── Ring SVG ─────────────────────────────────────────────────────────────────

  const RING_R   = 126;  // radius (inside the 260px circle border)
  const RING_C   = 2 * Math.PI * RING_R;
  const ringDash = (holdProgress / 100) * RING_C;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal" style={{ maxWidth: 420, width: '95vw', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
            {context === 'face_registration' ? 'Register Your Face' : 'Face Verification'}
          </h3>
          {stage !== 'uploading' && (
            <button className="modal-close" onClick={onCancel} style={{ fontSize: 22, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }} aria-label="Close">
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '24px 20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>

          {error && (
            <div style={{ width: '100%', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 14, whiteSpace: 'pre-line' }}>
              {error}
            </div>
          )}

          {/* ── Uploading spinner ── */}
          {stage === 'uploading' && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#6b7280' }}>
              <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
              <p style={{ margin: 0, fontSize: 14 }}>Verifying &amp; saving…</p>
            </div>
          )}

          {/* ── Web live feed ── */}
          {!isNative && stage === 'idle' && (
            <>
              <div style={{ position: 'relative', width: 264, height: 264, flexShrink: 0 }}>
                {/* Progress ring */}
                <svg
                  width="264" height="264"
                  style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', zIndex: 2, pointerEvents: 'none' }}
                >
                  {/* Track */}
                  <circle cx="132" cy="132" r={RING_R} fill="none" stroke="rgba(99,102,241,0.15)" strokeWidth="5" />
                  {/* Progress */}
                  {holdProgress > 0 && (
                    <circle
                      cx="132" cy="132" r={RING_R}
                      fill="none"
                      stroke={holdProgress >= 100 ? '#22c55e' : '#6366f1'}
                      strokeWidth="5"
                      strokeDasharray={`${ringDash} ${RING_C}`}
                      strokeLinecap="round"
                    />
                  )}
                </svg>

                {/* Video circle */}
                <div style={{
                  position: 'absolute', inset: 4,
                  borderRadius: '50%', overflow: 'hidden',
                  border: `3px solid ${faceDetected ? '#6366f1' : '#d1d5db'}`,
                  background: '#000',
                  transition: 'border-color 0.3s',
                }}>
                  <video
                    ref={videoRef}
                    autoPlay playsInline muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }}
                  />
                  {!cameraReady && !error && (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1f2937', color: '#9ca3af', fontSize: 13 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                        <div>{modelsReady ? 'Starting camera…' : 'Loading…'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hidden canvas */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>

              {/* Status text */}
              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: faceDetected ? '#4f46e5' : '#9ca3af', textAlign: 'center', minHeight: 20, transition: 'color 0.3s' }}>
                {cameraReady ? statusText : ''}
              </p>
            </>
          )}

          {/* ── Native idle prompt ── */}
          {isNative && stage === 'idle' && (
            <div style={{ width: 260, height: 260, borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', border: '3px dashed #6366f1', gap: 12 }}>
              <div style={{ fontSize: 56 }}>📷</div>
              <p style={{ margin: 0, color: '#6b7280', textAlign: 'center', fontSize: 13, padding: '0 24px' }}>Tap below to open camera</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          {stage !== 'uploading' && (
            <button className="btn btn-secondary" onClick={onCancel} style={{ minWidth: 90 }}>
              Cancel
            </button>
          )}

          {/* Skip button — shown when camera access is denied or camera not found */}
          {error && onSkip && (error.includes('denied') || error.includes('No camera') || error.includes('NotAllowed') || error.includes('NotFound')) && (
            <button
              className="btn btn-primary"
              onClick={onSkip}
              style={{ minWidth: 160 }}
            >
              ⏭ Skip & Check In
            </button>
          )}

          {stage === 'idle' && (
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
              {/* Native: single take button */}
              {isNative && (
                <button className="btn btn-primary" onClick={captureNative} style={{ minWidth: 130 }}>
                  📷 Take Photo
                </button>
              )}
              {/* Web: manual fallback button (auto-capture is primary) */}
              {!isNative && cameraReady && useAutoCapture && (
                <button
                  className="btn btn-outline"
                  onClick={captureWebManual}
                  style={{ minWidth: 130, fontSize: 13 }}
                >
                  📷 Capture Now
                </button>
              )}
              {/* face_registration: manual only */}
              {!isNative && !useAutoCapture && (
                <button
                  className="btn btn-primary"
                  onClick={captureWebManual}
                  disabled={!cameraReady}
                  style={{ minWidth: 130 }}
                >
                  {cameraReady ? '📷 Take Photo' : 'Starting camera…'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SelfieCapture;
