-- Migration 015: Schedule Auto-Checkout Cron Jobs
-- Activates the end-of-day and grace-period auto-checkout functions
-- that were defined in add_auto_checkout_features.sql

-- Enable pg_cron extension (requires Supabase Pro or pg_cron enabled in project settings)
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── REMOVE OLD JOBS (safe to run repeatedly) ────────────────────────────────
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('auto-checkout-hourly', 'auto-checkout-grace-period');

-- ── JOB 1: END-OF-DAY AUTO-CHECKOUT ─────────────────────────────────────────
-- Runs every hour at :00. The function itself checks whether the configured
-- checkout time has passed before doing anything, so running hourly is safe.
SELECT cron.schedule(
  'auto-checkout-hourly',     -- job name
  '0 * * * *',                -- every hour at :00
  $$
    SELECT auto_checkout_end_of_day();
  $$
);

-- ── JOB 2: GRACE-PERIOD AUTO-CHECKOUT ───────────────────────────────────────
-- Runs every hour at :30. Checks out anyone who has been checked in for
-- longer than grace_period_hours (default 9h) without checking out.
SELECT cron.schedule(
  'auto-checkout-grace-period',  -- job name
  '30 * * * *',                  -- every hour at :30
  $$
    SELECT auto_checkout_grace_period();
  $$
);

-- ── VERIFY JOBS WERE CREATED ─────────────────────────────────────────────────
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname IN ('auto-checkout-hourly', 'auto-checkout-grace-period');

-- ── NOTES ────────────────────────────────────────────────────────────────────
-- To manually run both auto-checkouts immediately:
--   SELECT * FROM run_auto_checkouts();
--
-- To check recent cron run history:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- To disable a job without deleting it:
--   UPDATE cron.job SET active = false WHERE jobname = 'auto-checkout-hourly';
--
-- To re-enable:
--   UPDATE cron.job SET active = true WHERE jobname = 'auto-checkout-hourly';
--
-- To remove jobs entirely:
--   SELECT cron.unschedule('auto-checkout-hourly');
--   SELECT cron.unschedule('auto-checkout-grace-period');
--
-- REQUIREMENT: pg_cron must be enabled in your Supabase project.
-- Go to: Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable
