-- Migration 081: Non-statutory deduction columns on payroll_lines
-- ─────────────────────────────────────────────────────────────────────────────
-- 057 added SACCO / medical premium / supplementary pension / salary advance to
-- users_profile, but never to payroll_lines, where each run stores the amounts
-- actually deducted. Computing a run in the app writes these columns, so it
-- failed ("Create & Compute" left an empty draft run). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS sacco_contribution      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sacco_loan_repayment    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_premium         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_pension   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_advance_recovery numeric(12,2) NOT NULL DEFAULT 0;

-- Let PostgREST see the new columns straight away.
NOTIFY pgrst, 'reload schema';
