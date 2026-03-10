-- Fix RLS issue for notifications trigger
-- The trigger needs SECURITY DEFINER to bypass RLS when creating notifications

-- Recreate the trigger function with SECURITY DEFINER
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verify the function has SECURITY DEFINER
SELECT proname, prosecdef 
FROM pg_proc 
WHERE proname = 'notify_leave_request_event';
