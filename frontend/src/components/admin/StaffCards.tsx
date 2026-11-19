import { useState, useEffect, useRef, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { jsPDF } from 'jspdf';
import { supabase } from '../../lib/supabaseClient';
import { AdminSidebar } from './AdminSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  role: string;
  department_id: string | null;
  departments: { name: string } | null;
  profile_photo_url?: string | null;
  is_active: boolean;
  blood_type?: string | null;
  job_title?: string | null;
  emergency_contact?: string | null;
  emergency_phone?: string | null;
}

const APP_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://hr.footballkenya.org';

// ATM card: 85.6 × 53.98 mm  →  at 96 dpi ≈ 323 × 204 px
const CARD_W_PX  = 323;
const CARD_H_PX  = 204;
const STRIP_H    = 48;  // top & bottom strip height
// MID_H removed — computed dynamically as effMidH (supports variable strip heights)
// PHOTO_SIZE removed — computed dynamically as effPhotoSz (supports variable strip heights)
const PHOTO_CX   = 80;         // circle centre-x in left half
// INFO_X removed — computed dynamically as effInfoX (supports variable strip heights)

// Card format definitions — actual print size selected via card_format setting in CardSettings
const CARD_FORMATS: { key: string; label: string; w_mm: number; h_mm: number; desc: string }[] = [
  { key: 'CR80',  label: 'CR80',  w_mm: 85.6, h_mm: 53.98, desc: 'Standard credit/ATM card (ISO 7810 ID-1)' },
  { key: 'CR90',  label: 'CR90',  w_mm: 90,   h_mm: 57,    desc: 'Slightly larger — common for visitor badges' },
  { key: 'CR100', label: 'CR100', w_mm: 98,   h_mm: 67,    desc: 'Large staff/access badge format' },
  { key: 'A8',    label: 'A8',    w_mm: 105,  h_mm: 74,    desc: 'A8 paper size — 8× per A4 sheet' },
];

type AccessLevel = 'all-areas' | 'general' | 'restricted' | 'visitor';

const ACCESS_CONFIG: Record<AccessLevel, { label: string; color: string; stripe: string }> = {
  'all-areas':  { label: 'ALL AREAS',  color: '#dc2626', stripe: '#fee2e2' },
  'general':    { label: 'GENERAL',    color: '#2563eb', stripe: '#dbeafe' },
  'restricted': { label: 'RESTRICTED', color: '#d97706', stripe: '#fef3c7' },
  'visitor':    { label: 'VISITOR',    color: '#6b7280', stripe: '#f3f4f6' },
};

const ACCESS_LEVELS: AccessLevel[] = ['all-areas', 'general', 'restricted', 'visitor'];

// ── Font options ───────────────────────────────────────────────────────────────

const FONT_OPTIONS: { label: string; value: string; googleFont: string | null }[] = [
  { label: 'Segoe UI (Default)', value: "'Segoe UI', Arial, sans-serif",          googleFont: null },
  { label: 'Roboto',             value: "'Roboto', Arial, sans-serif",             googleFont: 'Roboto:wght@400;600;700;800' },
  { label: 'Montserrat',         value: "'Montserrat', Arial, sans-serif",         googleFont: 'Montserrat:wght@400;600;700;800' },
  { label: 'Lato',               value: "'Lato', Arial, sans-serif",               googleFont: 'Lato:wght@400;700;900' },
  { label: 'Poppins',            value: "'Poppins', Arial, sans-serif",            googleFont: 'Poppins:wght@400;600;700;800' },
  { label: 'Raleway',            value: "'Raleway', Arial, sans-serif",            googleFont: 'Raleway:wght@400;600;700;800' },
  { label: 'Playfair Display',   value: "'Playfair Display', Georgia, serif",      googleFont: 'Playfair+Display:wght@400;700;800' },
  { label: 'Source Sans 3',      value: "'Source Sans 3', Arial, sans-serif",      googleFont: 'Source+Sans+3:wght@400;600;700;800' },
];

const FONT_SIZE_OPTIONS = [
  { label: 'S',  value: 0.85, title: 'Small' },
  { label: 'M',  value: 1.0,  title: 'Medium (default)' },
  { label: 'L',  value: 1.15, title: 'Large' },
  { label: 'XL', value: 1.3,  title: 'Extra Large' },
];

const WEIGHT_OPTIONS = [
  { label: 'Reg',   value: 400, title: 'Regular' },
  { label: 'Semi',  value: 600, title: 'Semi Bold' },
  { label: 'Bold',  value: 700, title: 'Bold' },
  { label: 'X-Bold',value: 800, title: 'Extra Bold' },
];

const TEXT_STYLE_ELEMENTS: [string, 'name_weight' | 'title_weight' | 'dept_weight' | 'id_weight', number][] = [
  ['Employee Name', 'name_weight',  800],
  ['Job Title',     'title_weight', 700],
  ['Dept / Email',  'dept_weight',  400],
  ['Employee ID',   'id_weight',    700],
];

const ROLE_ACCESS: Record<string, AccessLevel> = {
  super_admin:   'all-areas',
  hr_admin:      'all-areas',
  ceo:           'all-areas',
  finance:       'restricted',
  hod:           'general',
  fleet_manager: 'general',
  driver:        'general',
  auditor:       'restricted',
  employee:      'general',
};

const ROLE_TITLE: Record<string, string> = {
  super_admin:   'System Administrator',
  hr_admin:      'HR Administrator',
  ceo:           'Chief Executive Officer',
  finance:       'Finance Officer',
  hod:           'Head of Department',
  fleet_manager: 'Fleet Manager',
  driver:        'Driver',
  auditor:       'Auditor',
  employee:      'Staff',
};

interface CardOverride {
  is_valid?: boolean;
  access_level?: AccessLevel;
  card_generation?: number; // starts at 1, increments each time a replacement is issued
  issue_date?: string;   // ISO date string, e.g. "2024-01-15"; defaults to today
  expiry_date?: string;  // ISO date string; overrides validity_years calculation
}

interface CardSettings {
  org_name: string;
  org_abbreviation: string;
  accent_color: string;
  back_color: string;
  validity_years: number;
  website: string;
  emergency_number: string;
  contact_email?: string;        // email shown on back card (default: info@footballkenya.org)
  logo_url?: string;
  hq_address?: string;
  // Front font colour overrides
  name_color?: string;    // employee name  (default #0f172a)
  title_color?: string;   // job title      (default = accent_color)
  dept_color?: string;    // dept / email   (default #64748b)
  id_color?: string;      // employee ID    (default #0f172a)
  // Back card colour overrides
  back_text_color?: string;      // primary text on back, e.g. name   (default #f1f5f9)
  back_secondary_color?: string; // secondary / muted text on back    (default #94a3b8)
  // Back card text content
  property_notice?: string;      // "Property of …" text on back card and verify page
  property_notice_color?: string;   // property notice text color (default #64748b)
  property_notice_size?: number;    // property notice font size in card units (default 4.5)
  property_notice_weight?: number;  // property notice font weight (default 400)
  property_notice_italic?: boolean; // property notice italic (default false)
  show_access_badge?: boolean;   // show/hide the coloured access badge + stripe (default true)
  // Title strip / header controls
  card_subtitle?: string;        // text below org name (default: 'OFFICIAL IDENTIFICATION CARD'); '' = hidden
  strip_height?: number;         // top/bottom strip height in card units 32–68 (default: 48)
  logo_position?: 'left' | 'right' | 'hidden'; // logo placement in strip (default: 'left')
  title_font_size?: number;      // org abbreviation font size override (default: 11)
  org_name_font_size?: number;   // org full name font size override (default: 5.5)
  org_name_weight?: number;      // org full name font weight (default: 400)
  org_name_italic?: boolean;     // org full name italic (default: false)
  font_family?: string;          // CSS font-family stack for card text (default: Segoe UI)
  card_format?: string;          // 'CR80' | 'CR90' | 'CR100' | 'A8' (default: 'CR80')
  logo_size?: number;            // logo height in card px (default: 30)
  font_size_scale?: number;      // multiplier applied to all text sizes (default: 1.0)
  signature_url?: string;        // global authorizer signature image (PNG transparent bg recommended)
  signature_size?: number;       // signature image height in card units (default: 18)
  // Per-element font weight (400 = regular, 600 = semi, 700 = bold, 800 = x-bold)
  name_weight?: number;          // employee name   (default 800)
  title_weight?: number;         // job title       (default 700)
  dept_weight?: number;          // dept / email    (default 400)
  id_weight?: number;            // employee ID value (default 700)
  card_overrides?: Record<string, CardOverride>; // keyed by employee_id
}

// ── Barcode (real Code 128 via JsBarcode) ─────────────────────────────────────

function buildBarcodeDataUrl(text: string): string {
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, text, {
      format: 'CODE128',
      width: 1.4,
      height: 32,
      displayValue: false,
      margin: 0,
      background: 'transparent',
      lineColor: '#1e293b',
    });
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

// ── QR helper ────────────────────────────────────────────────────────────────

async function buildQRDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    color: { dark: '#1e293b', light: '#ffffff' },
    width: 180,
  });
}

// ── Validity date ─────────────────────────────────────────────────────────────

function validUntil(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
}

function fmtDateLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
}

function getIssuedLabel(emp: Employee, overrides?: Record<string, CardOverride>): string {
  const iso = overrides?.[emp.employee_id]?.issue_date;
  return iso ? fmtDateLabel(iso) : new Date().toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
}

function getExpiryLabel(emp: Employee, settings: CardSettings): string {
  const iso = settings.card_overrides?.[emp.employee_id]?.expiry_date;
  return iso ? fmtDateLabel(iso) : validUntil(settings.validity_years);
}

// ── Image loader — fetch as blob first to avoid canvas CORS taint ─────────────

function loadImage(src: string): Promise<HTMLImageElement | null> {
  // If it's already a data URL or blob URL, load directly
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  // Otherwise fetch as blob → data URL so canvas never sees a cross-origin image
  return fetch(src)
    .then(r => r.ok ? r.blob() : Promise.reject())
    .then(blob => new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(blob);
    }))
    .then(dataUrl => new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image();
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    }))
    .catch(() => null);
}

// ── Font helpers ──────────────────────────────────────────────────────────────

function extractFirstFont(fontFamily?: string): string {
  if (!fontFamily) return 'Segoe UI';
  return fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Segoe UI';
}

// Word-wraps text into lines that fit within maxW pixels. Respects \n breaks.
function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push(''); continue; }
    const words = para.split(' ');
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

async function ensureFontLoaded(fontFamily?: string): Promise<void> {
  if (!fontFamily) return;
  const opt = FONT_OPTIONS.find(f => f.value === fontFamily);
  if (!opt?.googleFont) return;
  const id = `gf-${opt.googleFont.replace(/[^a-zA-Z0-9]/g, '-')}`;
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id   = id;
    link.rel  = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${opt.googleFont}&display=swap`;
    document.head.appendChild(link);
    await new Promise<void>(resolve => { link.onload = () => resolve(); setTimeout(resolve, 2000); });
  }
  const name = extractFirstFont(fontFamily);
  try {
    await Promise.all([
      document.fonts.load(`800 12px "${name}"`),
      document.fonts.load(`700 12px "${name}"`),
      document.fonts.load(`400 12px "${name}"`),
    ]);
  } catch { /* best-effort */ }
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fill();
}

// Top-only rounded corners
function fillRoundRectTop(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.fill();
}

// Bottom-only rounded corners
function fillRoundRectBottom(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

// ── React card components (preview only) ──────────────────────────────────────

function getAccessLevel(emp: Employee, overrides?: Record<string, CardOverride>): AccessLevel {
  return overrides?.[emp.employee_id]?.access_level
    ?? ROLE_ACCESS[emp.role]
    ?? 'general';
}

function isCardValid(emp: Employee, overrides?: Record<string, CardOverride>): boolean {
  return overrides?.[emp.employee_id]?.is_valid !== false; // default true
}

function getCardGeneration(emp: Employee, overrides?: Record<string, CardOverride>): number {
  return overrides?.[emp.employee_id]?.card_generation ?? 1;
}

// QR map is keyed by "empId-vN" so a new generation busts the cache automatically
function qrCacheKey(emp: Employee, overrides?: Record<string, CardOverride>): string {
  return `${emp.id}-v${getCardGeneration(emp, overrides)}`;
}

function buildVerifyUrl(emp: Employee, generation: number): string {
  return `${APP_URL}/verify/${emp.employee_id}?v=${generation}`;
}

interface CardProps {
  emp: Employee;
  settings: CardSettings;
  qrDataUrl?: string;
  scale?: number;
}

function StaffCardFront({ emp, settings, scale = 1 }: CardProps) {
  const s  = (n: number) => n * scale;
  const fsc = settings.font_size_scale || 1;
  const fs = (n: number) => n * scale * fsc;
  const nameWeight  = settings.name_weight  ?? 800;
  const titleWeight = settings.title_weight ?? 700;
  const deptWeight  = settings.dept_weight  ?? 400;
  const idWeight    = settings.id_weight    ?? 700;
  const access    = getAccessLevel(emp, settings.card_overrides);
  const cfg       = ACCESS_CONFIG[access];
  const showAccess = settings.show_access_badge !== false;
  const accent    = settings.accent_color;
  const valid     = isCardValid(emp, settings.card_overrides);
  const nameCol   = settings.name_color  || '#0f172a';
  const titleCol  = settings.title_color || accent;
  const deptCol   = settings.dept_color  || '#64748b';
  const idCol     = settings.id_color    || '#0f172a';
  const jobTitle  = emp.job_title || ROLE_TITLE[emp.role] || 'Staff';
  const deptName  = emp.departments?.name ?? '';
  const issued    = getIssuedLabel(emp, settings.card_overrides);
  const expiry    = getExpiryLabel(emp, settings);

  const effStrip   = settings.strip_height ?? STRIP_H;
  const effMidH    = CARD_H_PX - effStrip * 2;
  const effPhotoSz = Math.max(effMidH - 8, 20);
  const effInfoX   = PHOTO_CX + effPhotoSz / 2 + 10;
  const logoPos    = settings.logo_position ?? 'left';
  const logoSz     = settings.logo_size ?? 30;
  const titleFsz   = settings.title_font_size ?? 11;
  const orgNameFsz    = settings.org_name_font_size ?? 5.5;
  const orgNameWeight = settings.org_name_weight ?? 400;
  const orgNameItalic = settings.org_name_italic ?? false;
  const subtitle   = settings.card_subtitle !== undefined ? settings.card_subtitle : 'OFFICIAL IDENTIFICATION CARD';
  const W          = CARD_W_PX * scale;
  const H          = CARD_H_PX * scale;
  const stripH     = effStrip * scale;
  const midH       = effMidH * scale;
  const barDataUrl = buildBarcodeDataUrl(emp.employee_id);

  return (
    <div style={{
      width: W, height: H, borderRadius: s(10), overflow: 'hidden',
      position: 'relative', background: '#fff',
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      fontFamily: settings.font_family || "'Segoe UI', Arial, sans-serif",
      flexShrink: 0,
    }}>

      {/* ── TOP STRIP ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: stripH,
        background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
        display: 'flex', alignItems: 'center', padding: `0 ${s(10)}px`,
        gap: s(7),
      }}>
        {/* Logo */}
        {settings.logo_url && logoPos !== 'hidden' && (
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: s(5),
            padding: `${s(2)}px ${s(4)}px`, flexShrink: 0,
            backdropFilter: 'blur(2px)',
            order: logoPos === 'right' ? 2 : 0,
          }}>
            <img src={settings.logo_url} alt="logo"
              style={{ height: s(logoSz), width: 'auto', objectFit: 'contain', display: 'block' }}
              onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }} />
          </div>
        )}
        {/* Org names */}
        <div style={{ flex: 1, minWidth: 0, order: 1 }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: fs(titleFsz), letterSpacing: s(1), lineHeight: 1 }}>
            {settings.org_abbreviation}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.78)', fontSize: fs(orgNameFsz), fontWeight: orgNameWeight, fontStyle: orgNameItalic ? 'italic' : 'normal', letterSpacing: s(0.4) }}>
            {settings.org_name.toUpperCase()}
          </div>
          {subtitle && (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: fs(5), marginTop: s(1) }}>
              {subtitle}
            </div>
          )}
        </div>
        {/* Access badge */}
        {showAccess && (
          <div style={{
            background: cfg.color, borderRadius: s(3),
            padding: `${s(2)}px ${s(5)}px`,
            fontSize: fs(6), fontWeight: 700, color: '#fff', letterSpacing: s(0.5),
            flexShrink: 0, order: 3,
          }}>
            {cfg.label}
          </div>
        )}
      </div>

      {/* ── MIDDLE ZONE ── */}
      <div style={{
        position: 'absolute', top: stripH, left: 0, width: W, height: midH,
        overflow: 'hidden',
      }}>
        {/* Logo watermark — right half of middle zone */}
        {settings.logo_url && (
          <img src={settings.logo_url} alt=""
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',           // starts at centre = right half begins
              transform: 'translateY(-50%)',
              height: midH * 0.82, width: 'auto', objectFit: 'contain',
              maxWidth: W / 2 - s(12),
              opacity: 0.07, pointerEvents: 'none',
              filter: 'grayscale(1)',
            }} />
        )}

        {/* PHOTO — circular, centred in left half */}
        <div style={{
          position: 'absolute',
          top: s(4),
          left: s(PHOTO_CX - effPhotoSz / 2),
          width: s(effPhotoSz), height: s(effPhotoSz),
          borderRadius: '50%', overflow: 'hidden',
          border: `${s(2)}px solid ${accent}`,
          background: '#e2e8f0',
          boxShadow: `0 0 0 ${s(3)}px ${accent}22`,
        }}>
          {emp.profile_photo_url ? (
            <img src={emp.profile_photo_url} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${accent}22, ${accent}44)`,
              fontSize: fs(effPhotoSz * 0.28), fontWeight: 800, color: accent,
            }}>
              {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
            </div>
          )}
        </div>

        {/* INFO — right side of middle zone */}
        <div style={{
          position: 'absolute',
          top: s(10), left: s(effInfoX), right: s(8),
          display: 'flex', flexDirection: 'column', gap: s(3),
          overflow: 'hidden',
        }}>
          {/* Name */}
          <div style={{ fontSize: fs(9.5), fontWeight: nameWeight, color: nameCol, lineHeight: 1.15 }}>
            {emp.first_name} {emp.last_name}
          </div>
          <div style={{ fontSize: fs(6.5), color: titleCol, fontWeight: titleWeight, lineHeight: 1 }}>
            {jobTitle}
          </div>
          {deptName && (
            <div style={{ fontSize: fs(5.5), color: deptCol, fontWeight: deptWeight, lineHeight: 1 }}>
              {deptName}
            </div>
          )}

          {/* Divider */}
          <div style={{ height: s(1), background: '#e2e8f0' }} />

          {/* Employee ID badge */}
          <div style={{
            background: '#f8fafc', borderRadius: s(3),
            padding: `${s(2)}px ${s(4)}px`,
            border: `${s(0.5)}px solid #e2e8f0`,
          }}>
            <div style={{ fontSize: fs(4.5), color: '#94a3b8', letterSpacing: s(0.5) }}>EMPLOYEE ID</div>
            <div style={{ fontSize: fs(8), fontWeight: idWeight, color: idCol, letterSpacing: s(0.8), fontFamily: 'monospace' }}>
              {emp.employee_id}
            </div>
          </div>

          {/* Email */}
          {emp.email && (
            <div style={{
              fontSize: fs(5), color: deptCol, fontWeight: deptWeight,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {emp.email}
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM STRIP ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: stripH,
        background: '#f1f5f9', borderTop: `${s(1)}px solid #e2e8f0`,
        display: 'flex', alignItems: 'center', padding: `0 ${s(10)}px`,
        gap: s(8),
      }}>
        {/* Barcode — encodes employee_id, no text */}
        {barDataUrl && (
          <img src={barDataUrl} alt="barcode"
            style={{ height: s(30), width: 'auto', maxWidth: s(120), imageRendering: 'crisp-edges' }} />
        )}

        <div style={{ width: s(1), height: s(30), background: '#e2e8f0', flexShrink: 0 }} />

        {/* Issued / Valid */}
        <div style={{ flex: 1, display: 'flex', gap: s(10) }}>
          <div>
            <div style={{ fontSize: fs(5), color: '#94a3b8', letterSpacing: s(0.3) }}>ISSUED</div>
            <div style={{ fontSize: fs(7), fontWeight: 600, color: '#475569' }}>{issued}</div>
          </div>
          <div>
            <div style={{ fontSize: fs(5), color: '#94a3b8', letterSpacing: s(0.3) }}>VALID UNTIL</div>
            <div style={{ fontSize: fs(7), fontWeight: 700, color: valid ? cfg.color : '#dc2626' }}>
              {valid ? expiry : 'VOID'}
            </div>
          </div>
        </div>

        {/* Website */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: s(1) }}>
          <div style={{ fontSize: fs(5), color: '#94a3b8' }}>{settings.website}</div>
        </div>

        {/* Access colour stripe */}
        {showAccess && (
          <div style={{
            width: s(7), height: s(34), borderRadius: s(3), flexShrink: 0,
            background: valid
              ? `linear-gradient(180deg, ${cfg.color}, ${cfg.stripe})`
              : 'repeating-linear-gradient(45deg, #dc2626, #dc2626 4px, #fee2e2 4px, #fee2e2 8px)',
          }} />
        )}
      </div>

      {/* VOID watermark overlay */}
      {!valid && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: fs(52), fontWeight: 900, color: 'rgba(220,38,38,0.18)',
            transform: 'rotate(-30deg)', letterSpacing: s(6),
            textTransform: 'uppercase',
          }}>VOID</div>
        </div>
      )}
    </div>
  );
}

function StaffCardBack({ emp, settings, qrDataUrl = '' }: CardProps) {
  const access = getAccessLevel(emp, settings.card_overrides);
  const cfg    = ACCESS_CONFIG[access];
  const showAccess = settings.show_access_badge !== false;
  const accent    = settings.accent_color;
  const backBg    = settings.back_color          || '#0f172a';
  const backText  = settings.back_text_color     || '#f1f5f9';
  const backSecnd = settings.back_secondary_color || '#94a3b8';
  const fsc = settings.font_size_scale || 1;
  const fs  = (n: number) => n * fsc;
  const W = CARD_W_PX;
  const H = CARD_H_PX;

  return (
    <div style={{
      width: W, height: H, borderRadius: 10, overflow: 'hidden',
      position: 'relative', background: backBg,
      boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      fontFamily: settings.font_family || "'Segoe UI', Arial, sans-serif",
      flexShrink: 0,
    }}>
      {/* Background gradient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(circle at 15% 50%, ${accent}28 0%, transparent 55%),
                          radial-gradient(circle at 85% 20%, ${cfg.color}20 0%, transparent 45%)`,
      }} />

      {/* Top accent stripe */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, display: 'flex' }}>
        <div style={{ flex: 1, background: accent }} />
        <div style={{ flex: 1, background: cfg.color }} />
      </div>

      {/* QR code — left panel */}
      <div style={{
        position: 'absolute', left: 14, top: 0, bottom: 0,
        width: 90,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 6,
      }}>
        <div style={{
          background: '#fff', borderRadius: 6, padding: 4,
          boxShadow: `0 0 0 2px ${accent}55`,
          position: 'relative',
        }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR" style={{ width: 70, height: 70, display: 'block' }} />
          ) : (
            <div style={{ width: 70, height: 70, background: '#f1f5f9', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: fs(9), color: '#64748b', textAlign: 'center', padding: 4 }}>
              QR Code
            </div>
          )}
          {/* Employee photo — center overlay on QR */}
          {emp.profile_photo_url && qrDataUrl && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 18, height: 18, borderRadius: '50%',
              overflow: 'hidden', flexShrink: 0,
              border: '2px solid #fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.12)',
              background: '#e2e8f0',
            }}>
              <img src={emp.profile_photo_url} alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          )}
        </div>
        <div style={{ fontSize: fs(5), color: backSecnd, textAlign: 'center', letterSpacing: 0.3 }}>
          SCAN TO VERIFY
        </div>
        {settings.signature_url && (
          <>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.15)', width: '85%' }} />
            <img src={settings.signature_url} alt="signature"
              style={{ height: settings.signature_size ?? 18, maxWidth: 82, objectFit: 'contain' }} />
            <div style={{ fontSize: fs(4), color: backSecnd, letterSpacing: 0.4, textAlign: 'center', lineHeight: 1.3 }}>
              AUTHORIZED<br />SIGNATURE
            </div>
          </>
        )}
      </div>

      {/* Divider */}
      <div style={{
        position: 'absolute', left: 108, top: 16, bottom: 16, width: 1,
        background: `linear-gradient(180deg, transparent, ${accent}77, transparent)`,
      }} />

      {/* Right panel */}
      <div style={{
        position: 'absolute', left: 116, top: 14, right: 12,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        {/* Access badge */}
        {showAccess && (
          <div style={{
            display: 'inline-block',
            background: cfg.color, borderRadius: 3,
            padding: '2px 7px',
            fontSize: fs(6), fontWeight: 700, color: '#fff', letterSpacing: 0.5,
            alignSelf: 'flex-start',
          }}>
            {cfg.label} ACCESS
          </div>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />

        <InfoRowBack icon="🌐" label="VERIFY ONLINE" value={settings.website} labelColor={backSecnd} valueColor={backText} fontScale={fsc} />
        <InfoRowBack icon="🏢" label="REPORT TO" value={settings.hq_address || 'FKF HQ, Kandanda House, Nairobi'} labelColor={backSecnd} valueColor={backText} fontScale={fsc} />
        <InfoRowBack icon="📞" label="EMERGENCY LINE" value={settings.emergency_number} labelColor={backSecnd} valueColor={backText} fontScale={fsc} />
        <InfoRowBack icon="✉" label="EMAIL" value={settings.contact_email || 'info@footballkenya.org'} labelColor={backSecnd} valueColor={backText} fontScale={fsc} />

        {/* Property notice */}
        <div style={{
          marginTop: 4,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 4, padding: '4px 6px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{
            fontSize: fs(settings.property_notice_size ?? 4.5),
            color: settings.property_notice_color || '#64748b',
            fontWeight: settings.property_notice_weight ?? 400,
            fontStyle: settings.property_notice_italic ? 'italic' : 'normal',
            lineHeight: 1.5,
          }}>
            {settings.property_notice || `Property of ${settings.org_name}. If found, return to FKF HQ.`}
          </div>
        </div>

        {/* Magnetic stripe graphic */}
        <div style={{
          height: 6, marginTop: 2,
          background: 'linear-gradient(90deg, #1e293b, #334155, #1e293b)',
          borderRadius: 2, opacity: 0.7,
        }} />
        <div style={{ fontSize: fs(4.5), color: '#334155', textAlign: 'right' }}>
          NOT TRANSFERABLE · {settings.org_abbreviation}
        </div>
      </div>
    </div>
  );
}

function InfoRowBack({ icon, label, value, labelColor, valueColor, fontScale = 1 }: {
  icon: string; label: string; value: string;
  labelColor?: string; valueColor?: string; fontScale?: number;
}) {
  const fs = (n: number) => n * fontScale;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
      <span style={{ fontSize: fs(8), lineHeight: 1, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: fs(4.5), color: labelColor || '#475569', letterSpacing: 0.3 }}>{label}</div>
        <div style={{ fontSize: fs(6.5), fontWeight: 600, color: valueColor || '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  );
}

// ── Canvas PDF renderer ───────────────────────────────────────────────────────

async function renderFrontToCanvas(
  emp: Employee,
  cfg: CardSettings,
  scale: number
): Promise<HTMLCanvasElement> {
  await ensureFontLoaded(cfg.font_family);
  const W = Math.round(CARD_W_PX * scale);
  const H = Math.round(CARD_H_PX * scale);
  const s = (n: number) => Math.round(n * scale);
  const cfont = extractFirstFont(cfg.font_family);
  const fsc   = cfg.font_size_scale || 1;
  const fs    = (n: number) => Math.round(n * scale * fsc);
  const effStrip   = cfg.strip_height ?? STRIP_H;
  const effMidH    = CARD_H_PX - effStrip * 2;
  const effPhotoSz = Math.max(effMidH - 8, 20);
  const effInfoX   = PHOTO_CX + effPhotoSz / 2 + 10;
  const logoPos    = cfg.logo_position ?? 'left';
  const logoSz     = cfg.logo_size ?? 30;
  const titleFsz   = cfg.title_font_size ?? 11;
  const orgNameFsz    = cfg.org_name_font_size ?? 5.5;
  const orgNameWeight = cfg.org_name_weight ?? 400;
  const orgNameItalic = cfg.org_name_italic ?? false;
  const subtitle   = cfg.card_subtitle !== undefined ? cfg.card_subtitle : 'OFFICIAL IDENTIFICATION CARD';
  const sy = (n: number) => Math.round(s(n) * effStrip / STRIP_H);

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const accent      = cfg.accent_color;
  const access      = getAccessLevel(emp, cfg.card_overrides);
  const acfg        = ACCESS_CONFIG[access];
  const valid       = isCardValid(emp, cfg.card_overrides);
  const showAccess  = cfg.show_access_badge !== false;
  const nameCol     = cfg.name_color  || '#0f172a';
  const titleCol = cfg.title_color || accent;
  const deptCol  = cfg.dept_color  || '#64748b';
  const idCol    = cfg.id_color    || '#0f172a';
  const nameWeight  = cfg.name_weight  ?? 800;
  const titleWeight = cfg.title_weight ?? 700;
  const deptWeight  = cfg.dept_weight  ?? 400;
  const idWeight    = cfg.id_weight    ?? 700;

  // Pre-load images in parallel
  const [logoImg, photoImg, barcodeImg] = await Promise.all([
    cfg.logo_url ? loadImage(cfg.logo_url) : Promise.resolve(null),
    emp.profile_photo_url ? loadImage(emp.profile_photo_url) : Promise.resolve(null),
    (async () => {
      const url = buildBarcodeDataUrl(emp.employee_id);
      return url ? loadImage(url) : null;
    })(),
  ]);

  // ── White card background ──
  ctx.fillStyle = '#ffffff';
  fillRoundRect(ctx, 0, 0, W, H, s(10));

  // ── TOP STRIP ──
  const grad = ctx.createLinearGradient(0, 0, W * 0.7, s(effStrip));
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent + 'dd');
  ctx.fillStyle = grad;
  fillRoundRectTop(ctx, 0, 0, W, s(effStrip), s(10));

  // Compute logo + text x positions based on logo_position
  const showLogoInStrip = !!logoImg && logoPos !== 'hidden';
  let txtX = s(10); // default: text starts at left margin
  if (showLogoInStrip && logoPos === 'right') {
    // Text on left, logo drawn later on right
    txtX = s(10);
  } else if (showLogoInStrip) {
    // Logo on left: draw pill + logo, then advance txtX
    const lh = s(logoSz);
    const srcW = logoImg!.naturalWidth  || logoImg!.width  || 200;
    const srcH = logoImg!.naturalHeight || logoImg!.height || 200;
    const lw   = Math.round(srcW * (lh / srcH));
    const padX = s(4), padY = sy(3);
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, s(8), sy(8), lw + padX * 2, lh + padY * 2, s(5));
    ctx.globalAlpha = 1; ctx.restore();
    ctx.drawImage(logoImg!, s(8) + padX, sy(8) + padY, lw, lh);
    txtX = s(8) + padX * 2 + lw + s(6);
  }

  // Org text
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${fs(titleFsz)}px "${cfont}", Arial`;
  ctx.fillText(cfg.org_abbreviation, txtX, sy(24));
  ctx.font = `${orgNameItalic ? 'italic ' : ''}${orgNameWeight} ${fs(orgNameFsz)}px "${cfont}", Arial`;
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.fillText(cfg.org_name.toUpperCase(), txtX, sy(33));
  if (subtitle) {
    ctx.font = `400 ${fs(5)}px "${cfont}", Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(subtitle, txtX, sy(41));
  }

  // Logo on right (if logo_position === 'right')
  if (showLogoInStrip && logoPos === 'right') {
    const lh = s(logoSz);
    const srcW = logoImg!.naturalWidth  || logoImg!.width  || 200;
    const srcH = logoImg!.naturalHeight || logoImg!.height || 200;
    const lw   = Math.round(srcW * (lh / srcH));
    const padX = s(4), padY = sy(3);
    const logoX = W - s(8) - padX * 2 - lw;
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffffff';
    fillRoundRect(ctx, logoX - padX, sy(8), lw + padX * 2, lh + padY * 2, s(5));
    ctx.globalAlpha = 1; ctx.restore();
    ctx.drawImage(logoImg!, logoX, sy(8) + padY, lw, lh);
  }

  // Access badge on strip
  if (showAccess) {
    ctx.fillStyle = acfg.color;
    const badgeW = s(50);
    const badgeRight = (showLogoInStrip && logoPos === 'right') ? W - s(8) - s(50) - s(4) - (s(30) + s(8)) : W - badgeW - s(8);
    fillRoundRect(ctx, badgeRight, sy(17), badgeW, sy(14), s(3));
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${fs(6)}px "${cfont}", Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(acfg.label, badgeRight + badgeW / 2, sy(27));
    ctx.textAlign = 'left';
  }

  // ── MIDDLE ZONE ──
  const midTop = s(effStrip);
  const midH   = s(effMidH);

  // Circular photo params
  const photoR  = s(effPhotoSz) / 2;          // radius
  const photoCX = s(PHOTO_CX);                // centre-x
  const photoCY = midTop + s(4) + photoR;     // centre-y

  // Logo watermark — right half of middle zone
  if (logoImg) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    const wmH = midH * 0.82;
    const wmSrcW = logoImg.naturalWidth  || logoImg.width  || 200;
    const wmSrcH = logoImg.naturalHeight || logoImg.height || 200;
    const wmW = Math.min(wmSrcW * (wmH / wmSrcH), W / 2 - s(12));
    const wmX = W / 2; // starts at horizontal centre
    const wmY = midTop + (midH - wmH) / 2;
    ctx.drawImage(logoImg, wmX, wmY, wmW, wmH);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Circular photo ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fill();

  if (photoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
    ctx.clip();
    const iw = photoImg.width, ih = photoImg.height;
    const sf = Math.max((photoR * 2) / iw, (photoR * 2) / ih);
    const dw = iw * sf, dh = ih * sf;
    ctx.drawImage(photoImg, photoCX - dw / 2, photoCY - dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.save();
    ctx.beginPath();
    ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
    ctx.clip();
    const ig = ctx.createRadialGradient(photoCX, photoCY, 0, photoCX, photoCY, photoR);
    ig.addColorStop(0, accent + '22');
    ig.addColorStop(1, accent + '44');
    ctx.fillStyle = ig;
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = `700 ${fs(effPhotoSz * 0.28)}px "${cfont}", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${emp.first_name.charAt(0)}${emp.last_name.charAt(0)}`, photoCX, photoCY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Circle border + outer ring
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
  ctx.strokeStyle = accent;
  ctx.lineWidth = s(2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(photoCX, photoCY, photoR + s(3), 0, Math.PI * 2);
  ctx.strokeStyle = accent + '22';
  ctx.lineWidth = s(3);
  ctx.stroke();
  ctx.restore();

  // INFO panel
  const infoX = s(effInfoX);
  let iy = midTop + s(12);

  // Full name (single line, splits to two if too wide)
  const fullName = `${emp.first_name} ${emp.last_name}`;
  ctx.fillStyle = nameCol;
  ctx.font = `${nameWeight} ${fs(9.5)}px "${cfont}", Arial`;
  const maxInfoW = W - infoX - s(8);
  if (ctx.measureText(fullName).width > maxInfoW) {
    ctx.fillText(emp.first_name, infoX, iy); iy += s(11);
    ctx.fillText(emp.last_name,  infoX, iy); iy += s(7);
  } else {
    ctx.fillText(fullName, infoX, iy); iy += s(12);
  }

  // Job title
  ctx.fillStyle = titleCol;
  ctx.font = `${titleWeight} ${fs(6.5)}px "${cfont}", Arial`;
  const title = emp.job_title || ROLE_TITLE[emp.role] || 'Staff';
  let titleStr = title;
  while (ctx.measureText(titleStr).width > maxInfoW && titleStr.length > 5) titleStr = titleStr.slice(0, -1);
  if (titleStr !== title) titleStr += '…';
  ctx.fillText(titleStr, infoX, iy); iy += s(7);

  // Department
  if (emp.departments?.name) {
    ctx.fillStyle = deptCol;
    ctx.font = `${deptWeight} ${fs(5.5)}px "${cfont}", Arial`;
    ctx.fillText(emp.departments.name, infoX, iy); iy += s(6);
  }

  // Divider
  iy += s(2);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = s(1);
  ctx.beginPath();
  ctx.moveTo(infoX, iy); ctx.lineTo(W - s(8), iy);
  ctx.stroke();
  iy += s(4);

  // Employee ID box
  const idBoxH = s(22);
  ctx.fillStyle = '#f8fafc';
  fillRoundRect(ctx, infoX, iy, W - infoX - s(8), idBoxH, s(3));
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 ${fs(4.5)}px "${cfont}", Arial`;
  ctx.fillText('EMPLOYEE ID', infoX + s(4), iy + s(8));
  ctx.fillStyle = idCol;
  ctx.font = `${idWeight} ${fs(8)}px monospace`;
  ctx.fillText(emp.employee_id, infoX + s(4), iy + s(18));
  iy += idBoxH + s(3);

  // Email — auto-fit font size so the full address always prints
  if (emp.email && iy < midTop + midH - s(4)) {
    ctx.fillStyle = deptCol;
    const availW = W - infoX - s(6);
    let emFsz = fs(5.5);
    ctx.font = `${deptWeight} ${emFsz}px "${cfont}", Arial`;
    while (ctx.measureText(emp.email).width > availW && emFsz > fs(3.5)) {
      emFsz -= 0.5;
      ctx.font = `${deptWeight} ${emFsz}px "${cfont}", Arial`;
    }
    ctx.fillText(emp.email, infoX, iy);
  }

  // ── BOTTOM STRIP ──
  const botTop = H - s(effStrip);
  ctx.fillStyle = '#f1f5f9';
  fillRoundRectBottom(ctx, 0, botTop, W, s(effStrip), s(10));
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = s(1);
  ctx.beginPath(); ctx.moveTo(0, botTop); ctx.lineTo(W, botTop); ctx.stroke();

  // Barcode
  if (barcodeImg) {
    const bh = s(30);
    const bw = Math.min(barcodeImg.width * (bh / barcodeImg.height), s(120));
    ctx.drawImage(barcodeImg, s(10), botTop + (s(effStrip) - bh) / 2, bw, bh);
  }

  // Strip divider
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = s(1);
  ctx.beginPath();
  ctx.moveTo(s(140), botTop + s(8)); ctx.lineTo(s(140), H - s(8));
  ctx.stroke();

  // Issued / Valid
  const issued = getIssuedLabel(emp, cfg.card_overrides);
  const expiry = getExpiryLabel(emp, cfg);
  const datesX = s(148);

  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 ${fs(5)}px "${cfont}", Arial`;
  ctx.fillText('ISSUED', datesX, botTop + sy(14));
  ctx.fillStyle = '#475569';
  ctx.font = `600 ${fs(7)}px "${cfont}", Arial`;
  ctx.fillText(issued, datesX, botTop + sy(23));

  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 ${fs(5)}px "${cfont}", Arial`;
  ctx.fillText('VALID UNTIL', datesX + s(38), botTop + sy(14));
  ctx.fillStyle = valid ? acfg.color : '#dc2626';
  ctx.font = `700 ${fs(7)}px "${cfont}", Arial`;
  ctx.fillText(valid ? expiry : 'VOID', datesX + s(38), botTop + sy(23));

  // Website
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 ${fs(5)}px "${cfont}", Arial`;
  ctx.fillText(cfg.website, datesX, botTop + sy(36));

  // Access stripe
  if (showAccess) {
    const sg = ctx.createLinearGradient(0, botTop + s(5), 0, H - s(5));
    sg.addColorStop(0, valid ? acfg.color : '#dc2626');
    sg.addColorStop(1, valid ? acfg.stripe : '#fee2e2');
    ctx.fillStyle = sg;
    fillRoundRect(ctx, W - s(18), botTop + s(7), s(7), s(34), s(3));
  }

  // VOID watermark
  if (!valid) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#dc2626';
    ctx.font = `900 ${fs(52)}px "${cfont}", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-30 * Math.PI / 180);
    ctx.fillText('VOID', 0, 0);
    ctx.restore();
  }

  return canvas;
}

async function renderBackToCanvas(
  emp: Employee,
  cfg: CardSettings,
  qrDataUrl: string,
  scale: number
): Promise<HTMLCanvasElement> {
  await ensureFontLoaded(cfg.font_family);
  const W = Math.round(CARD_W_PX * scale);
  const H = Math.round(CARD_H_PX * scale);
  const s     = (n: number) => Math.round(n * scale);
  const cfont = extractFirstFont(cfg.font_family);
  const fsc   = cfg.font_size_scale || 1;
  const fs    = (n: number) => Math.round(n * scale * fsc);

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const accent      = cfg.accent_color;
  const backBg      = cfg.back_color           || '#0f172a';
  const backText    = cfg.back_text_color      || '#f1f5f9';
  const backSecnd   = cfg.back_secondary_color || '#94a3b8';
  const showAccess  = cfg.show_access_badge !== false;
  const access  = getAccessLevel(emp, cfg.card_overrides);
  const acfg    = ACCESS_CONFIG[access];

  // Dark background
  ctx.fillStyle = backBg;
  fillRoundRect(ctx, 0, 0, W, H, s(10));

  // Gradient overlay
  const bg1 = ctx.createRadialGradient(W * 0.15, H * 0.5, 0, W * 0.15, H * 0.5, W * 0.55);
  bg1.addColorStop(0, accent + '28');
  bg1.addColorStop(1, 'transparent');
  ctx.fillStyle = bg1;
  ctx.fillRect(0, 0, W, H);

  // Top accent stripe
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W / 2, s(4));
  ctx.fillStyle = acfg.color;
  ctx.fillRect(W / 2, 0, W / 2, s(4));

  // Pre-load QR + employee photo + signature in parallel
  const [qrImg, photoImg, sigImg] = await Promise.all([
    qrDataUrl ? loadImage(qrDataUrl) : Promise.resolve(null),
    emp.profile_photo_url ? loadImage(emp.profile_photo_url) : Promise.resolve(null),
    cfg.signature_url ? loadImage(cfg.signature_url) : Promise.resolve(null),
  ]);

  // QR panel — left (lift QR higher when signature sits below it)
  const qrSize = s(68);
  const qrX = s(14) + (s(80) - qrSize) / 2;
  const qrY = (H - qrSize) / 2 - (sigImg ? s(22) : s(10));

  ctx.fillStyle = '#ffffff';
  fillRoundRect(ctx, qrX - s(4), qrY - s(4), qrSize + s(8), qrSize + s(8), s(6));
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = s(2);
  roundRectPath(ctx, qrX - s(4), qrY - s(4), qrSize + s(8), qrSize + s(8), s(6));
  ctx.stroke();

  if (qrImg) {
    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  // Employee photo — circular overlay in center of QR
  if (qrImg && photoImg) {
    const cx = qrX + qrSize / 2;
    const cy = qrY + qrSize / 2;
    const pr = Math.round(qrSize * 0.14); // ~14% of QR size
    // White border ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, pr + s(1.5), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // Clip to circle and draw photo
    ctx.beginPath();
    ctx.arc(cx, cy, pr, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photoImg, cx - pr, cy - pr, pr * 2, pr * 2);
    ctx.restore();
  }

  // Scan label
  ctx.fillStyle = backSecnd;
  ctx.font = `400 ${fs(5)}px "${cfont}", Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO VERIFY', s(14) + s(40), qrY + qrSize + s(14));
  ctx.textAlign = 'left';

  // Signature in left panel (below scan label)
  if (sigImg) {
    const sh = s(cfg.signature_size ?? 18);
    const leftPanelW = s(80);
    const sw = Math.min(Math.round(sigImg.width * (sh / sigImg.height)), leftPanelW - s(8));
    const sigX = s(14) + (leftPanelW - sw) / 2;
    const sigBaseY = qrY + qrSize + s(20);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = s(0.5);
    ctx.beginPath(); ctx.moveTo(s(18), sigBaseY); ctx.lineTo(s(14) + leftPanelW - s(4), sigBaseY); ctx.stroke();
    ctx.drawImage(sigImg, sigX, sigBaseY + s(3), sw, sh);
    ctx.fillStyle = backSecnd;
    ctx.font = `400 ${fs(4)}px "${cfont}", Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('AUTHORIZED', s(14) + leftPanelW / 2, sigBaseY + sh + s(10));
    ctx.fillText('SIGNATURE', s(14) + leftPanelW / 2, sigBaseY + sh + s(16));
    ctx.textAlign = 'left';
  }

  // Divider
  const divX = s(106);
  const divGrad = ctx.createLinearGradient(0, s(16), 0, H - s(16));
  divGrad.addColorStop(0, 'transparent');
  divGrad.addColorStop(0.5, accent + '77');
  divGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = divGrad;
  ctx.fillRect(divX, s(16), s(1), H - s(32));

  // Right panel — mirrors JSX layout exactly (top:14, flexDirection:column, gap:6)
  const rx     = divX + s(10);
  let ry       = s(14);
  const panelW = W - rx - s(12);
  const GAP    = s(6);

  // ── Access badge (auto-width, matches JSX inline-block with padding: 2 7) ──
  if (showAccess) {
    const bText  = `${acfg.label} ACCESS`;
    ctx.font     = `700 ${fs(6)}px "${cfont}", Arial`;
    const bTxtW  = ctx.measureText(bText).width;
    const bPadX  = s(7), bPadY = s(2);
    const badgeH = Math.round(fs(6) * 1.35) + bPadY * 2;
    ctx.fillStyle = acfg.color;
    fillRoundRect(ctx, rx, ry, bTxtW + bPadX * 2, badgeH, s(3));
    ctx.fillStyle    = '#ffffff';
    ctx.textBaseline = 'top';
    ctx.fillText(bText, rx + bPadX, ry + bPadY);
    ry += badgeH + GAP;
  }

  // ── Divider (height:1 + margin:2 on each side, matches JSX) ──
  ry += s(2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth   = s(1);
  ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(W - s(12), ry); ctx.stroke();
  ry += s(1) + s(2);
  ry += GAP;

  // ── Info rows — matches InfoRowBack (icon fs(8) + gap:4 + label fs(4.5) / value fs(6.5)) ──
  const iconSz  = Math.round(fs(8));
  const iconGap = s(4);
  const textX   = rx + iconSz + iconGap;
  const textW   = panelW - iconSz - iconGap;
  const lblFsz  = fs(4.5);
  const valFsz  = fs(6.5);
  const lblH    = Math.round(lblFsz * 1.4);
  const valLH   = Math.round(valFsz * 1.3);

  const infoRows: [string, string, string][] = [
    ['🌐', 'VERIFY ONLINE', cfg.website],
    ['🏢', 'REPORT TO', cfg.hq_address || 'FKF HQ, Nairobi'],
    ['📞', 'EMERGENCY LINE', cfg.emergency_number],
    ['✉',  'EMAIL',          cfg.contact_email || 'info@footballkenya.org'],
  ];

  ctx.textBaseline = 'top';
  for (const [icon, label, value] of infoRows) {
    const rowY = ry;
    ctx.font      = `${iconSz}px Arial, sans-serif`;
    ctx.fillStyle = backSecnd;
    ctx.fillText(icon, rx, rowY);
    ctx.font      = `400 ${lblFsz}px "${cfont}", Arial`;
    ctx.fillText(label, textX, rowY);
    ctx.fillStyle = backText;
    ctx.font      = `600 ${valFsz}px "${cfont}", Arial`;
    const valLines = wrapTextLines(ctx, value, textW);
    for (let li = 0; li < valLines.length; li++) {
      ctx.fillText(valLines[li], textX, rowY + lblH + li * valLH);
    }
    ry += Math.max(Math.round(iconSz * 1.2), lblH + valLines.length * valLH) + GAP;
  }
  ctx.textBaseline = 'alphabetic';

  // ── Property notice (matches JSX marginTop:4, padding:4 6, border, lineHeight:1.5) ──
  ry += s(4);
  const propText      = cfg.property_notice || `Property of ${cfg.org_name}. If found, return to FKF HQ.`;
  const propColor     = cfg.property_notice_color  || '#64748b';
  const propFsz       = fs(cfg.property_notice_size ?? 4.5);
  const propWeight    = cfg.property_notice_weight ?? 400;
  const propItalicStr = cfg.property_notice_italic ? 'italic ' : '';
  ctx.font = `${propItalicStr}${propWeight} ${propFsz}px "${cfont}", Arial`;
  const propMaxW  = panelW - s(12);
  const propLH    = Math.round(propFsz * 1.5);
  const propLines = wrapTextLines(ctx, propText, propMaxW);
  const propBoxH  = propLines.length * propLH + s(8);
  ctx.fillStyle   = 'rgba(255,255,255,0.06)';
  fillRoundRect(ctx, rx, ry, panelW, propBoxH, s(4));
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth   = s(1);
  roundRectPath(ctx, rx, ry, panelW, propBoxH, s(4));
  ctx.stroke();
  ctx.fillStyle    = propColor;
  ctx.textBaseline = 'top';
  for (let i = 0; i < propLines.length; i++) {
    if (propLines[i]) ctx.fillText(propLines[i], rx + s(6), ry + s(4) + i * propLH);
  }
  ctx.textBaseline = 'alphabetic';
  ry += propBoxH + GAP;

  // ── Magnetic stripe (matches JSX order: stripe BEFORE NOT TRANSFERABLE) ──
  ry += s(2);
  const mg = ctx.createLinearGradient(rx, 0, W - s(12), 0);
  mg.addColorStop(0, '#1e293b'); mg.addColorStop(0.5, '#334155'); mg.addColorStop(1, '#1e293b');
  ctx.fillStyle   = mg;
  ctx.globalAlpha = 0.7;
  fillRoundRect(ctx, rx, ry, panelW, s(6), s(2));
  ctx.globalAlpha = 1;
  ry += s(6) + GAP;

  // ── NOT TRANSFERABLE (textAlign:right, matches JSX) ──
  ctx.fillStyle    = '#334155';
  ctx.font         = `400 ${fs(4.5)}px "${cfont}", Arial`;
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('NOT TRANSFERABLE · ' + cfg.org_abbreviation, rx + panelW, ry);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';

  return canvas;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function StaffCards() {
  const [employees, setEmployees]   = useState<Employee[]>([]);
  const [filtered,  setFiltered]    = useState<Employee[]>([]);
  const [selected,  setSelected]    = useState<Set<string>>(new Set());
  const [search,    setSearch]      = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState<CardSettings>({
    org_name:         'Football Kenya Federation',
    org_abbreviation: 'FKF',
    accent_color:     '#1d4ed8',
    back_color:       '#0f172a',
    validity_years:   2,
    website:          'www.fkf.co.ke',
    emergency_number: '+254 000 000000',
    card_overrides:   {},
    // font colours default to undefined → component uses built-in defaults
  });
  const [settingsEdit, setSettingsEdit] = useState<CardSettings>({ ...settings });
  const [showSettings, setShowSettings] = useState(false);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [previewEmp,  setPreviewEmp]  = useState<Employee | null>(null);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [qrMap,    setQrMap]    = useState<Record<string, string>>({});
  const [printing, setPrinting] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editOverride, setEditOverride] = useState<CardOverride>({});

  // ── Crop state ──────────────────────────────────────────────────────────────
  const [cropSrc, setCropSrc]           = useState<string | null>(null);
  const [crop, setCrop]                 = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);

  // ── Load data ───────────────────────────────────────────────────────────────

  useEffect(() => { loadAll(); }, []);

  function extractError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
    return String(e);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [empRes, deptRes] = await Promise.all([
        supabase.from('users_profile')
          .select('id, employee_id, first_name, last_name, email, phone, role, department_id, profile_photo_url, is_active, job_title')
          .order('first_name'),
        supabase.from('departments').select('id, name').order('name'),
      ]);
      if (empRes.error) throw empRes.error;

      const extRes = await supabase.from('users_profile')
        .select('id, blood_type, emergency_contact, emergency_phone');
      const extMap = new Map((extRes.data ?? []).map(r => [r.id, r]));
      const deptMap = new Map((deptRes.data ?? []).map(d => [d.id, d]));

      const enriched: Employee[] = (empRes.data ?? []).map(emp => ({
        ...emp,
        departments: emp.department_id ? (deptMap.get(emp.department_id) ?? null) : null,
        ...(extMap.get(emp.id) ?? {}),
      }));

      setEmployees(enriched);
      setFiltered(enriched);
      setDepartments(deptRes.data ?? []);

      const settRes = await supabase.from('staff_card_settings').select('settings').eq('id', 1).maybeSingle();
      if (settRes.data?.settings) {
        const s = settRes.data.settings as CardSettings;
        // Migrate old settings that might not have back_color
        const merged = { ...settings, ...s };
        setSettings(merged);
        setSettingsEdit(merged);
      }
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Filtering ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let list = employees;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        e.employee_id?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q)
      );
    }
    if (deptFilter) list = list.filter(e => e.department_id === deptFilter);
    if (roleFilter) list = list.filter(e => e.role === roleFilter);
    setFiltered(list);
  }, [search, deptFilter, roleFilter, employees]);

  // ── Load Google Font for live preview whenever font_family changes ──────────

  useEffect(() => {
    [settings.font_family, settingsEdit.font_family].forEach(ff => {
      if (!ff) return;
      const opt = FONT_OPTIONS.find(o => o.value === ff);
      if (!opt?.googleFont) return;
      const id = `gf-${opt.googleFont.replace(/[^a-zA-Z0-9]/g, '-')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id   = id;
      link.rel  = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${opt.googleFont}&display=swap`;
      document.head.appendChild(link);
    });
  }, [settings.font_family, settingsEdit.font_family]);

  // ── QR generation ──────────────────────────────────────────────────────────

  const ensureQR = useCallback(async (emp: Employee, settingsOverride?: CardSettings) => {
    const s = settingsOverride ?? settings;
    const key = qrCacheKey(emp, s.card_overrides);
    if (qrMap[key]) return;
    const gen = getCardGeneration(emp, s.card_overrides);
    const dataUrl = await buildQRDataUrl(buildVerifyUrl(emp, gen));
    setQrMap(prev => ({ ...prev, [key]: dataUrl }));
  }, [qrMap, settings]);

  useEffect(() => {
    if (previewEmp) ensureQR(previewEmp, settings);
  }, [previewEmp, ensureQR, settings]);

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const selectAll    = () => setSelected(new Set(filtered.map(e => e.id)));
  const clearSelection = () => setSelected(new Set());

  // ── PDF export ─────────────────────────────────────────────────────────────

  async function handlePrintSelected() {
    const targets = filtered.filter(e => selected.has(e.id));
    if (!targets.length) return;
    setPrinting(true);
    setError('');
    try {
      // Generate all QR codes (generation-aware)
      const newQrs: Record<string, string> = { ...qrMap };
      for (const emp of targets) {
        const key = qrCacheKey(emp, settings.card_overrides);
        if (!newQrs[key]) {
          const gen = getCardGeneration(emp, settings.card_overrides);
          newQrs[key] = await buildQRDataUrl(buildVerifyUrl(emp, gen));
        }
      }
      setQrMap(newQrs);

      // PDF: one page per card side (front then back per employee)
      // Page dimensions match the selected card format — compatible with card printers
      const fmt = CARD_FORMATS.find(f => f.key === settings.card_format) ?? CARD_FORMATS[0];
      // Scale canvas resolution to ~300 DPI at the selected format width
      const PDF_DPI    = 300;
      const PDF_SCALE  = Math.round(((fmt.w_mm / 25.4) * PDF_DPI / CARD_W_PX) * 100) / 100;

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: [fmt.w_mm, fmt.h_mm],
      });

      for (let i = 0; i < targets.length; i++) {
        const emp = targets[i];
        const qrKey = qrCacheKey(emp, settings.card_overrides);

        const [frontCanvas, backCanvas] = await Promise.all([
          renderFrontToCanvas(emp, settings, PDF_SCALE),
          renderBackToCanvas(emp, settings, newQrs[qrKey] || '', PDF_SCALE),
        ]);

        // Page 1: front face (full bleed — card fills page exactly)
        if (i > 0) pdf.addPage([fmt.w_mm, fmt.h_mm], 'landscape');
        pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, fmt.w_mm, fmt.h_mm);

        // Page 2: back face
        pdf.addPage([fmt.w_mm, fmt.h_mm], 'landscape');
        pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, fmt.w_mm, fmt.h_mm);
      }

      pdf.save(`FKF_Staff_Cards_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e: unknown) {
      setError(extractError(e));
    } finally {
      setPrinting(false);
    }
  }

  // ── Save settings ───────────────────────────────────────────────────────────

  async function handleSaveSettings() {
    const { error } = await supabase
      .from('staff_card_settings')
      .update({ settings: settingsEdit })
      .eq('id', 1);
    if (error) { setError(error.message); return; }
    setSettings(settingsEdit);
    setShowSettings(false);
  }

  // ── Logo upload ─────────────────────────────────────────────────────────────

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    const ext  = file.name.split('.').pop();
    const path = `logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('org-assets').upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from('org-assets').getPublicUrl(path);
    setSettingsEdit(prev => ({ ...prev, logo_url: publicUrl }));
    e.target.value = '';
  }

  // ── Photo upload — opens cropper ───────────────────────────────────────────

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editingEmp || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function onCropImageLoad(img: HTMLImageElement) {
    const { width, height } = img;
    const size = Math.min(width, height);
    const c = centerCrop(
      makeAspectCrop({ unit: 'px', width: size }, 1, width, height),
      width, height
    );
    setCrop(c);
  }

  async function handleCropConfirm() {
    if (!cropImgRef.current || !completedCrop || !editingEmp) return;
    const img = cropImgRef.current;
    const canvas = document.createElement('canvas');
    const size = 400; // output 400×400
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const scaleX = img.naturalWidth  / img.width;
    const scaleY = img.naturalHeight / img.height;

    // Draw circular clip
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width  * scaleX,
      completedCrop.height * scaleY,
      0, 0, size, size
    );

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const path = `${editingEmp.id}/photo.png`;
      const { error: upErr } = await supabase.storage
        .from('staff-photos').upload(path, blob, { upsert: true, contentType: 'image/png' });
      if (upErr) { setError(upErr.message); return; }
      const { data: { publicUrl } } = supabase.storage.from('staff-photos').getPublicUrl(path);
      setEditingEmp(prev => prev ? { ...prev, profile_photo_url: publicUrl } : prev);
      setCropSrc(null);
    }, 'image/png');
  }

  // ── Signature upload (global — one authorizer signature for all cards) ────────

  async function handleSignatureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setError('Signature image must be under 3 MB'); return; }

    const { error: upErr } = await supabase.storage
      .from('org-assets').upload('signature.png', file, { upsert: true, contentType: file.type });
    if (upErr) { setError(upErr.message); return; }

    const { data: { publicUrl } } = supabase.storage.from('org-assets').getPublicUrl('signature.png');
    setSettingsEdit(prev => ({ ...prev, signature_url: `${publicUrl}?t=${Date.now()}` }));
    e.target.value = '';
  }

  // ── Save employee + card overrides ─────────────────────────────────────────

  // Immediately saves override without waiting for Save button
  async function saveOverrideNow(emp: Employee, override: CardOverride): Promise<CardSettings | null> {
    const newOverrides: Record<string, CardOverride> = {
      ...(settings.card_overrides ?? {}),
      [emp.employee_id]: override,
    };
    const newSettings: CardSettings = { ...settings, card_overrides: newOverrides };
    const { error } = await supabase
      .from('staff_card_settings').update({ settings: newSettings }).eq('id', 1);
    if (error) { setError(extractError(error)); return null; }
    setSettings(newSettings);
    return newSettings;
  }

  async function handleInvalidateCard() {
    if (!editingEmp) return;
    const newOverride = { ...editOverride, is_valid: false };
    const saved = await saveOverrideNow(editingEmp, newOverride);
    if (saved) {
      setEditOverride(newOverride);
    }
  }

  async function handleReissueCard() {
    if (!editingEmp) return;
    const currentGen = editOverride.card_generation ?? 1;
    const newGen = currentGen + 1;
    const newOverride: CardOverride = { ...editOverride, is_valid: true, card_generation: newGen };
    const saved = await saveOverrideNow(editingEmp, newOverride);
    if (saved) {
      setEditOverride(newOverride);
      // Bust QR cache for old generation — new key will be generated on next preview/export
      const oldKey = `${editingEmp.id}-v${currentGen}`;
      setQrMap(prev => { const n = { ...prev }; delete n[oldKey]; return n; });
    }
  }

  async function handleSaveEmpOverrides() {
    if (!editingEmp) return;
    const { error: dbErr } = await supabase
      .from('users_profile')
      .update({
        job_title:         editingEmp.job_title ?? null,
        blood_type:        editingEmp.blood_type ?? null,
        emergency_contact: editingEmp.emergency_contact ?? null,
        emergency_phone:   editingEmp.emergency_phone ?? null,
        profile_photo_url: editingEmp.profile_photo_url ?? null,
      })
      .eq('id', editingEmp.id);
    if (dbErr) { setError(extractError(dbErr)); return; }

    // Save card overrides into settings
    const newOverrides: Record<string, CardOverride> = {
      ...(settings.card_overrides ?? {}),
      [editingEmp.employee_id]: editOverride,
    };
    const newSettings: CardSettings = { ...settings, card_overrides: newOverrides };
    const { error: sErr } = await supabase
      .from('staff_card_settings')
      .update({ settings: newSettings })
      .eq('id', 1);
    if (sErr) { setError(extractError(sErr)); return; }

    setSettings(newSettings);
    setEmployees(prev => prev.map(e => e.id === editingEmp.id ? editingEmp : e));
    setEditingEmp(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const uniqueRoles = [...new Set(employees.map(e => e.role))].sort();

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          {/* Page header */}
          <div className="page-header">
            <div>
              <h1>🪪 Staff ID Cards</h1>
              <p className="page-subtitle">
                ATM-sized ID cards · Front+back PDF export · QR verification
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setShowSettings(v => !v)}>
                ⚙ Card Design
              </button>
              {selected.size > 0 && (
                <button className="btn btn-primary" onClick={handlePrintSelected} disabled={printing}>
                  {printing ? '⏳ Generating PDF…' : `⬇ Export ${selected.size} Card${selected.size > 1 ? 's' : ''} to PDF`}
                </button>
              )}
            </div>
          </div>

          {error && <div className="alert alert-error mb-3">{error}</div>}

          {/* Settings panel */}
          {showSettings && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderTop: `4px solid ${settingsEdit.accent_color}`,
              borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem',
              boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
            }}>

              {/* ── Panel header ── */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>
                    🎨 Card Design Settings
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Changes apply to the live preview and PDF export
                  </div>
                </div>
                <button onClick={() => { setSettingsEdit(settings); setShowSettings(false); }}
                  style={{ border: 'none', background: 'none', fontSize: '1.5rem', lineHeight: 1,
                    cursor: 'pointer', color: '#94a3b8', padding: '0 4px', marginTop: -4 }}>×</button>
              </div>

              {/* ── Two-column main grid ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem', alignItems: 'start' }}>

                {/* ════ LEFT COLUMN ════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* Organisation */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                      🏢 Organisation
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                      {([
                        ['Organisation Name',       'org_name',         'text'],
                        ['Abbreviation (e.g. FKF)', 'org_abbreviation', 'text'],
                        ['Website',                 'website',          'text'],
                        ['Validity (years)',         'validity_years',   'number'],
                      ] as [string, keyof CardSettings, string][]).map(([label, key, type]) => (
                        <div key={key} style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: '0.72rem' }}>{label}</label>
                          <input type={type} className="form-control"
                            value={settingsEdit[key] as string | number ?? ''}
                            onChange={e => setSettingsEdit(prev => ({
                              ...prev, [key]: type === 'number' ? Number(e.target.value) : e.target.value,
                            }))}
                            style={{ fontSize: '0.82rem' }} />
                        </div>
                      ))}
                    </div>

                    <div style={{ margin: '0.65rem 0 0' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }}>Card Size / Format</label>
                      <select className="form-control" style={{ fontSize: '0.82rem' }}
                        value={settingsEdit.card_format ?? 'CR80'}
                        onChange={e => setSettingsEdit(prev => ({ ...prev, card_format: e.target.value === 'CR80' ? undefined : e.target.value }))}>
                        {CARD_FORMATS.map(f => (
                          <option key={f.key} value={f.key}>{f.label} — {f.w_mm} × {f.h_mm} mm</option>
                        ))}
                      </select>
                      <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        CR80 = standard card printer size (Datacard / Evolis)
                      </div>
                    </div>

                    <div style={{ marginTop: '0.75rem' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }}>Organisation Logo</label>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.3rem' }}>
                        {settingsEdit.logo_url && (
                          <img src={settingsEdit.logo_url} alt="logo"
                            style={{ height: 36, width: 'auto', borderRadius: 6,
                              border: '1px solid #e2e8f0', background: '#f8fafc', padding: 3 }} />
                        )}
                        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                          🖼 Upload Logo
                          <input type="file" accept="image/jpeg,image/png,image/svg+xml,image/webp"
                            style={{ display: 'none' }} onChange={handleLogoUpload} />
                        </label>
                      </div>
                      <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        PNG or SVG recommended
                      </div>
                    </div>
                  </div>

                  {/* Back Card Content */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                      🪪 Back Card Content
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.72rem' }}>HQ Address</label>
                        <input type="text" className="form-control"
                          placeholder="FKF HQ, Kandanda House, Nairobi"
                          value={settingsEdit.hq_address || ''}
                          onChange={e => setSettingsEdit(prev => ({ ...prev, hq_address: e.target.value || undefined }))}
                          style={{ fontSize: '0.82rem' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.72rem' }}>Emergency Number</label>
                          <input type="text" className="form-control"
                            placeholder="+254 759 910866"
                            value={settingsEdit.emergency_number || ''}
                            onChange={e => setSettingsEdit(prev => ({ ...prev, emergency_number: e.target.value }))}
                            style={{ fontSize: '0.82rem' }} />
                        </div>
                        <div>
                          <label className="form-label" style={{ fontSize: '0.72rem' }}>Contact Email</label>
                          <input type="email" className="form-control"
                            placeholder="info@footballkenya.org"
                            value={settingsEdit.contact_email || ''}
                            onChange={e => setSettingsEdit(prev => ({ ...prev, contact_email: e.target.value || undefined }))}
                            style={{ fontSize: '0.82rem' }} />
                        </div>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: '0.72rem' }}>Property Notice</label>
                        <textarea rows={3} className="form-control"
                          placeholder={`Property of ${settingsEdit.org_name}. If found, please return it to:\nFKF Head Quarters, Kandanda House, Nairobi\nTel: ${settingsEdit.emergency_number || '+254 759910866'} · ${settingsEdit.website || 'www.footballkenya.org'}`}
                          value={settingsEdit.property_notice || ''}
                          onChange={e => setSettingsEdit(prev => ({ ...prev, property_notice: e.target.value || undefined }))}
                          style={{ fontSize: '0.8rem', resize: 'vertical' }} />
                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          Supports line breaks. Leave blank to use the default.
                        </div>
                      </div>

                      {/* Property notice text style */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.75rem' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.6rem' }}>
                          Property Notice Text Style
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {/* Colour + size row */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.5rem', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.2rem' }}>Colour</div>
                              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                <input type="color"
                                  value={settingsEdit.property_notice_color || '#64748b'}
                                  onChange={e => setSettingsEdit(prev => ({ ...prev, property_notice_color: e.target.value }))}
                                  style={{ width: 32, height: 28, border: 'none', borderRadius: 5, cursor: 'pointer' }} />
                                <button title="Reset"
                                  onClick={() => setSettingsEdit(prev => ({ ...prev, property_notice_color: undefined }))}
                                  style={{ border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px 6px', borderRadius: 5, fontSize: '0.68rem' }}>↺</button>
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.2rem' }}>
                                Size &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.property_notice_size ?? 4.5}</strong>
                              </div>
                              <input type="range" min={3} max={8} step={0.5}
                                value={settingsEdit.property_notice_size ?? 4.5}
                                onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, property_notice_size: v === 4.5 ? undefined : v })); }}
                                style={{ width: '100%' }} />
                            </div>
                          </div>
                          {/* Weight + italic row */}
                          <div>
                            <div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.25rem' }}>Weight</div>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              {WEIGHT_OPTIONS.map(w => {
                                const active = (settingsEdit.property_notice_weight ?? 400) === w.value;
                                return (
                                  <button key={w.value} title={w.title}
                                    onClick={() => setSettingsEdit(prev => ({ ...prev, property_notice_weight: w.value === 400 ? undefined : w.value }))}
                                    style={{
                                      flex: 1, padding: '0.3rem 0', cursor: 'pointer',
                                      border: `2px solid ${active ? settingsEdit.accent_color : '#e2e8f0'}`,
                                      background: active ? `${settingsEdit.accent_color}18` : '#fff',
                                      borderRadius: 6, fontWeight: w.value, fontSize: '0.72rem',
                                      color: active ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                                    }}>
                                    {w.label}
                                  </button>
                                );
                              })}
                              <button
                                onClick={() => setSettingsEdit(prev => ({ ...prev, property_notice_italic: !prev.property_notice_italic }))}
                                style={{
                                  flex: 1, padding: '0.3rem 0', cursor: 'pointer',
                                  border: `2px solid ${settingsEdit.property_notice_italic ? settingsEdit.accent_color : '#e2e8f0'}`,
                                  background: settingsEdit.property_notice_italic ? `${settingsEdit.accent_color}18` : '#fff',
                                  borderRadius: 6, fontSize: '0.72rem', fontStyle: 'italic', fontWeight: 600,
                                  color: settingsEdit.property_notice_italic ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                                }}>
                                Italic
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="form-label" style={{ fontSize: '0.72rem' }}>
                          Signature Size &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.signature_size ?? 18}px</strong>
                        </label>
                        <input type="range" min={10} max={50} step={1}
                          value={settingsEdit.signature_size ?? 18}
                          onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, signature_size: v === 18 ? undefined : v })); }}
                          style={{ width: '100%' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: '#94a3b8' }}>
                          <span>Small (10)</span><span>Default (18)</span><span>Large (50)</span>
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                          Controls the height of the authorizer signature on the back card
                        </div>
                      </div>

                      {/* Authorizer signature upload */}
                      <div>
                        <label className="form-label" style={{ fontSize: '0.72rem' }}>Authorized Signature</label>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.3rem' }}>
                          <div style={{
                            width: 130, height: 44, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
                            background: '#1e293b', border: '1px solid #e2e8f0',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {settingsEdit.signature_url
                              ? <img src={settingsEdit.signature_url} alt="signature"
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                              : <span style={{ fontSize: '0.65rem', color: '#64748b' }}>No signature</span>
                            }
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
                              ✍ Upload Signature
                              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                style={{ display: 'none' }} onChange={handleSignatureUpload} />
                            </label>
                            {settingsEdit.signature_url && (
                              <button className="btn btn-sm btn-secondary"
                                onClick={() => setSettingsEdit(prev => ({ ...prev, signature_url: undefined }))}
                                style={{ color: '#dc2626', borderColor: '#dc2626', margin: 0 }}>
                                ✕ Remove
                              </button>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.3rem' }}>
                          PNG with transparent background recommended · appears on every card · max 3 MB
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                {/* ════ RIGHT COLUMN ════ */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                  {/* Colours */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                      🎨 Colours
                    </div>

                    {/* Front accent */}
                    <div style={{ marginBottom: '0.875rem' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }}>Front Accent</label>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input type="color" value={settingsEdit.accent_color}
                          onChange={e => setSettingsEdit(prev => ({ ...prev, accent_color: e.target.value }))}
                          style={{ width: 38, height: 34, border: 'none', borderRadius: 6, cursor: 'pointer', flexShrink: 0 }} />
                        <input type="text" className="form-control" value={settingsEdit.accent_color}
                          onChange={e => setSettingsEdit(prev => ({ ...prev, accent_color: e.target.value }))}
                          style={{ flex: 1, fontSize: '0.82rem' }} />
                      </div>
                    </div>

                    {/* Back card colours */}
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>Back Card</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.875rem' }}>
                      {([
                        ['Background',     'back_color',           '#0f172a'],
                        ['Primary Text',   'back_text_color',      '#f1f5f9'],
                        ['Secondary Text', 'back_secondary_color', '#94a3b8'],
                      ] as [string, keyof CardSettings, string][]).map(([label, key, dflt]) => (
                        <div key={key}>
                          <div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.25rem' }}>{label}</div>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input type="color"
                              value={(settingsEdit[key] as string) || dflt}
                              onChange={e => setSettingsEdit(prev => ({ ...prev, [key]: e.target.value }))}
                              style={{ width: 30, height: 28, border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }} />
                            <button title="Reset" onClick={() => setSettingsEdit(prev => ({ ...prev, [key]: dflt }))}
                              style={{ border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer',
                                color: '#94a3b8', padding: '2px 6px', borderRadius: 5, fontSize: '0.68rem' }}>↺</button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Front text colours */}
                    <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.4rem' }}>Front Card Text</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {([
                        ['Employee Name', 'name_color',  '#0f172a'],
                        ['Job Title',     'title_color', settingsEdit.accent_color],
                        ['Dept / Email',  'dept_color',  '#64748b'],
                        ['Employee ID',   'id_color',    '#0f172a'],
                      ] as [string, keyof CardSettings, string][]).map(([label, key, dflt]) => (
                        <div key={key}>
                          <div style={{ fontSize: '0.67rem', color: '#64748b', marginBottom: '0.25rem' }}>{label}</div>
                          <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                            <input type="color"
                              value={(settingsEdit[key] as string) || dflt}
                              onChange={e => setSettingsEdit(prev => ({ ...prev, [key]: e.target.value }))}
                              style={{ width: 30, height: 28, border: 'none', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }} />
                            <input type="text" className="form-control"
                              value={(settingsEdit[key] as string) || dflt}
                              onChange={e => setSettingsEdit(prev => ({ ...prev, [key]: e.target.value }))}
                              style={{ flex: 1, fontSize: '0.73rem' }} />
                            <button title="Reset"
                              onClick={() => setSettingsEdit(prev => ({ ...prev, [key]: undefined as unknown as string }))}
                              style={{ border: '1px solid #e2e8f0', background: 'none', cursor: 'pointer',
                                color: '#94a3b8', padding: '2px 6px', borderRadius: 5, fontSize: '0.68rem' }}>↺</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Typography */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                      🔤 Typography
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label" style={{ fontSize: '0.72rem' }}>Card Font</label>
                      <select className="form-control" style={{ fontSize: '0.82rem' }}
                        value={settingsEdit.font_family || FONT_OPTIONS[0].value}
                        onChange={e => setSettingsEdit(prev => ({
                          ...prev, font_family: e.target.value === FONT_OPTIONS[0].value ? undefined : e.target.value,
                        }))}>
                        {FONT_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <div style={{
                        marginTop: '0.35rem', padding: '0.35rem 0.65rem',
                        background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6,
                        fontFamily: settingsEdit.font_family || FONT_OPTIONS[0].value, fontSize: '0.88rem', color: '#334155',
                      }}>
                        Sample &mdash; <strong>Bold text</strong>
                      </div>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.72rem' }}>Global Font Scale</label>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                        {FONT_SIZE_OPTIONS.map(opt => {
                          const active = Math.abs((settingsEdit.font_size_scale ?? 1.0) - opt.value) < 0.01;
                          return (
                            <button key={opt.value} title={opt.title}
                              onClick={() => setSettingsEdit(prev => ({ ...prev, font_size_scale: opt.value === 1.0 ? undefined : opt.value }))}
                              style={{
                                flex: 1, padding: '0.38rem 0', cursor: 'pointer',
                                border: `2px solid ${active ? settingsEdit.accent_color : '#e2e8f0'}`,
                                background: active ? `${settingsEdit.accent_color}15` : '#fff',
                                borderRadius: 8, fontWeight: 700,
                                fontSize: `${0.68 + opt.value * 0.18}rem`,
                                color: active ? settingsEdit.accent_color : '#64748b',
                                transition: 'all 0.15s',
                              }}>
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        Scales all card text proportionally
                      </div>
                    </div>
                  </div>

                  {/* Text Styles */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                      ✍ Text Styles
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {TEXT_STYLE_ELEMENTS.map(([label, key, dflt]) => {
                        const current = settingsEdit[key] as number ?? dflt;
                        return (
                          <div key={key}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', marginBottom: '0.3rem' }}>{label}</div>
                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              {WEIGHT_OPTIONS.map(w => {
                                const active = current === w.value;
                                return (
                                  <button key={w.value} title={w.title}
                                    onClick={() => setSettingsEdit(prev => ({ ...prev, [key]: w.value === dflt ? undefined : w.value }))}
                                    style={{
                                      flex: 1, padding: '0.3rem 0', cursor: 'pointer',
                                      border: `2px solid ${active ? settingsEdit.accent_color : '#e2e8f0'}`,
                                      background: active ? `${settingsEdit.accent_color}18` : '#fff',
                                      borderRadius: 6, fontWeight: w.value, fontSize: '0.72rem',
                                      color: active ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                                    }}>
                                    {w.label}
                                  </button>
                                );
                              })}
                              <button title="Reset"
                                onClick={() => setSettingsEdit(prev => ({ ...prev, [key]: undefined as unknown as number }))}
                                style={{ border: '1px solid #e2e8f0', borderRadius: 5, background: 'none',
                                  cursor: 'pointer', padding: '0 8px', fontSize: '0.68rem', color: '#94a3b8' }}>↺</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Access Badge toggle */}
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem',
                    display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, flexShrink: 0 }}>
                      <input type="checkbox"
                        checked={settingsEdit.show_access_badge !== false}
                        onChange={e => setSettingsEdit(prev => ({ ...prev, show_access_badge: e.target.checked }))}
                        style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{
                        position: 'absolute', inset: 0, borderRadius: 24, cursor: 'pointer',
                        background: settingsEdit.show_access_badge !== false ? settingsEdit.accent_color : '#cbd5e1',
                        transition: 'background 0.2s',
                      }}>
                        <span style={{
                          position: 'absolute', top: 3,
                          left: settingsEdit.show_access_badge !== false ? 22 : 3,
                          width: 18, height: 18, borderRadius: '50%', background: '#fff',
                          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        }} />
                      </span>
                    </label>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>Show Access Badge</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                        Coloured access level badge (ALL AREAS / GENERAL / RESTRICTED)
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Full-width: Header Strip ── */}
              <div style={{ marginTop: '1rem', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.875rem', paddingBottom: '0.5rem', borderBottom: '2px solid #f1f5f9' }}>
                  🏷 Header Strip
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem', alignItems: 'start' }}>

                  {/* Subtitle — full width */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Subtitle Text</label>
                    <input type="text" className="form-control"
                      placeholder="OFFICIAL IDENTIFICATION CARD"
                      value={settingsEdit.card_subtitle ?? ''}
                      onChange={e => setSettingsEdit(prev => ({ ...prev, card_subtitle: e.target.value || undefined }))}
                      style={{ fontSize: '0.82rem' }} />
                    <div style={{ fontSize: '0.67rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                      Leave blank for default · clear completely to hide
                    </div>
                  </div>

                  {/* Strip height */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>
                      Strip Height &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.strip_height ?? 48}px</strong>
                    </label>
                    <input type="range" min={32} max={68} step={2}
                      value={settingsEdit.strip_height ?? 48}
                      onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, strip_height: v === 48 ? undefined : v })); }}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: '#94a3b8' }}>
                      <span>Compact (32)</span><span>Default (48)</span><span>Tall (68)</span>
                    </div>
                  </div>

                  {/* Abbreviation font size */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>
                      Abbreviation Size &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.title_font_size ?? 11}px</strong>
                    </label>
                    <input type="range" min={7} max={18} step={0.5}
                      value={settingsEdit.title_font_size ?? 11}
                      onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, title_font_size: v === 11 ? undefined : v })); }}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: '#94a3b8' }}>
                      <span>7</span><span>Default (11)</span><span>18</span>
                    </div>
                  </div>

                  {/* Org name font size */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>
                      Org Name Size &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.org_name_font_size ?? 5.5}px</strong>
                    </label>
                    <input type="range" min={4} max={12} step={0.5}
                      value={settingsEdit.org_name_font_size ?? 5.5}
                      onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, org_name_font_size: v === 5.5 ? undefined : v })); }}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: '#94a3b8' }}>
                      <span>4</span><span>Default (5.5)</span><span>12</span>
                    </div>
                  </div>

                  {/* Logo size */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>
                      Logo Size &nbsp;<strong style={{ color: '#1e293b' }}>{settingsEdit.logo_size ?? 30}px</strong>
                    </label>
                    <input type="range" min={16} max={44} step={2}
                      value={settingsEdit.logo_size ?? 30}
                      onChange={e => { const v = Number(e.target.value); setSettingsEdit(prev => ({ ...prev, logo_size: v === 30 ? undefined : v })); }}
                      style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.63rem', color: '#94a3b8' }}>
                      <span>Small (16)</span><span>Default (30)</span><span>Large (44)</span>
                    </div>
                  </div>

                  {/* Org name style */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Org Name Style</label>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      {WEIGHT_OPTIONS.map(({ label, value, title }) => {
                        const active = (settingsEdit.org_name_weight ?? 400) === value;
                        return (
                          <button key={value} title={title}
                            onClick={() => setSettingsEdit(prev => ({ ...prev, org_name_weight: value === 400 ? undefined : value }))}
                            style={{
                              flex: 1, padding: '0.3rem 0', cursor: 'pointer',
                              border: `2px solid ${active ? settingsEdit.accent_color : '#e2e8f0'}`,
                              background: active ? `${settingsEdit.accent_color}18` : '#fff',
                              borderRadius: 6, fontSize: '0.72rem', fontWeight: value,
                              color: active ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                            }}>
                            {label}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => setSettingsEdit(prev => ({ ...prev, org_name_italic: !prev.org_name_italic }))}
                        style={{
                          flex: 1, padding: '0.3rem 0', cursor: 'pointer',
                          border: `2px solid ${settingsEdit.org_name_italic ? settingsEdit.accent_color : '#e2e8f0'}`,
                          background: settingsEdit.org_name_italic ? `${settingsEdit.accent_color}18` : '#fff',
                          borderRadius: 6, fontSize: '0.72rem', fontStyle: 'italic', fontWeight: 600,
                          color: settingsEdit.org_name_italic ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                        }}>
                        Italic
                      </button>
                    </div>
                  </div>

                  {/* Logo position */}
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Logo Position</label>
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem' }}>
                      {(['left', 'right', 'hidden'] as const).map(pos => {
                        const active = (settingsEdit.logo_position ?? 'left') === pos;
                        const labels: Record<string, string> = { left: '← Left', right: 'Right →', hidden: '🚫 Hidden' };
                        return (
                          <button key={pos}
                            onClick={() => setSettingsEdit(prev => ({ ...prev, logo_position: pos === 'left' ? undefined : pos }))}
                            style={{
                              flex: 1, padding: '0.35rem 0', cursor: 'pointer',
                              border: `2px solid ${active ? settingsEdit.accent_color : '#e2e8f0'}`,
                              background: active ? `${settingsEdit.accent_color}18` : '#fff',
                              borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
                              color: active ? settingsEdit.accent_color : '#64748b', transition: 'all 0.15s',
                            }}>
                            {labels[pos]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Save / Cancel ── */}
              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => { setSettingsEdit(settings); setShowSettings(false); }}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  💾 Save Settings
                </button>
              </div>

            </div>
          )}

          {/* Filters */}
          <div className="filters-row">
            <input type="text" className="filter-select" placeholder="Search employee or ID…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ minWidth: 220, flex: 1 }} />
            <select className="filter-select" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select className="filter-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {uniqueRoles.map(r => <option key={r} value={r}>{ROLE_TITLE[r] || r}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="btn btn-sm btn-secondary" onClick={selectAll}>Select All ({filtered.length})</button>
              {selected.size > 0 && (
                <button className="btn btn-sm btn-secondary" onClick={clearSelection}>Clear</button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="stats-grid mb-4">
            {[
              { label: 'Total Staff',  value: employees.length,  icon: '👥', cls: 'stat-card-info' },
              { label: 'Shown',        value: filtered.length,   icon: '🔍', cls: '' },
              { label: 'Selected',     value: selected.size,     icon: '✅', cls: selected.size > 0 ? 'stat-card-success' : '' },
              { label: 'Departments',  value: departments.length, icon: '🏢', cls: '' },
            ].map(({ label, value, icon, cls }) => (
              <div key={label} className={`stat-card ${cls}`}>
                <div className="stat-icon">{icon}</div>
                <div className="stat-info">
                  <div className="stat-value">{value}</div>
                  <div className="stat-label">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Employee grid */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>Loading staff…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {filtered.map(emp => {
                const isSelected = selected.has(emp.id);
                const access = getAccessLevel(emp, settings.card_overrides);
                const acfg   = ACCESS_CONFIG[access];
                const valid  = isCardValid(emp, settings.card_overrides);
                return (
                  <div key={emp.id} style={{
                    background: 'var(--card-bg, #fff)',
                    borderRadius: 12,
                    border: `2px solid ${isSelected ? settings.accent_color : 'var(--border-color, #e5e7eb)'}`,
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? `0 0 0 3px ${settings.accent_color}22` : '0 1px 3px rgba(0,0,0,0.06)',
                    opacity: valid ? 1 : 0.75,
                  }}
                    onClick={() => toggleSelect(emp.id)}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 5, flexShrink: 0, marginTop: 2,
                        border: `2px solid ${isSelected ? settings.accent_color : '#d1d5db'}`,
                        background: isSelected ? settings.accent_color : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{
                        width: 48, height: 48, borderRadius: 10, overflow: 'hidden',
                        background: `linear-gradient(135deg, ${settings.accent_color}22, ${settings.accent_color}44)`,
                        flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: 16, color: settings.accent_color,
                        border: `2px solid ${settings.accent_color}44`,
                      }}>
                        {emp.profile_photo_url
                          ? <img src={emp.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : `${emp.first_name.charAt(0)}${emp.last_name.charAt(0)}`
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {emp.first_name} {emp.last_name}
                          {!valid && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 3, fontWeight: 700 }}>VOID</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                          {emp.job_title || ROLE_TITLE[emp.role] || 'Staff'}
                          {emp.departments?.name && ` · ${emp.departments.name}`}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
                          {emp.employee_id}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.5px',
                        color: acfg.color, background: acfg.stripe,
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {acfg.label}
                      </span>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn-sm btn-secondary"
                        onClick={e => {
                          e.stopPropagation();
                          setEditingEmp({ ...emp });
                          setEditOverride({ ...(settings.card_overrides?.[emp.employee_id] ?? {}) });
                        }}
                        style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                        ✏ Edit
                      </button>
                      <button className="btn btn-sm btn-primary"
                        onClick={async e => {
                          e.stopPropagation();
                          await ensureQR(emp, settings);
                          setPreviewEmp(emp);
                          setPreviewSide('front');
                        }}
                        style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                        👁 Preview
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              No employees match your filter.
            </div>
          )}
        </div>
      </main>

      {/* ── Preview modal ──────────────────────────────────────────────────────── */}
      {previewEmp && (
        <div className="modal-overlay" onClick={() => setPreviewEmp(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: 16, padding: '1.5rem', maxWidth: 820,
            width: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>
                Card Preview — {previewEmp.first_name} {previewEmp.last_name}
              </h3>
              <button className="modal-close" onClick={() => setPreviewEmp(null)}>×</button>
            </div>

            <div className="tabs" style={{ marginBottom: '1rem' }}>
              <button className={`tab ${previewSide === 'front' ? 'active' : ''}`}
                onClick={() => setPreviewSide('front')}>
                🪪 Front
              </button>
              <button className={`tab ${previewSide === 'back' ? 'active' : ''}`}
                onClick={async () => { await ensureQR(previewEmp); setPreviewSide('back'); }}>
                🔲 Back
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', paddingBottom: '0.5rem' }}>
              {previewSide === 'front' ? (
                <StaffCardFront emp={previewEmp} settings={settings} scale={1.7} />
              ) : (
                <div style={{ transform: 'scale(1.7)', transformOrigin: 'top center', marginBottom: (CARD_H_PX * 0.7) + 'px' }}>
                  <StaffCardBack emp={previewEmp} settings={settings} qrDataUrl={qrMap[qrCacheKey(previewEmp, settings.card_overrides)] ?? ''} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPreviewEmp(null)}>Close</button>
              <button className="btn btn-primary" disabled={printing} onClick={async () => {
                await ensureQR(previewEmp);
                setSelected(new Set([previewEmp.id]));
                setPreviewEmp(null);
                await handlePrintSelected();
              }}>
                {printing ? '⏳ Generating…' : '⬇ Export PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit employee card details modal ───────────────────────────────────── */}
      {editingEmp && (
        <div className="modal-overlay" onClick={() => setEditingEmp(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: 16, padding: '1.5rem', maxWidth: 520,
            width: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0 }}>✏ Card Details — {editingEmp.first_name} {editingEmp.last_name}</h3>
              <button className="modal-close" onClick={() => setEditingEmp(null)}>×</button>
            </div>

            {/* Photo upload */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem',
              background: '#f8fafc', borderRadius: 10, padding: '0.75rem', border: '1px solid #e5e7eb' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: settings.accent_color,
                border: `2px solid ${settings.accent_color}44`,
              }}>
                {editingEmp.profile_photo_url
                  ? <img src={editingEmp.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : `${editingEmp.first_name.charAt(0)}${editingEmp.last_name.charAt(0)}`
                }
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.35rem' }}>Staff Photo</div>
                <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer' }}>
                  📷 Upload Photo
                  <input type="file" accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </label>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>JPG, PNG or WebP · max 5MB</div>
              </div>
            </div>

            {/* Employee fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              {([
                ['Job Title / Designation', 'job_title'],
                ['Blood Type (e.g. O+) — hidden on card', 'blood_type'],
                ['Emergency Contact Name — hidden on card', 'emergency_contact'],
                ['Emergency Contact Phone — hidden on card', 'emergency_phone'],
              ] as [string, keyof Employee][]).map(([label, field]) => (
                <div key={field} className="form-group">
                  <label className="form-label">{label}</label>
                  <input type="text" className="form-control"
                    value={(editingEmp[field] as string) ?? ''}
                    onChange={e => setEditingEmp(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                  />
                </div>
              ))}

              {/* ── Card override settings ── */}
              <div style={{
                background: '#f8fafc', borderRadius: 10,
                padding: '0.875rem', border: '1px solid #e5e7eb',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                  🪪 Card Settings
                </div>

                {/* Access level override */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Access Level</label>
                  <select className="form-control"
                    value={editOverride.access_level ?? ROLE_ACCESS[editingEmp.role] ?? 'general'}
                    onChange={e => setEditOverride(prev => ({ ...prev, access_level: e.target.value as AccessLevel }))}>
                    {ACCESS_LEVELS.map(lvl => (
                      <option key={lvl} value={lvl}>
                        {ACCESS_CONFIG[lvl].label}
                        {lvl === (ROLE_ACCESS[editingEmp.role] ?? 'general') ? ' (default for role)' : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    Overrides the default access derived from the employee's role
                  </div>
                </div>

                {/* ── Card Lifecycle ─────────────────────────────────────────── */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.9rem 1rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.6rem', color: '#0f172a' }}>
                    Card Lifecycle
                  </div>

                  {/* Status row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.7rem' }}>
                    <div style={{
                      padding: '3px 12px', borderRadius: 20, fontWeight: 700, fontSize: '0.75rem',
                      background: editOverride.is_valid !== false ? '#dcfce7' : '#fee2e2',
                      color: editOverride.is_valid !== false ? '#16a34a' : '#dc2626',
                    }}>
                      {editOverride.is_valid !== false ? '● ACTIVE' : '● INVALIDATED'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Generation #{editOverride.card_generation ?? 1}
                      {(editOverride.card_generation ?? 1) > 1 && (
                        <span style={{ color: '#dc2626', marginLeft: 6 }}>— replacement card</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      disabled={editOverride.is_valid === false}
                      onClick={handleInvalidateCard}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: '1.5px solid #dc2626',
                        fontWeight: 600, fontSize: '0.78rem', cursor: editOverride.is_valid === false ? 'not-allowed' : 'pointer',
                        background: editOverride.is_valid === false ? '#f9fafb' : '#fff',
                        color: editOverride.is_valid === false ? '#94a3b8' : '#dc2626',
                      }}>
                      ✗ Mark as Lost / Invalidate
                    </button>
                    <button
                      onClick={handleReissueCard}
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: 'none',
                        fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                        background: '#0f172a', color: '#fff',
                      }}>
                      ↻ Issue Replacement Card
                    </button>
                  </div>

                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.6rem', lineHeight: 1.5 }}>
                    Issuing a replacement increments the card generation — any previously printed card will be
                    automatically invalidated on scan even if physically presented.
                  </div>

                  {/* Manual date overrides */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.85rem' }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                        Issue Date
                      </label>
                      <input type="date"
                        value={editOverride.issue_date ?? ''}
                        onChange={e => setEditOverride(prev => ({ ...prev, issue_date: e.target.value || undefined }))}
                        style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem' }} />
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        Leave blank to use today's date
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.25rem' }}>
                        Expiry Date
                      </label>
                      <input type="date"
                        value={editOverride.expiry_date ?? ''}
                        onChange={e => setEditOverride(prev => ({ ...prev, expiry_date: e.target.value || undefined }))}
                        style={{ width: '100%', padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem' }} />
                      <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        Leave blank to use validity years setting
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditingEmp(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEmpOverrides}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Photo crop modal ───────────────────────────────────────────────────── */}
      {cropSrc && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setCropSrc(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: 16, padding: '1.5rem',
            maxWidth: 560, width: '95vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>✂ Crop Photo</h3>
              <button className="modal-close" onClick={() => setCropSrc(null)}>×</button>
            </div>

            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Drag to reposition · resize the circle to crop · the photo will be saved as a circle
            </p>

            <div style={{
              display: 'flex', justifyContent: 'center',
              background: '#0f172a', borderRadius: 10, padding: '1rem',
              maxHeight: '55vh', overflow: 'auto',
            }}>
              <ReactCrop
                crop={crop}
                onChange={(_, pct) => setCrop(pct)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={1}
                circularCrop
                keepSelection
              >
                <img
                  ref={cropImgRef}
                  src={cropSrc}
                  alt="Crop"
                  onLoad={e => onCropImageLoad(e.currentTarget)}
                  style={{ maxWidth: '100%', maxHeight: '50vh', display: 'block' }}
                />
              </ReactCrop>
            </div>

            {/* Live preview */}
            {completedCrop && cropImgRef.current && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  overflow: 'hidden', flexShrink: 0,
                  border: `3px solid ${settings.accent_color}`,
                  background: '#e2e8f0',
                }}>
                  <CropPreview
                    img={cropImgRef.current}
                    crop={completedCrop}
                    size={80}
                  />
                </div>
                <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Preview — this is how the photo will appear on the card
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setCropSrc(null)}>Cancel</button>
              <button className="btn btn-primary"
                disabled={!completedCrop}
                onClick={handleCropConfirm}>
                Use Photo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Crop canvas preview ───────────────────────────────────────────────────────

function CropPreview({ img, crop, size }: { img: HTMLImageElement; crop: PixelCrop; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = img.naturalWidth  / img.width;
    const scaleY = img.naturalHeight / img.height;

    canvas.width  = size;
    canvas.height = size;

    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      crop.x * scaleX,
      crop.y * scaleY,
      crop.width  * scaleX,
      crop.height * scaleY,
      0, 0, size, size
    );
  }, [img, crop, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}
