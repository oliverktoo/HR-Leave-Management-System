-- Migration 030: Payroll Module — Foundation
-- Phase 1: payroll_settings, users_profile payroll fields, payroll_runs, payroll_lines, payroll_audit_log

-- ─── 1. Payroll Settings (configurable statutory rates) ─────────────────────
CREATE TABLE IF NOT EXISTS public.payroll_settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key      text NOT NULL UNIQUE,
  setting_value    jsonb NOT NULL,
  description      text,
  effective_from   date NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Seed statutory rates (Kenya 2024/2025)
INSERT INTO public.payroll_settings (setting_key, setting_value, description, effective_from) VALUES

-- PAYE tax bands: array of {min, max (null = no ceiling), rate}
('paye_bands', '[
  {"min": 0,      "max": 24000,  "rate": 0.10},
  {"min": 24000,  "max": 32333,  "rate": 0.25},
  {"min": 32333,  "max": 500000, "rate": 0.30},
  {"min": 500000, "max": 800000, "rate": 0.325},
  {"min": 800000, "max": null,   "rate": 0.35}
]'::jsonb, 'PAYE income tax bands', '2024-07-01'),

-- Personal relief
('paye_personal_relief', '2400'::jsonb, 'Monthly personal relief (KES)', '2024-07-01'),

-- NSSF
('nssf_tier1_ceiling',    '7000'::jsonb,  'NSSF Tier I upper earnings limit (KES)', '2023-02-01'),
('nssf_tier2_ceiling',    '36000'::jsonb, 'NSSF Upper Earnings Limit for Tier II (KES)', '2023-02-01'),
('nssf_employee_rate',    '0.06'::jsonb,  'NSSF employee contribution rate (6%)', '2023-02-01'),
('nssf_employer_rate',    '0.06'::jsonb,  'NSSF employer contribution rate (6%)', '2023-02-01'),

-- SHA / SHIF
('sha_rate',              '0.0275'::jsonb, 'SHA/SHIF rate (2.75% of gross)', '2024-10-01'),
('sha_minimum',           '300'::jsonb,    'SHA minimum monthly contribution (KES)', '2024-10-01'),

-- Housing Levy (AHL)
('housing_levy_employee_rate', '0.015'::jsonb, 'Affordable Housing Levy employee rate (1.5%)', '2023-07-01'),
('housing_levy_employer_rate', '0.015'::jsonb, 'Affordable Housing Levy employer rate (1.5%)', '2023-07-01')

ON CONFLICT (setting_key) DO NOTHING;

-- ─── 2. Extend users_profile with payroll fields ─────────────────────────────
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS kra_pin               text,
  ADD COLUMN IF NOT EXISTS nssf_number           text,
  ADD COLUMN IF NOT EXISTS sha_number            text,
  ADD COLUMN IF NOT EXISTS helb_account          text,
  ADD COLUMN IF NOT EXISTS helb_monthly_amount   numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_name             text,
  ADD COLUMN IF NOT EXISTS bank_branch           text,
  ADD COLUMN IF NOT EXISTS bank_account_number   text,
  ADD COLUMN IF NOT EXISTS employment_type       text DEFAULT 'permanent'
                             CHECK (employment_type IN ('permanent','contract','casual','intern')),
  ADD COLUMN IF NOT EXISTS contract_start_date   date,
  ADD COLUMN IF NOT EXISTS contract_end_date     date,
  ADD COLUMN IF NOT EXISTS probation_end_date    date,
  ADD COLUMN IF NOT EXISTS salary_grade          text,
  ADD COLUMN IF NOT EXISTS basic_salary          numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allowances            jsonb DEFAULT '{}'::jsonb,
  -- e.g. {"house": 10000, "transport": 5000, "medical": 3000, "airtime": 1000}
  ADD COLUMN IF NOT EXISTS personal_email        text,
  ADD COLUMN IF NOT EXISTS payroll_active        boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users_profile.allowances IS
  'JSONB map of allowance name to monthly KES amount, e.g. {"house":10000,"transport":5000}';
COMMENT ON COLUMN public.users_profile.helb_monthly_amount IS
  'Fixed monthly HELB deduction amount per HELB deduction order (KES)';

-- ─── 3. payroll_runs ─────────────────────────────────────────────────────────
-- One record per payroll period (usually monthly)
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_year integer NOT NULL,
  pay_period_month integer NOT NULL CHECK (pay_period_month BETWEEN 1 AND 12),
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','pending_hr','pending_finance','pending_ceo','approved','rejected','paid')),
  -- Approval chain
  prepared_by     uuid REFERENCES public.users_profile(id),
  prepared_at     timestamptz,
  hr_reviewer_id  uuid REFERENCES public.users_profile(id),
  hr_approved_at  timestamptz,
  hr_comments     text,
  finance_reviewer_id uuid REFERENCES public.users_profile(id),
  finance_approved_at timestamptz,
  finance_comments text,
  ceo_reviewer_id uuid REFERENCES public.users_profile(id),
  ceo_approved_at timestamptz,
  ceo_comments    text,
  -- Totals (computed/cached when run is finalised)
  total_gross     numeric(14,2),
  total_nssf_employee numeric(14,2),
  total_sha       numeric(14,2),
  total_housing_levy_employee numeric(14,2),
  total_paye      numeric(14,2),
  total_helb      numeric(14,2),
  total_net       numeric(14,2),
  total_nssf_employer numeric(14,2),
  total_housing_levy_employer numeric(14,2),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_period_year, pay_period_month)
);

-- ─── 4. payroll_lines ────────────────────────────────────────────────────────
-- One record per employee per payroll_run
CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.users_profile(id),
  employee_id       text,                    -- snapshot of employee_id at run time
  -- Earnings
  basic_salary      numeric(12,2) NOT NULL DEFAULT 0,
  allowances        jsonb DEFAULT '{}'::jsonb,
  gross_pay         numeric(12,2) NOT NULL DEFAULT 0,
  -- Statutory deductions (employee)
  nssf_tier1        numeric(12,2) NOT NULL DEFAULT 0,
  nssf_tier2        numeric(12,2) NOT NULL DEFAULT 0,
  nssf_total        numeric(12,2) GENERATED ALWAYS AS (nssf_tier1 + nssf_tier2) STORED,
  sha_amount        numeric(12,2) NOT NULL DEFAULT 0,
  housing_levy_employee numeric(12,2) NOT NULL DEFAULT 0,
  taxable_income    numeric(12,2) NOT NULL DEFAULT 0,  -- gross - nssf
  paye_before_relief numeric(12,2) NOT NULL DEFAULT 0,
  personal_relief   numeric(12,2) NOT NULL DEFAULT 0,
  paye_amount       numeric(12,2) NOT NULL DEFAULT 0,
  helb_amount       numeric(12,2) NOT NULL DEFAULT 0,
  -- Other deductions (sacco, loan, etc.) — stored as JSONB for flexibility
  other_deductions  jsonb DEFAULT '[]'::jsonb,
  -- e.g. [{"name":"SACCO Loan","amount":5000},{"name":"Staff Advance","amount":2000}]
  total_deductions  numeric(12,2) NOT NULL DEFAULT 0,
  net_pay           numeric(12,2) NOT NULL DEFAULT 0,
  -- Employer contributions (not deducted from employee)
  nssf_employer     numeric(12,2) NOT NULL DEFAULT 0,
  housing_levy_employer numeric(12,2) NOT NULL DEFAULT 0,
  -- Flags
  is_override       boolean NOT NULL DEFAULT false,  -- true when values were manually adjusted
  override_reason   text,
  -- Leave/OOO deduction details (Phase 5)
  days_worked       integer,
  leave_days        integer DEFAULT 0,
  ooo_days          integer DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, user_id)
);

-- ─── 5. payroll_audit_log ────────────────────────────────────────────────────
-- Immutable audit trail — INSERT only, never UPDATE/DELETE
CREATE TABLE IF NOT EXISTS public.payroll_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid REFERENCES public.payroll_runs(id),
  line_id     uuid REFERENCES public.payroll_lines(id),
  actor_id    uuid REFERENCES public.users_profile(id),
  action      text NOT NULL,   -- e.g. 'run_created','line_computed','override','approved','rejected','paid'
  old_values  jsonb,
  new_values  jsonb,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Prevent updates/deletes on audit log
CREATE OR REPLACE RULE payroll_audit_no_update AS ON UPDATE TO public.payroll_audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE payroll_audit_no_delete AS ON DELETE TO public.payroll_audit_log DO INSTEAD NOTHING;

-- ─── 6. salary_grades (optional lookup) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_grades (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_code  text NOT NULL UNIQUE,     -- e.g. 'G1', 'G2', 'M1'
  grade_name  text NOT NULL,            -- e.g. 'Grade 1', 'Manager Level 1'
  basic_salary_min numeric(12,2),
  basic_salary_max numeric(12,2),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── 7. Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run_id    ON public.payroll_lines(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_user_id   ON public.payroll_lines(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_run_id    ON public.payroll_audit_log(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_audit_actor     ON public.payroll_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status     ON public.payroll_runs(status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period     ON public.payroll_runs(pay_period_year, pay_period_month);

-- ─── 8. updated_at triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_settings_updated_at') THEN
    CREATE TRIGGER trg_payroll_settings_updated_at
      BEFORE UPDATE ON public.payroll_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_runs_updated_at') THEN
    CREATE TRIGGER trg_payroll_runs_updated_at
      BEFORE UPDATE ON public.payroll_runs
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payroll_lines_updated_at') THEN
    CREATE TRIGGER trg_payroll_lines_updated_at
      BEFORE UPDATE ON public.payroll_lines
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ─── 9. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.payroll_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_grades     ENABLE ROW LEVEL SECURITY;

-- payroll_settings: read by all authenticated, write by hr_admin/super_admin
CREATE POLICY payroll_settings_read  ON public.payroll_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY payroll_settings_write ON public.payroll_settings FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid() AND role IN ('hr_admin','super_admin'))
  );

-- salary_grades: readable by all, writable by hr_admin/super_admin
CREATE POLICY salary_grades_read  ON public.salary_grades FOR SELECT TO authenticated USING (true);
CREATE POLICY salary_grades_write ON public.salary_grades FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid() AND role IN ('hr_admin','super_admin'))
  );

-- payroll_runs: hr_admin/super_admin full access; finance/ceo can see runs they need to approve
CREATE POLICY payroll_runs_admin ON public.payroll_runs FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid() AND role IN ('hr_admin','super_admin'))
  );
-- Finance reviewer can read runs pending_finance or later
CREATE POLICY payroll_runs_finance_read ON public.payroll_runs FOR SELECT TO authenticated
  USING (
    status IN ('pending_finance','pending_ceo','approved','paid')
    AND EXISTS (SELECT 1 FROM public.users_profile
                WHERE id = auth.uid() AND role IN ('finance','hr_admin','super_admin'))
  );

-- payroll_lines: hr_admin/super_admin see all; employees see only their own lines
CREATE POLICY payroll_lines_admin ON public.payroll_lines FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid() AND role IN ('hr_admin','super_admin'))
  );
CREATE POLICY payroll_lines_self ON public.payroll_lines FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- audit log: hr_admin/super_admin read only
CREATE POLICY payroll_audit_read ON public.payroll_audit_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid() AND role IN ('hr_admin','super_admin'))
  );
CREATE POLICY payroll_audit_insert ON public.payroll_audit_log FOR INSERT TO authenticated
  WITH CHECK (true);  -- allow service functions to write; rules block UPDATE/DELETE

-- ─── 10. Schema cache refresh ────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
