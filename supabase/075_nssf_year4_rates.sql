-- Migration 075: NSSF Year 4 earnings limits (effective February 2026)
-- ─────────────────────────────────────────────────────────────────────────────
-- NSSF Act 2013 phase-in, Year 4 (NSSF notice to employers, Feb 2026):
--   Lower Earnings Limit (Tier I ceiling)  KES   9,000   (was 7,000 seeded in 030)
--   Upper Earnings Limit (Tier II ceiling) KES 108,000   (was 36,000)
--   Rate unchanged: 6% employee + 6% employer
--   Max employee contribution: 540 (Tier I) + 5,940 (Tier II) = KES 6,480/month
--
-- Note: payroll settings are not date-versioned in the app — recomputing a
-- payroll run for a month before February 2026 will also use these limits.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.payroll_settings
SET setting_value = '9000'::jsonb,
    description   = 'NSSF Lower Earnings Limit / Tier I ceiling (KES) — Year 4',
    effective_from = '2026-02-01'
WHERE setting_key = 'nssf_tier1_ceiling';

UPDATE public.payroll_settings
SET setting_value = '108000'::jsonb,
    description   = 'NSSF Upper Earnings Limit / Tier II ceiling (KES) — Year 4',
    effective_from = '2026-02-01'
WHERE setting_key = 'nssf_tier2_ceiling';
