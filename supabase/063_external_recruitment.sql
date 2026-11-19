-- Migration 063: External / Public Recruitment Access
-- Allows anonymous (unauthenticated) users to:
--   • View open, non-internal job postings
--   • Submit applications to those postings
--   • Upload CVs to the recruitment-docs storage bucket
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Anon can view open, external job postings ────────────────────────────
DROP POLICY IF EXISTS "job_postings_anon_view" ON public.job_postings;
CREATE POLICY "job_postings_anon_view" ON public.job_postings
  FOR SELECT TO anon
  USING (status = 'open' AND is_internal = false);

-- ─── 2. Anon can submit applications to open, external postings ───────────────
DROP POLICY IF EXISTS "applications_anon_insert" ON public.job_applications;
CREATE POLICY "applications_anon_insert" ON public.job_applications
  FOR INSERT TO anon
  WITH CHECK (
    applicant_type = 'external'
    AND EXISTS (
      SELECT 1 FROM public.job_postings
      WHERE id = job_posting_id
        AND status = 'open'
        AND is_internal = false
    )
  );

-- ─── 3. Anon CV uploads → external/ folder in recruitment-docs bucket ─────────
-- HR can read all (covered by existing recruitment_docs_hr_all policy).
-- Anon can only INSERT, not read — no data leakage.
DROP POLICY IF EXISTS "recruitment_docs_anon_upload" ON storage.objects;
CREATE POLICY "recruitment_docs_anon_upload" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'recruitment-docs'
    AND (storage.foldername(name))[1] = 'external'
  );

NOTIFY pgrst, 'reload schema';
