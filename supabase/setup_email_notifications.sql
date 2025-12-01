-- ================================================
-- Phase 3: Email Notifications Integration
-- ================================================
-- This script sets up database triggers to send email notifications
-- Run this in Supabase SQL Editor AFTER deploying the send-email Edge Function

-- ================================================
-- 1. Create function to call Edge Function
-- ================================================

CREATE OR REPLACE FUNCTION send_leave_notification(
  p_event_type TEXT,
  p_request_id UUID
)
RETURNS void AS $$
DECLARE
  v_function_url TEXT;
  v_service_key TEXT;
  v_response TEXT;
BEGIN
  -- Get Supabase URL from environment (set in Supabase Dashboard)
  v_function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-email';
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- Call Edge Function using pg_net (if available) or http extension
  -- Note: This requires the http extension or pg_net extension
  -- Alternative: Call from frontend after mutation
  
  -- For now, we'll log the event and handle email sending from frontend
  INSERT INTO notifications (
    user_id,
    title,
    message,
    type,
    related_id,
    is_read
  )
  SELECT 
    CASE 
      WHEN p_event_type = 'request_submitted' THEN 
        (SELECT up.id FROM users_profile up 
         JOIN departments d ON up.id = d.head_of_department_id
         WHERE d.id = (SELECT department_id FROM users_profile WHERE id = lr.user_id))
      ELSE lr.user_id
    END,
    CASE 
      WHEN p_event_type = 'request_submitted' THEN 'New Leave Request'
      WHEN p_event_type = 'request_approved' THEN 'Leave Request Approved'
      WHEN p_event_type = 'request_rejected' THEN 'Leave Request Rejected'
      ELSE 'Leave Request Update'
    END,
    CASE 
      WHEN p_event_type = 'request_submitted' THEN 
        (SELECT up.first_name || ' ' || up.last_name || ' has submitted a leave request for ' || lr.total_days || ' days'
         FROM users_profile up WHERE up.id = lr.user_id)
      WHEN p_event_type = 'request_approved' THEN 
        'Your leave request from ' || to_char(lr.start_date, 'Mon DD, YYYY') || ' to ' || to_char(lr.end_date, 'Mon DD, YYYY') || ' has been approved'
      WHEN p_event_type = 'request_rejected' THEN 
        'Your leave request from ' || to_char(lr.start_date, 'Mon DD, YYYY') || ' to ' || to_char(lr.end_date, 'Mon DD, YYYY') || ' has been rejected'
      ELSE 'Your leave request status has been updated'
    END,
    p_event_type,
    p_request_id,
    false
  FROM leave_requests lr
  WHERE lr.id = p_request_id;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to send notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 2. Create trigger function for leave requests
-- ================================================

CREATE OR REPLACE FUNCTION notify_leave_request_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'request_submitted';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      IF NEW.status = 'approved' THEN
        v_event_type := 'request_approved';
      ELSIF NEW.status = 'rejected' THEN
        v_event_type := 'request_rejected';
      ELSE
        v_event_type := 'request_updated';
      END IF;
    ELSE
      -- Status didn't change, no notification needed
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;
  
  -- Send notification
  PERFORM send_leave_notification(v_event_type, NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- 3. Attach trigger to leave_requests table
-- ================================================

DROP TRIGGER IF EXISTS leave_request_notification_trigger ON leave_requests;

CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_leave_request_event();

-- ================================================
-- 4. Create email template storage (optional)
-- ================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_templates IS 'Stores reusable email templates';

-- Insert default email templates
INSERT INTO email_templates (name, subject, html_body, variables) VALUES
(
  'leave_request_submitted',
  '[ACTION REQUIRED] New Leave Request - {{employee_name}}',
  '<h2>New Leave Request Pending Approval</h2>
   <p>Dear {{manager_name}},</p>
   <p><strong>{{employee_name}}</strong> has submitted a leave request:</p>
   <ul>
     <li><strong>Leave Type:</strong> {{leave_type}}</li>
     <li><strong>Start Date:</strong> {{start_date}}</li>
     <li><strong>End Date:</strong> {{end_date}}</li>
     <li><strong>Duration:</strong> {{total_days}} days</li>
     <li><strong>Reason:</strong> {{reason}}</li>
   </ul>
   <p>Please review and approve/reject this request in the HR system.</p>
   <a href="{{app_url}}/approvals" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review Request</a>',
  '["employee_name", "manager_name", "leave_type", "start_date", "end_date", "total_days", "reason", "app_url"]'::jsonb
),
(
  'leave_request_approved',
  '✅ Your Leave Request Has Been Approved',
  '<h2>Leave Request Approved</h2>
   <p>Dear {{employee_name}},</p>
   <p>Good news! Your leave request has been <strong>approved</strong>.</p>
   <ul>
     <li><strong>Leave Type:</strong> {{leave_type}}</li>
     <li><strong>Start Date:</strong> {{start_date}}</li>
     <li><strong>End Date:</strong> {{end_date}}</li>
     <li><strong>Duration:</strong> {{total_days}} days</li>
     <li><strong>Approved By:</strong> {{reviewer_name}}</li>
     {{#if reviewer_comments}}<li><strong>Comments:</strong> {{reviewer_comments}}</li>{{/if}}
   </ul>
   <p>Enjoy your time off!</p>
   <a href="{{app_url}}/leave-history" style="background-color: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Leave History</a>',
  '["employee_name", "leave_type", "start_date", "end_date", "total_days", "reviewer_name", "reviewer_comments", "app_url"]'::jsonb
),
(
  'leave_request_rejected',
  '❌ Leave Request Update',
  '<h2>Leave Request Not Approved</h2>
   <p>Dear {{employee_name}},</p>
   <p>We regret to inform you that your leave request has been <strong>rejected</strong>.</p>
   <ul>
     <li><strong>Leave Type:</strong> {{leave_type}}</li>
     <li><strong>Start Date:</strong> {{start_date}}</li>
     <li><strong>End Date:</strong> {{end_date}}</li>
     <li><strong>Duration:</strong> {{total_days}} days</li>
     <li><strong>Reviewed By:</strong> {{reviewer_name}}</li>
     <li><strong>Reason for Rejection:</strong> {{reviewer_comments}}</li>
   </ul>
   <p>If you have questions, please contact your manager or HR department.</p>
   <a href="{{app_url}}/leave-history" style="background-color: #6b7280; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">View Leave History</a>',
  '["employee_name", "leave_type", "start_date", "end_date", "total_days", "reviewer_name", "reviewer_comments", "app_url"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- ================================================
-- 5. Create email queue table (for reliability)
-- ================================================

CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  template_name TEXT REFERENCES email_templates(name),
  template_data JSONB,
  related_entity_type TEXT,
  related_entity_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_queue_status ON email_queue(status, scheduled_at);
CREATE INDEX idx_email_queue_created ON email_queue(created_at DESC);

COMMENT ON TABLE email_queue IS 'Queue for outgoing emails with retry logic';

-- ================================================
-- 6. Helper function to queue emails
-- ================================================

CREATE OR REPLACE FUNCTION queue_email(
  p_recipient_email TEXT,
  p_recipient_name TEXT,
  p_template_name TEXT,
  p_template_data JSONB,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_email_id UUID;
  v_template RECORD;
  v_subject TEXT;
  v_html_body TEXT;
BEGIN
  -- Get template
  SELECT * INTO v_template
  FROM email_templates
  WHERE name = p_template_name AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template % not found or inactive', p_template_name;
  END IF;
  
  -- Replace variables in subject and body (simple replacement)
  v_subject := v_template.subject;
  v_html_body := v_template.html_body;
  
  -- You would implement a proper template engine here
  -- For now, we'll store the template data for processing later
  
  -- Insert into queue
  INSERT INTO email_queue (
    recipient_email,
    recipient_name,
    subject,
    html_body,
    template_name,
    template_data,
    related_entity_type,
    related_entity_id
  ) VALUES (
    p_recipient_email,
    p_recipient_name,
    v_subject,
    v_html_body,
    p_template_name,
    p_template_data,
    p_related_entity_type,
    p_related_entity_id
  )
  RETURNING id INTO v_email_id;
  
  RETURN v_email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 7. Update notification function to use email queue
-- ================================================

CREATE OR REPLACE FUNCTION send_leave_notification_v2(
  p_event_type TEXT,
  p_request_id UUID
)
RETURNS void AS $$
DECLARE
  v_request RECORD;
  v_manager RECORD;
  v_template_name TEXT;
  v_template_data JSONB;
  v_recipient_email TEXT;
  v_recipient_name TEXT;
BEGIN
  -- Get leave request details
  SELECT 
    lr.*,
    up.first_name AS employee_first_name,
    up.last_name AS employee_last_name,
    up.email AS employee_email,
    up.department_id,
    lt.name AS leave_type_name,
    rv.first_name AS reviewer_first_name,
    rv.last_name AS reviewer_last_name
  INTO v_request
  FROM leave_requests lr
  JOIN users_profile up ON lr.user_id = up.id
  JOIN leave_types lt ON lr.leave_type_id = lt.id
  LEFT JOIN users_profile rv ON lr.reviewed_by = rv.id
  WHERE lr.id = p_request_id;
  
  -- Build template data
  v_template_data := jsonb_build_object(
    'employee_name', v_request.employee_first_name || ' ' || v_request.employee_last_name,
    'leave_type', v_request.leave_type_name,
    'start_date', to_char(v_request.start_date, 'Mon DD, YYYY'),
    'end_date', to_char(v_request.end_date, 'Mon DD, YYYY'),
    'total_days', v_request.total_days,
    'reason', v_request.reason,
    'reviewer_name', COALESCE(v_request.reviewer_first_name || ' ' || v_request.reviewer_last_name, 'Manager'),
    'reviewer_comments', COALESCE(v_request.reviewer_comments, ''),
    'app_url', 'http://localhost:5177' -- Update with actual URL
  );
  
  -- Determine recipient and template based on event type
  CASE p_event_type
    WHEN 'request_submitted' THEN
      -- Get manager email
      SELECT up.email, up.first_name || ' ' || up.last_name
      INTO v_recipient_email, v_recipient_name
      FROM users_profile up
      JOIN departments d ON up.id = d.head_of_department_id
      WHERE d.id = v_request.department_id;
      
      v_template_name := 'leave_request_submitted';
      v_template_data := v_template_data || jsonb_build_object('manager_name', v_recipient_name);
      
    WHEN 'request_approved' THEN
      v_recipient_email := v_request.employee_email;
      v_recipient_name := v_request.employee_first_name || ' ' || v_request.employee_last_name;
      v_template_name := 'leave_request_approved';
      
    WHEN 'request_rejected' THEN
      v_recipient_email := v_request.employee_email;
      v_recipient_name := v_request.employee_first_name || ' ' || v_request.employee_last_name;
      v_template_name := 'leave_request_rejected';
      
    ELSE
      RETURN; -- Unknown event type
  END CASE;
  
  -- Queue email
  IF v_recipient_email IS NOT NULL THEN
    PERFORM queue_email(
      v_recipient_email,
      v_recipient_name,
      v_template_name,
      v_template_data,
      'leave_request',
      p_request_id
    );
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to queue email notification: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- 8. Update trigger to use new notification function
-- ================================================

CREATE OR REPLACE FUNCTION notify_leave_request_event_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'request_submitted';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status != OLD.status THEN
      IF NEW.status = 'approved' THEN
        v_event_type := 'request_approved';
      ELSIF NEW.status = 'rejected' THEN
        v_event_type := 'request_rejected';
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;
  
  -- Send notification (in-app)
  PERFORM send_leave_notification(v_event_type, NEW.id);
  
  -- Queue email
  PERFORM send_leave_notification_v2(v_event_type, NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Replace trigger
DROP TRIGGER IF EXISTS leave_request_notification_trigger ON leave_requests;
CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_leave_request_event_v2();

-- ================================================
-- 9. Grant permissions
-- ================================================

GRANT SELECT ON email_templates TO authenticated;
GRANT INSERT ON email_queue TO authenticated;
GRANT SELECT ON notifications TO authenticated;
GRANT UPDATE (is_read) ON notifications TO authenticated;

-- ================================================
-- Verification Queries
-- ================================================

-- Check email queue
-- SELECT * FROM email_queue ORDER BY created_at DESC LIMIT 10;

-- Check notifications
-- SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;

-- Check email templates
-- SELECT name, subject FROM email_templates WHERE is_active = true;

-- ================================================
-- Notes
-- ================================================
/*
This setup creates:
1. In-app notifications (notifications table)
2. Email queue (email_queue table)
3. Email templates (email_templates table)
4. Triggers to auto-send notifications

To actually send emails:
- Deploy the send-email Edge Function
- Configure email service (Resend/SendGrid) in Supabase
- Set up a cron job or scheduled function to process email_queue
- OR process queue from frontend/backend worker

For production:
- Update app_url in template_data
- Configure proper email service
- Set up email sending worker
- Add email delivery tracking
*/
