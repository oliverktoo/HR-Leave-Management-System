-- Test calling the Edge Function directly from database
-- This will show if the function is being called and what errors occur

DO $$
DECLARE
  v_request_id UUID;
BEGIN
  -- Get the most recent approved request
  SELECT id INTO v_request_id 
  FROM leave_requests 
  WHERE status = 'approved'
  ORDER BY reviewed_at DESC 
  LIMIT 1;
  
  IF v_request_id IS NULL THEN
    RAISE NOTICE 'No approved requests found for testing';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Testing email for approved request: %', v_request_id;
  
  -- Call the function (should trigger email)
  PERFORM call_send_email_function('request_approved', v_request_id);
  
  RAISE NOTICE 'Email function called successfully';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error calling email function: %', SQLERRM;
END $$;

-- Check for any warnings in postgres logs
-- You should see this in Supabase Dashboard -> Logs -> Postgres Logs
