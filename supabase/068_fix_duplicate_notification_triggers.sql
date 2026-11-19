-- Migration 068: Fix duplicate notification triggers on leave_requests
-- ─────────────────────────────────────────────────────────────────────────────
-- Multiple migrations created triggers on leave_requests, leaving 2+ active.
-- This removes all old ones and keeps only the authoritative trigger from 056.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop every known trigger name that may have been created by earlier migrations
DROP TRIGGER IF EXISTS leave_request_notification_trigger   ON public.leave_requests;
DROP TRIGGER IF EXISTS trigger_leave_request_notification   ON public.leave_requests;
DROP TRIGGER IF EXISTS leave_notification_trigger           ON public.leave_requests;
DROP TRIGGER IF EXISTS notify_leave_trigger                 ON public.leave_requests;
DROP TRIGGER IF EXISTS trg_leave_request_notification       ON public.leave_requests;

-- Drop old/duplicate trigger functions that may still exist
DROP FUNCTION IF EXISTS public.notify_leave_request_event_v2() CASCADE;

-- Re-create the single authoritative trigger (from 056_wire_notifications.sql)
-- Uses the already-correct notify_leave_request_event() function.
CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE OF status ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_leave_request_event();

-- Verify: should now show exactly ONE trigger on leave_requests
-- SELECT tgname, proname FROM pg_trigger t
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- WHERE tgrelid = 'leave_requests'::regclass AND NOT tgisinternal;

NOTIFY pgrst, 'reload schema';
