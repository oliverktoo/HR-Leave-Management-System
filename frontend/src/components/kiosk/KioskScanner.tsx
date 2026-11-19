import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { supabase } from '../../lib/supabaseClient';

const SPLASH_MS    = 4000;
const ERROR_MS     = 3000;
const SCAN_INTERVAL_MS = 120; // ~8 fps to keep CPU light

interface KioskResult {
  action: 'check_in' | 'check_out';
  name: string;
  time: string;
  photo_url?: string | null;
  department?: string | null;
  status?: 'present' | 'late';
  work_hours?: string;
}

type UIState = 'scanning' | 'loading' | 'success' | 'error';

export function KioskScanner() {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const cooldown  = useRef(false);
  const lastQR    = useRef('');
  const lastScanT = useRef(0);

  const [uiState,     setUiState]     = useState<UIState>('scanning');
  const [result,      setResult]      = useState<KioskResult | null>(null);
  const [errMsg,      setErrMsg]      = useState('');
  const [tick,        setTick]        = useState(new Date());
  const [facingMode,  setFacingMode]  = useState<'environment' | 'user'>('environment');

  // PIN exit state
  const [pinTaps,   setPinTaps]   = useState(0);
  const pinTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPin,   setShowPin]   = useState(false);
  const [pinEntry,  setPinEntry]  = useState('');
  const [pinShake,  setPinShake]  = useState(false);
  const EXIT_PIN = '1234';

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Camera start — re-runs whenever facingMode changes
  useEffect(() => {
    let active = true;
    let stream: MediaStream | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setErrMsg('Camera access denied. Please allow camera permissions and reload.');
        setUiState('error');
      }
    })();

    return () => {
      active = false;
      stream?.getTracks().forEach(t => t.stop());
    };
  }, [facingMode]);

  // QR scan loop
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      if (cooldown.current) return;

      const now = performance.now();
      if (now - lastScanT.current < SCAN_INTERVAL_MS) return;
      lastScanT.current = now;

      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code    = jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });

      if (code?.data && code.data !== lastQR.current) {
        const empId = extractEmpId(code.data);
        if (empId) {
          lastQR.current = code.data;
          cooldown.current = true;
          doScan(empId);
        }
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const extractEmpId = (url: string): string | null => {
    const m = url.match(/\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return m ? m[1] : null;
  };

  const doScan = async (employeeId: string) => {
    setUiState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('kiosk-attendance', {
        body: { employee_id: employeeId },
      });
      if (error || data?.error) {
        showError(data?.error || error?.message || 'Scan failed. Please try again.');
        return;
      }
      setResult(data as KioskResult);
      setUiState('success');
      setTimeout(resetScan, SPLASH_MS);
    } catch {
      showError('Network error. Please try again.');
    }
  };

  const showError = (msg: string) => {
    setErrMsg(msg);
    setUiState('error');
    setTimeout(resetScan, ERROR_MS);
  };

  const resetScan = () => {
    setUiState('scanning');
    setResult(null);
    setErrMsg('');
    cooldown.current = false;
    lastQR.current   = '';
  };

  // Hidden corner tap → show PIN after 5 taps within 2 s
  const handleCornerTap = () => {
    const next = pinTaps + 1;
    setPinTaps(next);
    if (pinTapTimer.current) clearTimeout(pinTapTimer.current);
    if (next >= 5) {
      setShowPin(true);
      setPinTaps(0);
    } else {
      pinTapTimer.current = setTimeout(() => setPinTaps(0), 2000);
    }
  };

  const handlePinDigit = (d: string) => {
    const next = pinEntry + d;
    setPinEntry(next);
    if (next.length === EXIT_PIN.length) {
      if (next === EXIT_PIN) {
        window.location.href = '/login';
      } else {
        setPinShake(true);
        setTimeout(() => { setPinShake(false); setPinEntry(''); }, 700);
      }
    }
  };

  const eatTime     = tick.toLocaleTimeString('en-US', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const eatDateFull = tick.toLocaleDateString('en-US',  { timeZone: 'Africa/Nairobi', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={S.root}>
      <style>{`
        @keyframes scanLine { 0%{top:0} 100%{top:100%} }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
        @keyframes fadeIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
      `}</style>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.orgLabel}>FOOTBALL KENYA FEDERATION</div>
        <div style={S.title}>ATTENDANCE KIOSK</div>
        <div style={S.clock}>{eatTime}</div>
        <div style={S.date}>{eatDateFull}</div>
      </div>

      {/* ── Camera viewport ── */}
      <div style={S.viewport}>
        <video ref={videoRef} style={S.video} muted playsInline />

        {/* Scanning frame corners */}
        {uiState === 'scanning' && (
          <div style={S.frameWrap}>
            <div style={S.frameBox}>
              <div style={{ ...S.corner, top: 0, left: 0,  borderTop: '3px solid #38bdf8', borderLeft:  '3px solid #38bdf8', borderRadius: '4px 0 0 0' }} />
              <div style={{ ...S.corner, top: 0, right: 0, borderTop: '3px solid #38bdf8', borderRight: '3px solid #38bdf8', borderRadius: '0 4px 0 0' }} />
              <div style={{ ...S.corner, bottom: 0, left: 0,  borderBottom: '3px solid #38bdf8', borderLeft:  '3px solid #38bdf8', borderRadius: '0 0 0 4px' }} />
              <div style={{ ...S.corner, bottom: 0, right: 0, borderBottom: '3px solid #38bdf8', borderRight: '3px solid #38bdf8', borderRadius: '0 0 4px 0' }} />
              <div style={S.scanLine} />
            </div>
          </div>
        )}

        {/* Overlays */}
        {uiState === 'loading' && (
          <div style={S.overlay('#0f172acc')}>
            <Spinner />
            <span style={{ color: '#94a3b8', marginTop: 12 }}>Reading card…</span>
          </div>
        )}

        {uiState === 'success' && result && <SuccessOverlay result={result} />}

        {uiState === 'error' && <ErrorOverlay message={errMsg} />}

        {/* Camera flip button */}
        <button
          onClick={() => setFacingMode(m => m === 'environment' ? 'user' : 'environment')}
          style={S.flipBtn}
          title="Flip camera"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
            <path d="M9 2l-1.5 1.5M15 2l1.5 1.5" strokeOpacity="0"/>
            <path d="M7 8H4" strokeOpacity="0"/>
          </svg>
          <span style={{ fontSize: 11, marginTop: 2 }}>{facingMode === 'environment' ? 'Front' : 'Back'}</span>
        </button>
      </div>

      {/* ── Footer hint ── */}
      <div style={S.hint}>
        {uiState === 'scanning'
          ? 'Hold your staff ID card QR code up to the camera'
          : ' '}
      </div>

      {/* ── Hidden exit zone (bottom-right corner) ── */}
      <div onClick={handleCornerTap} style={S.exitZone} />

      {/* ── PIN modal ── */}
      {showPin && (
        <div style={S.pinBackdrop}>
          <div style={{ ...S.pinCard, animation: 'fadeIn 0.2s ease' }}>
            <div style={S.pinTitle}>Enter PIN to Exit Kiosk</div>
            <div style={{ ...S.pinDots, animation: pinShake ? 'shake 0.6s ease' : undefined }}>
              {[0, 1, 2, 3].map(i => (
                <div key={i} style={{
                  ...S.dot,
                  background: pinShake ? '#ef4444' : i < pinEntry.length ? '#38bdf8' : '#334155',
                }} />
              ))}
            </div>
            <div style={S.pinGrid}>
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
                <button
                  key={i}
                  onClick={() => d === '⌫' ? setPinEntry(p => p.slice(0, -1)) : d ? handlePinDigit(d) : undefined}
                  style={{ ...S.pinBtn, opacity: d ? 1 : 0, cursor: d ? 'pointer' : 'default' }}
                >
                  {d}
                </button>
              ))}
            </div>
            <button onClick={() => { setShowPin(false); setPinEntry(''); }} style={S.pinCancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Hidden canvas used only for QR decoding */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SuccessOverlay({ result }: { result: KioskResult }) {
  const isIn = result.action === 'check_in';
  return (
    <div style={{ ...S.overlay(isIn ? 'rgba(5,150,105,0.95)' : 'rgba(234,88,12,0.95)'), flexDirection: 'column', gap: 10, animation: 'fadeIn 0.25s ease' }}>
      <div style={{ fontSize: 52 }}>{isIn ? '✅' : '👋'}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>{isIn ? 'CHECKED IN' : 'CHECKED OUT'}</div>
      {result.photo_url && (
        <img src={result.photo_url} alt="" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.5)', marginTop: 4 }} />
      )}
      <div style={{ fontSize: 22, fontWeight: 600 }}>{result.name}</div>
      {result.department && <div style={{ fontSize: 14, opacity: 0.8 }}>{result.department}</div>}
      <div style={{ fontSize: 20, fontWeight: 600 }}>{result.time}</div>
      {result.status === 'late' && (
        <div style={{ fontSize: 13, background: 'rgba(0,0,0,0.25)', padding: '4px 14px', borderRadius: 20 }}>Late Arrival</div>
      )}
      {result.work_hours && (
        <div style={{ fontSize: 15, opacity: 0.9 }}>Work Hours: {result.work_hours}</div>
      )}
    </div>
  );
}

function ErrorOverlay({ message }: { message: string }) {
  return (
    <div style={{ ...S.overlay('rgba(185,28,28,0.92)'), flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s ease' }}>
      <div style={{ fontSize: 48 }}>❌</div>
      <div style={{ fontSize: 18, fontWeight: 600, textAlign: 'center', padding: '0 28px', lineHeight: 1.4 }}>{message}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 40, height: 40, border: '3px solid #334155', borderTopColor: '#38bdf8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Styles (static object avoids re-creation on each render) ────────────────

const S = {
  root: {
    position:  'fixed' as const,
    inset:     0,
    background: '#0f172a',
    color:     '#fff',
    display:   'flex',
    flexDirection: 'column' as const,
    alignItems:    'center',
    fontFamily:    'system-ui, -apple-system, sans-serif',
    overflow:      'hidden',
    userSelect:    'none' as const,
    WebkitUserSelect: 'none' as const,
  },
  header: {
    padding:   '20px 24px 12px',
    textAlign: 'center' as const,
    zIndex:    10,
    flexShrink: 0,
  },
  orgLabel: { fontSize: 12, letterSpacing: 3, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' as const },
  title:    { fontSize: 20, fontWeight: 700, marginTop: 4, letterSpacing: 1 },
  clock:    { fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const, color: '#38bdf8', marginTop: 8 },
  date:     { fontSize: 13, color: '#64748b', marginTop: 2 },

  viewport: {
    flex:     1,
    width:    '100%',
    maxWidth: 700,
    position: 'relative' as const,
    overflow: 'hidden',
    borderRadius: 16,
    background: '#000',
    flexShrink: 1,
  },
  video: {
    width:      '100%',
    height:     '100%',
    objectFit:  'cover' as const,
    display:    'block',
  },
  frameWrap: {
    position:  'absolute' as const,
    inset:     0,
    display:   'flex',
    alignItems:    'center',
    justifyContent: 'center',
    pointerEvents:  'none' as const,
  },
  frameBox: {
    position: 'relative' as const,
    width:    240,
    height:   240,
  },
  corner: {
    position: 'absolute' as const,
    width:    32,
    height:   32,
  },
  scanLine: {
    position:   'absolute' as const,
    left:       0,
    right:      0,
    height:     2,
    background: 'linear-gradient(90deg, transparent, #38bdf8, transparent)',
    animation:  'scanLine 2s linear infinite',
  },

  overlay: (bg: string) => ({
    position:  'absolute' as const,
    inset:     0,
    background: bg,
    display:   'flex',
    alignItems:    'center',
    justifyContent: 'center',
    color:     '#fff',
    flexDirection: 'column' as const,
  }),

  hint: {
    padding:   '14px 0 20px',
    color:     '#64748b',
    fontSize:  14,
    textAlign: 'center' as const,
    flexShrink: 0,
  },

  flipBtn: {
    position:     'absolute' as const,
    top:          12,
    right:        12,
    background:   'rgba(0,0,0,0.45)',
    border:       '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10,
    color:        '#e2e8f0',
    padding:      '8px 12px',
    display:      'flex',
    flexDirection:'column' as const,
    alignItems:   'center',
    gap:          2,
    cursor:       'pointer',
    zIndex:       20,
    backdropFilter: 'blur(4px)',
  },

  exitZone: {
    position: 'fixed' as const,
    bottom:   0,
    right:    0,
    width:    72,
    height:   72,
    zIndex:   50,
    cursor:   'default',
  },

  pinBackdrop: {
    position:  'fixed' as const,
    inset:     0,
    background: 'rgba(0,0,0,0.85)',
    display:   'flex',
    alignItems:    'center',
    justifyContent: 'center',
    zIndex:    200,
  },
  pinCard: {
    background:   '#1e293b',
    borderRadius: 20,
    padding:      '36px 28px 24px',
    width:        280,
    textAlign:    'center' as const,
    boxShadow:    '0 25px 60px rgba(0,0,0,0.5)',
  },
  pinTitle: { fontSize: 16, fontWeight: 600, marginBottom: 28, color: '#e2e8f0' },
  pinDots:  { display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 28 },
  dot:      { width: 16, height: 16, borderRadius: '50%', transition: 'background 0.15s' },
  pinGrid:  { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 },
  pinBtn:   {
    padding:      '15px 0',
    fontSize:     22,
    fontWeight:   500,
    background:   '#334155',
    border:       'none',
    borderRadius: 10,
    color:        '#fff',
    cursor:       'pointer',
    transition:   'background 0.1s',
  },
  pinCancel: {
    color:      '#64748b',
    background: 'none',
    border:     'none',
    fontSize:   14,
    cursor:     'pointer',
    padding:    '8px 20px',
  },
};
