-- Migration 050: Selfie Clock-In & Face Verification
-- Adds selfie capture to field clock-in and regular attendance check-in.

-- ─── Storage bucket for selfies ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-selfies',
  'attendance-selfies',
  false,
  5242880,  -- 5 MB per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Employees can upload their own selfies
DROP POLICY IF EXISTS "selfie_upload_own" ON storage.objects;
CREATE POLICY "selfie_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attendance-selfies'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Employees can read their own selfies
DROP POLICY IF EXISTS "selfie_read_own" ON storage.objects;
CREATE POLICY "selfie_read_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-selfies'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- HR, supervisors, auditors can read all selfies
DROP POLICY IF EXISTS "selfie_read_admin" ON storage.objects;
CREATE POLICY "selfie_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'attendance-selfies'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin', 'hod', 'auditor')
    )
  );

-- HR can delete selfies (GDPR compliance)
DROP POLICY IF EXISTS "selfie_delete_admin" ON storage.objects;
CREATE POLICY "selfie_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'attendance-selfies'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- ─── attendance_records: add selfie + verification columns ───────────────────
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS selfie_url         text,
  ADD COLUMN IF NOT EXISTS selfie_verified    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selfie_verified_by uuid     REFERENCES public.users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selfie_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS selfie_flagged     boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selfie_flag_reason text,
  ADD COLUMN IF NOT EXISTS face_match_score   float,        -- 0.0 = identical, 0.6+ = mismatch
  ADD COLUMN IF NOT EXISTS face_verified_auto boolean  NOT NULL DEFAULT false;

-- ─── field_clock_logs: add verification columns ──────────────────────────────
-- clock_in_photo_url already exists — add verification columns
ALTER TABLE public.field_clock_logs
  ADD COLUMN IF NOT EXISTS selfie_verified    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selfie_verified_by uuid     REFERENCES public.users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selfie_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS selfie_flagged     boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS selfie_flag_reason text,
  ADD COLUMN IF NOT EXISTS face_match_score   float,
  ADD COLUMN IF NOT EXISTS face_verified_auto boolean  NOT NULL DEFAULT false;

-- ─── users_profile: registered face data ─────────────────────────────────────
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS face_descriptor   jsonb;    -- 128-point float array from face-api.js

-- ─── Index for quick selfie verification queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_selfie_unverified
  ON public.attendance_records (selfie_verified, selfie_flagged)
  WHERE selfie_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_field_clock_selfie_unverified
  ON public.field_clock_logs (selfie_verified, selfie_flagged)
  WHERE clock_in_photo_url IS NOT NULL;

NOTIFY pgrst, 'reload schema';
