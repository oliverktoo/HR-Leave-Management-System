-- ================================================
-- Verify and Fix Email Notification Setup
-- ================================================

-- 1. Check if http extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'http') THEN
    RAISE NOTICE '❌ HTTP extension NOT installed';
    RAISE NOTICE 'Installing HTTP extension...';
    CREATE EXTENSION http;
    RAISE NOTICE '✅ HTTP extension installed';
  ELSE
    RAISE NOTICE '✅ HTTP extension already installed';
  END IF;
END $$;

-- 2. Check if call_send_email_function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'call_send_email_function'
  ) THEN
    RAISE NOTICE '❌ call_send_email_function NOT found';
  ELSE
    RAISE NOTICE '✅ call_send_email_function exists';
  END IF;
END $$;

-- 3. Check if notify_leave_request_event trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_leave_request_notification'
  ) THEN
    RAISE NOTICE '❌ trigger_leave_request_notification NOT found';
  ELSE
    RAISE NOTICE '✅ trigger_leave_request_notification exists';
  END IF;
END $$;

-- 4. View recent notifications created
SELECT 
  n.created_at,
  n.type,
  n.title,
  up.email as recipient_email,
  n.is_read
FROM notifications n
JOIN users_profile up ON n.user_id = up.id
ORDER BY n.created_at DESC
LIMIT 5;
