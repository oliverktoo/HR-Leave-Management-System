-- Migration 065: Attendance Notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- Fires in-app notifications for two attendance events:
--   1. Late check-in  → when a new attendance record has status = 'late'
--   2. Auto check-out → when auto_checked_out flips to true on an existing record
-- Both notify the employee themselves so they're aware of the record.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_attendance_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
  v_checkout   TEXT;
BEGIN

  -- Resolve users_profile.id from the auth user_id stored in attendance_records
  SELECT id, first_name || ' ' || last_name
  INTO   v_profile_id, v_name
  FROM   public.users_profile
  WHERE  id = NEW.user_id
  LIMIT  1;

  IF v_profile_id IS NULL THEN
    RETURN NEW; -- unknown user — skip silently
  END IF;

  -- ── INSERT: new attendance record ─────────────────────────────────────────
  IF TG_OP = 'INSERT' AND NEW.status = 'late' THEN
    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      v_profile_id,
      'Late Check-In Recorded',
      'Your check-in at ' ||
        to_char(NEW.check_in_time AT TIME ZONE 'Africa/Nairobi', 'HH24:MI') ||
        ' on ' ||
        to_char(NEW.date, 'Mon DD, YYYY') ||
        ' has been marked as late.',
      'attendance',
      false
    );
    RETURN NEW;
  END IF;

  -- ── UPDATE: auto checkout applied ─────────────────────────────────────────
  IF TG_OP = 'UPDATE'
     AND NEW.auto_checked_out = true
     AND (OLD.auto_checked_out IS DISTINCT FROM true)
     AND NEW.check_out_time IS NOT NULL
  THEN
    v_checkout := to_char(NEW.check_out_time AT TIME ZONE 'Africa/Nairobi', 'HH24:MI');

    INSERT INTO public.notifications (user_id, title, message, type, is_read)
    VALUES (
      v_profile_id,
      'Auto Check-Out Applied',
      'You were automatically checked out at ' || v_checkout ||
        ' on ' || to_char(NEW.date, 'Mon DD, YYYY') ||
        '. Please verify your working hours or contact HR if this is incorrect.',
      'attendance',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach to attendance_records
DROP TRIGGER IF EXISTS trg_attendance_notifications ON public.attendance_records;
CREATE TRIGGER trg_attendance_notifications
  AFTER INSERT OR UPDATE OF auto_checked_out, status
  ON public.attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_attendance_event();

NOTIFY pgrst, 'reload schema';
