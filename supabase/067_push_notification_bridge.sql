-- Migration 067: Push Notification Bridge
-- ─────────────────────────────────────────────────────────────────────────────
-- Whenever a row is INSERTed into `notifications`, fire an async HTTP call to
-- the `send-push` Edge Function which delivers an FCM push to the user's device.
--
-- This is non-blocking (pg_net) so a failed push never rolls back the transaction.
-- If FCM is not configured in the Edge Function, it returns 200 and skips silently.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-push';
BEGIN
  PERFORM net.http_post(
    url     := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := jsonb_build_object(
                 'user_id', NEW.user_id,
                 'title',   NEW.title,
                 'message', NEW.message,
                 'type',    NEW.type
               )
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[send-push] Failed to queue async call: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_notification ON public.notifications;
CREATE TRIGGER trg_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_notification();

NOTIFY pgrst, 'reload schema';
