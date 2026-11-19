-- Migration 059: Auto-checkout diagnostics & fixes
-- Run this in Supabase SQL Editor to check and repair the auto-checkout setup.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Check if the function exists ─────────────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('auto_checkout_absent_staff', 'flag_presence_gaps');

-- ─── 2. Check if pg_cron extension is enabled ────────────────────────────────
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'pg_cron';
-- If no row returned: pg_cron is NOT enabled.
-- Enable via: Supabase Dashboard → Database → Extensions → search "pg_cron" → Enable

-- ─── 3. Check scheduled cron jobs ────────────────────────────────────────────
-- (Only works if pg_cron is enabled)
-- SELECT jobname, schedule, command, active FROM cron.job;

-- ─── 4. Check recent auto-checkout runs ──────────────────────────────────────
-- (Only works if pg_cron is enabled)
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ─── 5. Check attendance_records columns ─────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'attendance_records'
  AND column_name IN ('auto_checked_out', 'presence_gap_flagged', 'last_office_presence');

-- ─── 6. Check system_settings for auto_checkout_hour ────────────────────────
SELECT settings->>'auto_checkout_hour' AS auto_checkout_hour
FROM public.system_settings
WHERE id = 1;

-- ─── 7. See today's open records (not yet checked out) ───────────────────────
SELECT
  ar.id,
  up.first_name || ' ' || up.last_name AS staff_name,
  ar.check_in_time AT TIME ZONE 'Africa/Nairobi' AS check_in_eat,
  ar.check_out_time,
  ar.last_office_presence AT TIME ZONE 'Africa/Nairobi' AS last_presence_eat,
  ar.auto_checked_out
FROM public.attendance_records ar
JOIN public.users_profile up ON up.id = ar.user_id
WHERE ar.date = CURRENT_DATE
  AND ar.check_out_time IS NULL
ORDER BY ar.check_in_time;

-- ─── 8. MANUAL TRIGGER: run auto-checkout right now ─────────────────────────
-- Uncomment and run this to manually trigger auto-checkout for testing:
-- SELECT public.auto_checkout_absent_staff();

-- ─── 9. Re-schedule pg_cron job (if pg_cron IS enabled) ──────────────────────
-- SELECT cron.unschedule('auto_checkout_absent_staff');
-- SELECT cron.schedule(
--   'auto_checkout_absent_staff',
--   '0 17 * * *',   -- 17:00 UTC = 20:00 EAT every day
--   $$ SELECT public.auto_checkout_absent_staff(); $$
-- );

-- ─── 10. Grant RPC access so Edge Function can call it ───────────────────────
GRANT EXECUTE ON FUNCTION public.auto_checkout_absent_staff() TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_presence_gaps() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_checkout_absent_staff() TO authenticated;
