-- Migration 046: Benefits Administration

CREATE TABLE IF NOT EXISTS public.employee_benefits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  benefit_type          TEXT NOT NULL
                          CHECK (benefit_type IN (
                            'health_insurance','nssf_tier2','helb','group_life',
                            'personal_accident','pension','other'
                          )),
  scheme_name           TEXT,
  provider              TEXT,
  policy_number         TEXT,
  cover_level           TEXT,                         -- e.g. 'individual', 'family', '3x salary'
  employee_contribution NUMERIC(12,2),               -- monthly KES employee portion
  employer_contribution NUMERIC(12,2),               -- monthly KES employer portion
  effective_date        DATE,
  expiry_date           DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  details               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- flexible extra fields (helb_balance, loan_ref, etc.)
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_benefits_user   ON public.employee_benefits(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_benefits_type   ON public.employee_benefits(benefit_type);
CREATE INDEX IF NOT EXISTS idx_emp_benefits_active ON public.employee_benefits(is_active) WHERE is_active = true;

ALTER TABLE public.employee_benefits ENABLE ROW LEVEL SECURITY;

-- HR full access
CREATE POLICY "benefits_hr_all" ON public.employee_benefits FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role IN ('hr_admin','super_admin')));

-- Employee reads own
CREATE POLICY "benefits_own_read" ON public.employee_benefits FOR SELECT TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
