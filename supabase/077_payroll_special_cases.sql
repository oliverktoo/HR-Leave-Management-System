-- Migration 077: PAYE special cases + per diem per the law
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds what payroll needs to apply the Kenyan rules below. Every legal limit is a
-- payroll setting, so payroll can follow a change in the law without code.
--
--   Per diem        ITA s.5(2)(a): up to KES 10,000 per day away on official duty is
--                   a tax-free reimbursement (Finance Act 2025, from 1 Jul 2025).
--                   ► Confirm with KRA; editable as per_diem_daily_exempt.
--   Benefits in kind  tax-free when aggregate ≤ KES 60,000/yr (Tax Laws (Amendment) Act 2024)
--   Pension         deductible up to KES 30,000/month (TLAA 2024)
--   Mortgage interest (owner-occupied) deductible up to KES 360,000/yr = 30,000/month (TLAA 2024)
--   Post-retirement medical fund  deductible up to KES 15,000/month (KRA notice 2157)
--   Disability      first KES 150,000/month exempt with a valid KRA exemption certificate
--   Non-resident    normal bands, no personal or insurance relief (KRA)
--   Secondary employment  highest rate (35%) on whole taxable pay, no deductions or
--                   reliefs — those are claimed at the main employer
--
-- Profile fields are HR-only (072's column guard). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Employee tax circumstances ────────────────────────────────────────────
ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS tax_residency text NOT NULL DEFAULT 'resident',
  ADD COLUMN IF NOT EXISTS tax_employment_category text NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS disability_exemption_cert_no text,
  ADD COLUMN IF NOT EXISTS disability_exemption_expiry date,
  ADD COLUMN IF NOT EXISTS mortgage_interest_monthly numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_retirement_medical_monthly numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.users_profile DROP CONSTRAINT IF EXISTS chk_tax_residency;
ALTER TABLE public.users_profile ADD CONSTRAINT chk_tax_residency
  CHECK (tax_residency IN ('resident', 'non_resident'));
ALTER TABLE public.users_profile DROP CONSTRAINT IF EXISTS chk_tax_employment_category;
ALTER TABLE public.users_profile ADD CONSTRAINT chk_tax_employment_category
  CHECK (tax_employment_category IN ('primary', 'secondary'));

-- ─── 2. What was applied, per payslip line (for payslips, P9 and audit) ───────
ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS per_diem_days numeric(6,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_diem_exempt numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bik_taxable numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pension_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mortgage_interest_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prmf_deduction numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS disability_exemption numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_basis text;

-- ─── 3. Statutory limits as payroll settings ──────────────────────────────────
INSERT INTO public.payroll_settings (setting_key, setting_value, description, effective_from) VALUES
  ('per_diem_daily_exempt',          '10000'::jsonb,  'Tax-free per diem per day on official duty away from usual place of work (ITA s.5(2)(a), Finance Act 2025) — confirm with KRA', '2025-07-01'),
  ('bik_annual_exempt',              '60000'::jsonb,  'Non-cash benefits tax-free when aggregate value per year is at or below this (Tax Laws (Amendment) Act 2024)', '2024-12-27'),
  ('pension_deduction_cap_monthly',  '30000'::jsonb,  'Registered pension contributions incl. NSSF deductible per month (TLAA 2024)', '2024-12-27'),
  ('mortgage_interest_cap_monthly',  '30000'::jsonb,  'Owner-occupier mortgage interest deductible per month — KES 360,000/yr (TLAA 2024)', '2024-12-27'),
  ('prmf_cap_monthly',               '15000'::jsonb,  'Post-retirement medical fund contributions deductible per month (TLAA 2024)', '2024-12-27'),
  ('disability_exemption_monthly',   '150000'::jsonb, 'Persons with disability: income exempt per month with a valid KRA exemption certificate', '2010-01-01'),
  ('secondary_employment_rate',      '0.35'::jsonb,   'Secondary employment: PAYE rate on whole taxable pay, no reliefs (highest band)', '2023-07-01'),
  ('insurance_relief_rate',          '0.15'::jsonb,   'Insurance relief as a share of qualifying premiums', '2024-12-27'),
  ('insurance_relief_cap_monthly',   '5000'::jsonb,   'Maximum insurance relief per month', '2024-12-27')
ON CONFLICT (setting_key) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
