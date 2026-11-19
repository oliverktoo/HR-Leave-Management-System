-- Migration 056: Wire email notifications end-to-end
-- ─────────────────────────────────────────────────────────────────────────────
-- Uses pg_net (built into Supabase) for async, non-blocking Edge Function calls.
-- Replaces the previous synchronous http() approach which could block transactions.
-- Covers: leave (all stages) + fleet trip events.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Enable pg_net (async HTTP — already on in Supabase, just ensure it) ──

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 2. Core helper: async POST to send-email Edge Function ──────────────────
-- Called from triggers. Non-blocking — failure is warned, never throws.
-- Deploy the Edge Function with --no-verify-jwt so no auth header is needed.

CREATE OR REPLACE FUNCTION call_send_email_function(
  p_event_type TEXT,
  p_entity_type TEXT,   -- 'leave' | 'trip'
  p_entity_id   UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-email';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
                 'type',       p_event_type,
                 'entityType', p_entity_type,
                 'entityId',   p_entity_id
               )
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[send-email] Failed to queue async call: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.call_send_email_function(TEXT, TEXT, UUID) TO authenticated;

-- ─── 3. Leave request trigger ─────────────────────────────────────────────────
-- Fires on every status transition that matters:
--   INSERT (pending)           → email HOD: new request needs approval
--   UPDATE → hod_approved      → email HR admin: HOD approved, awaiting final
--   UPDATE → approved          → email employee: fully approved
--   UPDATE → rejected          → email employee: rejected at any stage

CREATE OR REPLACE FUNCTION notify_leave_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hod_id     UUID;
  v_hr_id      UUID;
  v_event_type TEXT;
BEGIN

  -- ── INSERT: new request submitted ────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    -- Find HOD for this employee's department
    SELECT d.head_of_department_id INTO v_hod_id
    FROM users_profile up
    JOIN departments d ON d.id = up.department_id
    WHERE up.id = NEW.user_id;

    -- In-app notification → HOD
    IF v_hod_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
      SELECT
        v_hod_id,
        'New Leave Request',
        up.first_name || ' ' || up.last_name || ' has submitted a leave request for ' || NEW.total_days || ' days',
        'leave_request',
        NEW.id,
        false
      FROM users_profile up WHERE up.id = NEW.user_id;
    END IF;

    -- Email → HOD
    PERFORM call_send_email_function('leave_submitted', 'leave', NEW.id);
    RETURN NEW;
  END IF;

  -- ── UPDATE: status changed ────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW; -- No status change, skip
  END IF;

  IF NEW.status = 'hod_approved' THEN
    -- Find any HR admin to notify
    SELECT id INTO v_hr_id FROM users_profile
    WHERE role IN ('hr_admin', 'super_admin') LIMIT 1;

    -- In-app notification → HR
    IF v_hr_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
      SELECT
        v_hr_id,
        'Leave Request Awaiting HR Approval',
        up.first_name || ' ' || up.last_name || '''s leave request has been approved by HOD and needs HR final approval',
        'leave_request',
        NEW.id,
        false
      FROM users_profile up WHERE up.id = NEW.user_id;
    END IF;

    PERFORM call_send_email_function('leave_hod_approved', 'leave', NEW.id);

  ELSIF NEW.status = 'approved' THEN
    -- In-app notification → employee
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.user_id,
      'Leave Request Approved',
      'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been fully approved',
      'approval',
      NEW.id,
      false
    );

    PERFORM call_send_email_function('leave_approved', 'leave', NEW.id);

  ELSIF NEW.status IN ('rejected', 'hod_rejected', 'hr_rejected') THEN
    -- In-app notification → employee
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.user_id,
      'Leave Request Not Approved',
      'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' was not approved',
      'rejection',
      NEW.id,
      false
    );

    PERFORM call_send_email_function('leave_rejected', 'leave', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_request_notification_trigger ON leave_requests;
CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_request_event();

-- ─── 4. Fleet trip notification trigger ──────────────────────────────────────
-- Fires when trip status changes to: approved, assigned, in_progress, completed, rejected.

CREATE OR REPLACE FUNCTION notify_trip_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  -- NOTE: related_request_id FK points to leave_requests, so pass NULL for trip notifications.
  -- The trip reference is carried in the message text instead.

  IF NEW.status = 'approved' THEN
    -- In-app → requester
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.requester_id,
      'Trip Request Approved',
      'Your trip request ' || COALESCE(NEW.request_number, NEW.id::TEXT) || ' has been approved and is awaiting vehicle assignment',
      'approval',
      NULL,
      false
    );
    PERFORM call_send_email_function('trip_approved', 'trip', NEW.id);

  ELSIF NEW.status = 'assigned' THEN
    -- In-app → requester
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.requester_id,
      'Vehicle Assigned to Your Trip',
      'A vehicle has been assigned to your trip request ' || COALESCE(NEW.request_number, NEW.id::TEXT) || '. Your trip is confirmed.',
      'approval',
      NULL,
      false
    );
    PERFORM call_send_email_function('trip_assigned', 'trip', NEW.id);

    -- In-app → driver (if driver changed or newly assigned)
    IF NEW.assigned_driver_id IS NOT NULL AND (OLD.assigned_driver_id IS DISTINCT FROM NEW.assigned_driver_id) THEN
      INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
      VALUES (
        NEW.assigned_driver_id,
        'New Trip Assignment',
        'You have been assigned to trip ' || COALESCE(NEW.request_number, NEW.id::TEXT) || ' on ' || to_char(NEW.start_datetime AT TIME ZONE 'Africa/Nairobi', 'Mon DD, YYYY HH24:MI'),
        'leave_request',
        NULL,
        false
      );
    END IF;

  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.requester_id,
      'Trip Request Not Approved',
      'Your trip request ' || COALESCE(NEW.request_number, NEW.id::TEXT) || ' was not approved',
      'rejection',
      NULL,
      false
    );
    PERFORM call_send_email_function('trip_rejected', 'trip', NEW.id);

  ELSIF NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.requester_id,
      'Trip Completed',
      'Trip ' || COALESCE(NEW.request_number, NEW.id::TEXT) || ' has been marked as completed',
      'approval',
      NULL,
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_request_notification_trigger ON trip_requests;
CREATE TRIGGER trip_request_notification_trigger
  AFTER UPDATE OF status ON trip_requests
  FOR EACH ROW EXECUTE FUNCTION notify_trip_request_event();

-- ─── 5. Ensure notifications table grants ────────────────────────────────────

GRANT INSERT, SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;

NOTIFY pgrst, 'reload schema';
