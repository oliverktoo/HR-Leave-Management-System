-- ================================================
-- Update Email Notifications to Call Edge Function
-- ================================================

-- 1. Enable http extension for calling Edge Functions from PostgreSQL
CREATE EXTENSION IF NOT EXISTS http;

-- 2. Create function to call Edge Function
CREATE OR REPLACE FUNCTION call_send_email_function(
  p_event_type TEXT,
  p_request_id UUID
)
RETURNS void AS $$
DECLARE
  v_function_url TEXT;
  v_anon_key TEXT;
  v_response http_response;
BEGIN
  -- Get Supabase URL from current database URL
  v_function_url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-email';
  -- Note: You'll need to set the anon key as a secret or environment variable
  -- For now, we'll skip auth on the function call
  
  -- Call Edge Function asynchronously
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
  
  -- Log if failed (don't throw error to avoid blocking the main transaction)
  IF v_response.status >= 400 THEN
    RAISE WARNING 'Failed to call send-email function: % - %', v_response.status, v_response.content;
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error calling send-email function: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update the notification trigger to also call Edge Function
CREATE OR REPLACE FUNCTION notify_leave_request_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
  v_hod_id UUID;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'request_submitted';
    
    -- Get HOD ID for new request
    SELECT d.head_of_department_id INTO v_hod_id
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = NEW.user_id;
    
    -- Create in-app notification for HOD
    IF v_hod_id IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        related_request_id,
        is_read
      ) VALUES (
        v_hod_id,
        'New Leave Request',
        (SELECT up.first_name || ' ' || up.last_name || ' has submitted a leave request for ' || NEW.total_days || ' days'
         FROM users_profile up WHERE up.id = NEW.user_id),
        'leave_request',
        NEW.id,
        false
      );
    END IF;
    
    -- Call Edge Function to send email
    PERFORM call_send_email_function(v_event_type, NEW.id);
    
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    -- Status changed
    IF NEW.status = 'approved' THEN
      v_event_type := 'request_approved';
    ELSIF NEW.status = 'rejected' THEN
      v_event_type := 'request_rejected';
    ELSE
      RETURN NEW;
    END IF;
    
    -- Create in-app notification for employee
    INSERT INTO notifications (
      user_id,
      title,
      message,
      type,
      related_request_id,
      is_read
    ) VALUES (
      NEW.user_id,
      CASE 
        WHEN NEW.status = 'approved' THEN 'Leave Request Approved'
        WHEN NEW.status = 'rejected' THEN 'Leave Request Rejected'
      END,
      CASE 
        WHEN NEW.status = 'approved' THEN 
          'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been approved'
        WHEN NEW.status = 'rejected' THEN 
          'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been rejected'
      END,
      'leave_request',
      NEW.id,
      false
    );
    
    -- Call Edge Function to send email
    PERFORM call_send_email_function(v_event_type, NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Email Edge Function integration complete!';
  RAISE NOTICE 'Now test by submitting a leave request';
END $$;
