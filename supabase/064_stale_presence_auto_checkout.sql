-- Migration 064: Disable auto-checkout cron jobs
-- ─────────────────────────────────────────────────────────────────────────────
-- Decision: Do not auto-checkout employees. Staff who forget to check out
-- remain as "not checked out" for HR to review and correct manually.
-- The auto_checkout_absent_staff function is kept but not scheduled.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the 8pm daily auto-checkout job (added in migration 058)
SELECT cron.unschedule('auto_checkout_absent_staff')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_checkout_absent_staff');

-- Remove the stale-presence job if it was ever scheduled
SELECT cron.unschedule('auto_checkout_stale_presence')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_checkout_stale_presence');

-- Verify no checkout jobs remain
SELECT jobname, schedule FROM cron.job
WHERE jobname IN ('auto_checkout_absent_staff', 'auto_checkout_stale_presence');
