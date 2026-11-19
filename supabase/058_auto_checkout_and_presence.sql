-- Migration 058: Auto-checkout, configurable cutoff, missed-checkout tracking
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add auto_checkout_cutoff_hour to system_settings (default 20 = 8pm)
-- 2. Add auto_checkout flag + missed_checkout flag to attendance_records
-- 3. Function: auto_checkout_absent_staff() — runs via pg_cron
-- 4. Schedule pg_cron job at 8pm EAT (17:00 UTC) every weekday
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. System settings — store configurable cutoff hour ─────────────────────
-- Merges into existing single-row system_settings (id=1)
UPDATE public.system_settings
SET settings = settings || '{"auto_checkout_hour": 20}'::jsonb
WHERE id = 1;

-- ─── 2. New columns on attendance_records ────────────────────────────────────

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS auto_checked_out     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS presence_gap_flagged  boolean NOT NULL DEFAULT false;
  -- auto_checked_out: set true when pg_cron closes the record
  -- presence_gap_flagged: set true when last_office_presence is stale (>30min old but still checked in)

COMMENT ON COLUMN public.attendance_records.auto_checked_out IS
  'True if the system automatically checked out this employee (8pm cutoff or similar).';

COMMENT ON COLUMN public.attendance_records.presence_gap_flagged IS
  'True if last_office_presence was >30min old when auto-checkout ran — presence is unconfirmed.';

-- ─── 3. Core auto-checkout function ──────────────────────────────────────────
-- Closes all open attendance records where:
--   a) employee has not checked out yet today
--   b) current time >= auto_checkout_hour (default 20:00 EAT)
-- Uses last_office_presence as checkout time if it was recorded today,
-- otherwise uses (cutoff hour - 1) as a conservative fallback.

CREATE OR REPLACE FUNCTION public.auto_checkout_absent_staff()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff_hour   integer;
  v_today         date;
  v_now           timestamptz;
  v_cutoff_ts     timestamptz;
  v_fallback_time timestamptz;
  v_rec           record;
  v_checkout_time timestamptz;
  v_note          text;
  v_flagged       boolean;
  v_hours_worked  numeric;
BEGIN
  v_now   := now();
  -- Use EAT date — attendance_records.date is stored as the local (EAT) check-in date
  v_today := (v_now AT TIME ZONE 'Africa/Nairobi')::date;

  -- Read configurable cutoff hour from system_settings (default 20 = 8pm EAT)
  SELECT COALESCE(
    (settings->>'auto_checkout_hour')::integer, 20
  )
  INTO v_cutoff_hour
  FROM public.system_settings
  WHERE id = 1;

  -- Build cutoff as EAT → UTC timestamptz.
  -- `::timestamp AT TIME ZONE 'Africa/Nairobi'` treats the literal as local EAT
  -- and converts correctly to UTC (not the other way around).
  v_cutoff_ts     := (v_today::text || ' ' || v_cutoff_hour::text        || ':00:00')::timestamp AT TIME ZONE 'Africa/Nairobi';
  v_fallback_time := (v_today::text || ' ' || (v_cutoff_hour - 1)::text  || ':00:00')::timestamp AT TIME ZONE 'Africa/Nairobi';

  -- Only run if current time >= cutoff (both are proper UTC timestamptz)
  IF v_now < v_cutoff_ts THEN
    RETURN;
  END IF;

  -- Loop over all open records for today
  FOR v_rec IN
    SELECT
      ar.id,
      ar.user_id,
      ar.check_in_time,
      ar.last_office_presence,
      ar.notes
    FROM public.attendance_records ar
    WHERE ar.date = v_today
      AND ar.check_out_time IS NULL
      AND ar.auto_checked_out = false
  LOOP
    v_flagged := false;

    -- Decide checkout time
    IF v_rec.last_office_presence IS NOT NULL
       AND (v_rec.last_office_presence AT TIME ZONE 'Africa/Nairobi')::date = v_today
    THEN
      -- Use last confirmed office presence
      v_checkout_time := v_rec.last_office_presence;

      -- Flag if last presence was more than 30 minutes before cutoff (gap)
      IF v_cutoff_ts - v_rec.last_office_presence > interval '30 minutes' THEN
        v_flagged := true;
        v_note := format(
          'System auto-checkout at %s EAT (cutoff). Last confirmed at office: %s. Presence gap >30min — HR review recommended.',
          to_char(v_now AT TIME ZONE 'Africa/Nairobi', 'HH24:MI'),
          to_char(v_rec.last_office_presence AT TIME ZONE 'Africa/Nairobi', 'HH24:MI')
        );
      ELSE
        v_note := format(
          'System auto-checkout. Last confirmed at office: %s EAT.',
          to_char(v_rec.last_office_presence AT TIME ZONE 'Africa/Nairobi', 'HH24:MI')
        );
      END IF;
    ELSE
      -- No presence data — use fallback (cutoff - 1 hour) as conservative estimate
      v_checkout_time := v_fallback_time;
      v_flagged       := true;
      v_note := format(
        'System auto-checkout at %s EAT (cutoff). No office presence recorded — checkout set to %s as conservative estimate. HR review required.',
        to_char(v_now AT TIME ZONE 'Africa/Nairobi', 'HH24:MI'),
        to_char(v_fallback_time AT TIME ZONE 'Africa/Nairobi', 'HH24:MI')
      );
    END IF;

    -- Calculate hours worked
    v_hours_worked := EXTRACT(EPOCH FROM (v_checkout_time - v_rec.check_in_time)) / 3600.0;

    -- Update the record
    UPDATE public.attendance_records
    SET
      check_out_time       = v_checkout_time,
      auto_checked_out     = true,
      presence_gap_flagged = v_flagged,
      work_hours           = ROUND(v_hours_worked::numeric, 2),
      notes                = CASE
                               WHEN v_rec.notes IS NOT NULL AND v_rec.notes != ''
                               THEN v_rec.notes || ' | ' || v_note
                               ELSE v_note
                             END,
      updated_at           = now()
    WHERE id = v_rec.id;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_checkout_absent_staff() TO service_role;

-- ─── 4. pg_cron schedule — 8pm EAT = 17:00 UTC every day ────────────────────
-- Enable pg_cron extension (requires superuser; run in Supabase SQL editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any existing job with this name
SELECT cron.unschedule('auto_checkout_absent_staff') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto_checkout_absent_staff'
);

-- Schedule: 17:00 UTC = 20:00 EAT, every day
SELECT cron.schedule(
  'auto_checkout_absent_staff',
  '0 17 * * *',
  $$ SELECT public.auto_checkout_absent_staff(); $$
);

-- ─── 5. Presence gap detection function ──────────────────────────────────────
-- Called by the frontend (via RPC) to flag stale presence on still-open records.
-- Run client-side every 10 min alongside the presence ping.

CREATE OR REPLACE FUNCTION public.flag_presence_gaps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.attendance_records
  SET presence_gap_flagged = true
  WHERE date = CURRENT_DATE
    AND check_out_time IS NULL
    AND last_office_presence IS NOT NULL
    AND now() - last_office_presence > interval '30 minutes';
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_presence_gaps() TO authenticated;

-- ─── 6. View: missed checkouts for admin report ───────────────────────────────

CREATE OR REPLACE VIEW public.v_missed_checkouts AS
SELECT
  ar.id,
  ar.date,
  ar.user_id,
  up.employee_id,
  up.first_name,
  up.last_name,
  d.name                                    AS department_name,
  ar.check_in_time,
  ar.check_out_time,
  ar.work_hours,
  ar.auto_checked_out,
  ar.presence_gap_flagged,
  ar.last_office_presence,
  ar.notes
FROM public.attendance_records ar
JOIN public.users_profile up ON up.id = ar.user_id
LEFT JOIN public.departments d ON d.id = up.department_id
WHERE ar.auto_checked_out = true
   OR (ar.date < CURRENT_DATE AND ar.check_out_time IS NULL)
ORDER BY ar.date DESC, up.last_name;

GRANT SELECT ON public.v_missed_checkouts TO authenticated;

NOTIFY pgrst, 'reload schema';
