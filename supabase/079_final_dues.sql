-- Migration 079: Final dues on leaving + exit request access fix
-- ─────────────────────────────────────────────────────────────────────────────
-- Final dues are paid on the leaver's last payslip. Tax treatment (KRA):
--   salary to last day, notice pay, leave pay  → ordinary pay of the final month
--   severance (redundancy)                    → lump sum, KRA annual lump-sum method in the year paid
--   gratuity earned before 1 Jul 2025         → spread back to the months earned, up to 4 years
--   gratuity earned from 1 Jul 2025           → tax-free (Finance Act 2025, KRA notice 2246)
--   compensation for loss of office           → spread forward (unexpired fixed term, or 3 years)
--
--   payroll_lines.*            the amounts on the final payslip; terminal_paye = PAYE on the lump sums
--   final_dues                 inputs and tax working per leaver (record for KRA / audit)
--
-- Also fixes exit_requests: policy "staff_own_exit" was FOR ALL, so an employee
-- could change their own request's status, clearance checklist (incl. "Final
-- payroll processed") and HR notes. Staff can now only submit and view.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS leave_pay           numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notice_pay          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS severance_pay       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gratuity_amount     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gratuity_exempt     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensation_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terminal_paye       numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.final_dues (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id            uuid NOT NULL UNIQUE REFERENCES public.payroll_lines(id) ON DELETE CASCADE,
  run_id             uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.users_profile(id),
  exit_request_id    uuid REFERENCES public.exit_requests(id) ON DELETE SET NULL,
  last_working_date  date NOT NULL,
  days_worked        numeric(5,1) NOT NULL,          -- working days paid in the final month
  inputs             jsonb NOT NULL,                 -- leave days, daily rate, notice months, gratuity period, …
  tax_working        jsonb NOT NULL,                 -- severance / gratuity / compensation tax detail
  terminal_paye      numeric(12,2) NOT NULL DEFAULT 0,
  created_by         uuid REFERENCES public.users_profile(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_final_dues_user ON public.final_dues(user_id);

ALTER TABLE public.final_dues ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.final_dues FROM anon;

DROP POLICY IF EXISTS final_dues_hr ON public.final_dues;
CREATE POLICY final_dues_hr ON public.final_dues FOR ALL TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin', 'super_admin']))
  WITH CHECK (public.auth_has_role(ARRAY['hr_admin', 'super_admin']));

DROP POLICY IF EXISTS final_dues_oversight_read ON public.final_dues;
CREATE POLICY final_dues_oversight_read ON public.final_dues FOR SELECT TO authenticated
  USING (public.auth_has_role(ARRAY['finance', 'ceo', 'auditor']));

-- ─── exit_requests: staff may submit and view their own, nothing more ────────
DROP POLICY IF EXISTS "staff_own_exit" ON public.exit_requests;
DROP POLICY IF EXISTS staff_own_exit_read ON public.exit_requests;
DROP POLICY IF EXISTS staff_own_exit_submit ON public.exit_requests;

CREATE POLICY staff_own_exit_read ON public.exit_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY staff_own_exit_submit ON public.exit_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND acknowledged_by IS NULL AND acknowledged_at IS NULL AND completed_at IS NULL
    AND NOT exit_interview_done AND hr_notes IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(clearance_items) c WHERE (c->>'cleared')::boolean)
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
