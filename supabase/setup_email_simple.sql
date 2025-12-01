-- ================================================
-- Simplified Email Notifications Setup
-- ================================================

-- 1. Create trigger function for leave request notifications
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
    
    -- Create notification for HOD
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
    
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    -- Status changed
    IF NEW.status = 'approved' THEN
      v_event_type := 'request_approved';
    ELSIF NEW.status = 'rejected' THEN
      v_event_type := 'request_rejected';
    ELSE
      RETURN NEW;
    END IF;
    
    -- Create notification for employee
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
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to leave_requests table
DROP TRIGGER IF EXISTS leave_request_notification_trigger ON leave_requests;

CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_leave_request_event();

-- 3. Verify notifications table has correct structure
DO $$
BEGIN
  -- Check if notifications table exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
    RAISE EXCEPTION 'notifications table does not exist. Run initial migrations first.';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Email notification triggers configured successfully!';
  RAISE NOTICE 'Notifications will be created in the notifications table';
  RAISE NOTICE 'Next step: Deploy the send-email Edge Function';
END $$;
