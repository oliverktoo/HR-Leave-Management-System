-- Migration 061: Recruitment Module
-- Tables: job_postings, job_applications, interview_schedules
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Job Postings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_postings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  department_id     UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  job_type          TEXT NOT NULL DEFAULT 'full_time'
                      CHECK (job_type IN ('full_time', 'part_time', 'contract', 'internship', 'casual')),
  location          TEXT NOT NULL DEFAULT 'Nairobi',
  description       TEXT,
  requirements      TEXT,
  responsibilities  TEXT,
  salary_min        NUMERIC(12,2),
  salary_max        NUMERIC(12,2),
  closing_date      DATE,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'open', 'closed', 'cancelled', 'filled')),
  vacancies         INTEGER NOT NULL DEFAULT 1,
  is_internal       BOOLEAN NOT NULL DEFAULT false,  -- internal-only posting
  created_by        UUID NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_postings_status ON public.job_postings(status);
CREATE INDEX IF NOT EXISTS idx_job_postings_dept   ON public.job_postings(department_id);

-- ─── 2. Job Applications ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id    UUID NOT NULL REFERENCES public.job_postings(id) ON DELETE CASCADE,

  -- Applicant details (external OR internal staff)
  applicant_type    TEXT NOT NULL DEFAULT 'external'
                      CHECK (applicant_type IN ('internal', 'external')),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- set if internal
  full_name         TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  current_employer  TEXT,
  current_position  TEXT,
  years_experience  INTEGER,
  cover_letter      TEXT,
  cv_url            TEXT,                    -- Supabase storage path
  portfolio_url     TEXT,

  -- Pipeline stage
  status            TEXT NOT NULL DEFAULT 'applied'
                      CHECK (status IN (
                        'applied', 'shortlisted', 'interview_scheduled',
                        'interviewed', 'offered', 'accepted', 'rejected', 'withdrawn'
                      )),
  rejection_reason  TEXT,

  -- Offer details (when status = offered/accepted)
  offer_salary      NUMERIC(12,2),
  offer_start_date  DATE,
  offer_issued_at   TIMESTAMPTZ,
  offer_accepted_at TIMESTAMPTZ,
  offer_document_url TEXT,

  -- Scoring
  screening_score   INTEGER CHECK (screening_score BETWEEN 0 AND 100),
  interview_score   INTEGER CHECK (interview_score BETWEEN 0 AND 100),
  hr_notes          TEXT,

  applied_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by       UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_applications_posting ON public.job_applications(job_posting_id);
CREATE INDEX IF NOT EXISTS idx_applications_status  ON public.job_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_email   ON public.job_applications(email);

-- Prevent duplicate applications per posting per external email
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_external
  ON public.job_applications(job_posting_id, email)
  WHERE applicant_type = 'external';

-- ─── 3. Interview Schedule ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.interview_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES public.job_applications(id) ON DELETE CASCADE,
  round_number     INTEGER NOT NULL DEFAULT 1,
  interview_type   TEXT NOT NULL DEFAULT 'panel'
                     CHECK (interview_type IN ('phone', 'video', 'panel', 'technical', 'hr', 'final')),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  location         TEXT,        -- room name or video link
  interviewers     JSONB,       -- [{user_id, name}]
  status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  feedback         TEXT,
  score            INTEGER CHECK (score BETWEEN 0 AND 100),
  recommendation   TEXT CHECK (recommendation IN ('hire', 'reject', 'hold', NULL)),
  created_by       UUID NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interviews_application ON public.interview_schedules(application_id);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled   ON public.interview_schedules(scheduled_at);

-- ─── 4. Updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_job_postings_updated_at') THEN
    CREATE TRIGGER trg_job_postings_updated_at
      BEFORE UPDATE ON public.job_postings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_job_applications_updated_at') THEN
    CREATE TRIGGER trg_job_applications_updated_at
      BEFORE UPDATE ON public.job_applications
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_interview_schedules_updated_at') THEN
    CREATE TRIGGER trg_interview_schedules_updated_at
      BEFORE UPDATE ON public.interview_schedules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.job_postings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_schedules ENABLE ROW LEVEL SECURITY;

-- Job postings: HR/super_admin manage; all authenticated can view open postings
DROP POLICY IF EXISTS "job_postings_hr_all"     ON public.job_postings;
DROP POLICY IF EXISTS "job_postings_view_open"  ON public.job_postings;

CREATE POLICY "job_postings_hr_all" ON public.job_postings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid()
              AND role IN ('super_admin','hr_admin','ceo'))
  );

CREATE POLICY "job_postings_view_open" ON public.job_postings
  FOR SELECT TO authenticated
  USING (status = 'open');

-- Applications: HR sees all; applicant sees own
DROP POLICY IF EXISTS "applications_hr_all"  ON public.job_applications;
DROP POLICY IF EXISTS "applications_own"     ON public.job_applications;

CREATE POLICY "applications_hr_all" ON public.job_applications
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid()
              AND role IN ('super_admin','hr_admin','ceo','hod'))
  );

CREATE POLICY "applications_own" ON public.job_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Interview schedules: HR sees all; interviewers see their own
DROP POLICY IF EXISTS "interviews_hr_all"  ON public.interview_schedules;
DROP POLICY IF EXISTS "interviews_own"     ON public.interview_schedules;

CREATE POLICY "interviews_hr_all" ON public.interview_schedules
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid()
              AND role IN ('super_admin','hr_admin','ceo','hod'))
  );

CREATE POLICY "interviews_own" ON public.interview_schedules
  FOR SELECT TO authenticated
  USING (
    interviewers @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );

-- ─── 6. Storage bucket for CVs/resumes ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('recruitment-docs', 'recruitment-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "recruitment_docs_hr_all"    ON storage.objects;
DROP POLICY IF EXISTS "recruitment_docs_own_upload" ON storage.objects;

CREATE POLICY "recruitment_docs_hr_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'recruitment-docs' AND
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid()
              AND role IN ('super_admin','hr_admin','ceo'))
  );

CREATE POLICY "recruitment_docs_own_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recruitment-docs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

NOTIFY pgrst, 'reload schema';
