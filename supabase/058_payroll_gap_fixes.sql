-- Migration 058: Payroll gap fixes
-- 1. insurance_relief + benefits_in_kind on payroll_lines
-- 2. Auto-deactivate payroll_active when employee is deactivated
-- 3. nssf_number already on users_profile (from 030) — no schema change needed

-- ─── 1. New columns on payroll_lines ─────────────────────────────────────────

-- Benefits in Kind: non-cash taxable benefits (company car, housing, etc.)
-- Included in chargeable income for PAYE but NOT in cash gross pay or net pay.
ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS benefits_in_kind numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_lines.benefits_in_kind IS
  'Non-cash taxable benefits (BIK). Added to taxable income for PAYE; excluded from cash gross/net pay.';

-- Insurance Relief: 15% of qualifying premiums, capped at KES 5,000/month.
-- Reduces PAYE payable (additional relief on top of personal relief).
ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS insurance_relief numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payroll_lines.insurance_relief IS
  'Insurance relief = min(medical_premium * 0.15, 5000). Reduces PAYE payable per KRA guidelines.';

-- ─── 2. Auto-deactivate payroll_active when employee is deactivated ──────────
-- When HR deactivates an employee (is_active → false), they must not appear
-- in the next payroll run. Reactivation must be explicit (payroll_active stays
-- false until HR manually re-enables it).

CREATE OR REPLACE FUNCTION public.sync_payroll_active_on_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_active = false AND OLD.is_active = true THEN
    NEW.payroll_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payroll_active ON public.users_profile;
CREATE TRIGGER trg_sync_payroll_active
  BEFORE UPDATE OF is_active ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.sync_payroll_active_on_deactivation();

NOTIFY pgrst, 'reload schema';
