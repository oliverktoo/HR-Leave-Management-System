-- Migration 078: Salary arrears (back pay)
-- ─────────────────────────────────────────────────────────────────────────────
-- Back pay is taxed by spreading it back to the months it relates to: each
-- month's tax is recomputed at the rates then in force and the extra tax is
-- deducted when paid (KRA). Arrears older than four years before the year of
-- payment are treated as income of the fifth year back.
--
--   payroll_lines.arrears_amount / arrears_paye — what this payslip carries
--   payroll_arrears — each arrears entry with its month-by-month working (the
--                     record to keep for KRA). HR admin / super admin manage;
--                     finance, CEO and auditor can read.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS arrears_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrears_paye   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrears_sha    numeric(12,2) NOT NULL DEFAULT 0,   -- part of sha_amount charged on arrears
  ADD COLUMN IF NOT EXISTS arrears_housing_levy numeric(12,2) NOT NULL DEFAULT 0;  -- part of housing_levy_employee

CREATE TABLE IF NOT EXISTS public.payroll_arrears (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  line_id       uuid NOT NULL REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users_profile(id),
  description   text NOT NULL,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  from_month    date NOT NULL,     -- first day of the first month the arrears relate to
  to_month      date NOT NULL,     -- first day of the last month
  breakdown     jsonb NOT NULL,    -- per month: share, base taxable pay (+source), tax before/after, extra
  extra_paye    numeric(12,2) NOT NULL DEFAULT 0,   -- PAYE share of this entry
  created_by    uuid REFERENCES public.users_profile(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_month <= to_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_arrears_line ON public.payroll_arrears(line_id);
CREATE INDEX IF NOT EXISTS idx_payroll_arrears_user ON public.payroll_arrears(user_id);

ALTER TABLE public.payroll_arrears ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_arrears FROM anon;

DROP POLICY IF EXISTS payroll_arrears_hr ON public.payroll_arrears;
CREATE POLICY payroll_arrears_hr ON public.payroll_arrears FOR ALL TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin', 'super_admin']))
  WITH CHECK (public.auth_has_role(ARRAY['hr_admin', 'super_admin']));

DROP POLICY IF EXISTS payroll_arrears_oversight_read ON public.payroll_arrears;
CREATE POLICY payroll_arrears_oversight_read ON public.payroll_arrears FOR SELECT TO authenticated
  USING (public.auth_has_role(ARRAY['finance', 'ceo', 'auditor']));

COMMIT;

NOTIFY pgrst, 'reload schema';
