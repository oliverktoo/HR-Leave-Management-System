-- Manual test to call the send-email Edge Function directly
-- This will help verify if the Edge Function works

-- First, check if http extension exists
SELECT * FROM pg_extension WHERE extname = 'http';

-- If http extension exists, try calling the function
-- Replace the requestId with one of your actual pending request IDs
DO $$
DECLARE
  v_response record;
  v_request_id UUID;
BEGIN
  -- Get a pending request ID
  SELECT id INTO v_request_id FROM leave_requests WHERE status = 'pending' LIMIT 1;
  
  IF v_request_id IS NULL THEN
    RAISE NOTICE 'No pending requests found';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing email for request: %', v_request_id;
  
  -- Try calling the Edge Function
  SELECT * INTO v_response FROM http((
    'POST',
    'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-email',
    ARRAY[http_header('Content-Type', 'application/json')],
    'application/json',
    json_build_object(
      'type', 'request_approved',
      'requestId', v_request_id
    )::text
  )::http_request);
  
  RAISE NOTICE 'Response status: %', v_response.status;
  RAISE NOTICE 'Response content: %', v_response.content;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error: %', SQLERRM;
END $$;
