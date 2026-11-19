-- Migration 060: Fix auto-checkout timezone bug + backfill missed records
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: v_now and v_cutoff_ts were both shifted +3h because:
--   `now() AT TIME ZONE 'Africa/Nairobi'` on a timestamptz variable returns a
--   timestamp (local time) which PostgreSQL then implicitly casts back to
--   timestamptz using the session tz (UTC) — so 20:00 EAT became 20:00 UTC.
--   The guard `v_now < v_cutoff_ts` was comparing 20:00 UTC < 23:00 UTC = TRUE
--   and exiting early every night without checking anyone out.
--
-- Fix: keep all variables as proper timestamptz (UTC).
--   Use `timestamp AT TIME ZONE zone` (local→UTC) for building EAT cutoffs.
--   Use `now()` directly for current time.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Build cutoff as a proper EAT → UTC timestamptz.
  -- `::timestamp AT TIME ZONE 'Africa/Nairobi'` treats the literal as local EAT
  -- and converts to UTC — the correct direction.
  v_cutoff_ts     := (v_today::text || ' ' || v_cutoff_hour::text     || ':00:00')::timestamp AT TIME ZONE 'Africa/Nairobi';
  v_fallback_time := (v_today::text || ' ' || (v_cutoff_hour - 1)::text || ':00:00')::timestamp AT TIME ZONE 'Africa/Nairobi';

  -- Only run if current time >= cutoff (both are now proper UTC timestamptz)
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
      -- Use last confirmed office presence as checkout time
      v_checkout_time := v_rec.last_office_presence;

      -- Flag if last presence was more than 30 minutes before cutoff (unexplained gap)
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
      -- No presence data — use fallback (cutoff - 1h) as conservative estimate
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
GRANT EXECUTE ON FUNCTION public.auto_checkout_absent_staff() TO authenticated;

-- ─── Backfill: close the 5 missed records from 2026-04-09 ────────────────────
-- Uses 19:00 EAT as fallback (cutoff-1) since no presence data was recorded.
UPDATE public.attendance_records ar
SET
  check_out_time       = '2026-04-09 19:00:00 Africa/Nairobi'::timestamptz,
  auto_checked_out     = true,
  presence_gap_flagged = true,
  work_hours           = ROUND(
    EXTRACT(EPOCH FROM (
      '2026-04-09 19:00:00 Africa/Nairobi'::timestamptz - ar.check_in_time
    )) / 3600.0
  , 2),
  notes                = COALESCE(ar.notes || ' | ', '') ||
    'System auto-checkout (backfill). No office presence recorded — checkout set to 19:00 EAT as conservative estimate. HR review required.',
  updated_at           = now()
WHERE ar.date = '2026-04-09'
  AND ar.check_out_time IS NULL
  AND ar.auto_checked_out = false;

-- Verify backfill
SELECT
  up.first_name || ' ' || up.last_name AS staff,
  ar.check_out_time AT TIME ZONE 'Africa/Nairobi' AS checkout_eat,
  ar.auto_checked_out,
  ar.presence_gap_flagged,
  ar.work_hours
FROM attendance_records ar
JOIN users_profile up ON up.id = ar.user_id
WHERE ar.date = '2026-04-09'
  AND ar.auto_checked_out = true
ORDER BY ar.check_in_time;
