-- Enable more verbose error logging for HTTP calls
-- This will help us see what's failing

CREATE OR REPLACE FUNCTION call_send_email_function(
  p_event_type TEXT,
  p_request_id UUID
)
RETURNS void AS $$
DECLARE
  v_function_url TEXT;
  v_response http_response;
BEGIN
  v_function_url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-email';
  
  RAISE NOTICE 'Calling Edge Function: % for request: %', p_event_type, p_request_id;
  
  -- Call Edge Function
  BEGIN
    SELECT * INTO v_response FROM http((
      'POST',
      v_function_url,
      ARRAY[http_header('Content-Type', 'application/json')],
      'application/json',
      json_build_object(
        'type', p_event_type,
        'requestId', p_request_id
      )::text
    )::http_request);
    
    RAISE NOTICE 'HTTP Response Status: %', v_response.status;
    RAISE NOTICE 'HTTP Response Content: %', v_response.content;
    
    IF v_response.status >= 400 THEN
      RAISE WARNING 'Edge Function returned error status %: %', v_response.status, v_response.content;
    ELSE
      RAISE NOTICE 'Email sent successfully via Edge Function';
    END IF;
    
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'HTTP call failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
  END;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test it immediately
DO $$
DECLARE
  v_request_id UUID;
BEGIN
  SELECT id INTO v_request_id FROM leave_requests WHERE status = 'pending' LIMIT 1;
  
  IF v_request_id IS NOT NULL THEN
    RAISE NOTICE '=== TESTING EMAIL FUNCTION ===';
    PERFORM call_send_email_function('request_approved', v_request_id);
    RAISE NOTICE '=== TEST COMPLETE ===';
  ELSE
    RAISE NOTICE 'No pending requests to test with';
  END IF;
END $$;
