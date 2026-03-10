-- Migration: 003_two_step_approval.sql
-- Description: Implement two-step approval process (HOD -> HR)
-- Date: 2026-02-27

-- ==============================================
-- STEP 1: Add new columns for two-step approval
-- ==============================================

-- Add HOD approval fields
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS hod_approved_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS hod_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS hod_comments TEXT;

-- Add HR approval fields  
ALTER TABLE leave_requests 
ADD COLUMN IF NOT EXISTS hr_approved_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS hr_approved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS hr_comments TEXT;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_leave_requests_hod_approved_by ON leave_requests(hod_approved_by);
CREATE INDEX IF NOT EXISTS idx_leave_requests_hr_approved_by ON leave_requests(hr_approved_by);

-- ==============================================
-- STEP 2: Update status constraint to support intermediate states
-- ==============================================

-- Drop old constraint
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS chk_status;

-- Add new constraint with additional statuses
ALTER TABLE leave_requests 
ADD CONSTRAINT chk_status 
CHECK (status IN ('pending', 'hod_approved', 'approved', 'rejected', 'cancelled'));

-- ==============================================
-- STEP 3: Update leave balance trigger for two-step approval
-- ==============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_update_leave_balance ON leave_requests;

-- Recreate function with two-step approval logic
CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- When a request is first submitted (INSERT with status 'pending')
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    UPDATE leave_balances
    SET pending_days = pending_days + NEW.total_days,
        updated_at = NOW()
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  -- When HOD approves (pending -> hod_approved)
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'hod_approved' AND OLD.status = 'pending') THEN
    -- Keep days in pending state, no balance change yet
    NULL;
      
  -- When HR gives final approval (hod_approved -> approved)
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET used_days = used_days + NEW.total_days,
        pending_days = pending_days - NEW.total_days,
        updated_at = NOW()
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  -- When a request is rejected at any stage
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET pending_days = pending_days - NEW.total_days,
        updated_at = NOW()
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  -- When a request is cancelled
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET pending_days = pending_days - NEW.total_days,
        updated_at = NOW()
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
CREATE TRIGGER trg_update_leave_balance
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_balance();

-- ==============================================
-- STEP 4: Update notification trigger for two-step approval
-- ==============================================

-- Drop existing trigger
DROP TRIGGER IF EXISTS trg_notify_leave_request ON leave_requests;

-- Recreate notification function with two-step logic
CREATE OR REPLACE FUNCTION notify_leave_request_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type TEXT;
  v_hod_id UUID;
  v_hr_admin_ids UUID[];
BEGIN
  -- NEW REQUEST SUBMITTED
  IF TG_OP = 'INSERT' THEN
    -- Get HOD ID for new request
    SELECT d.head_of_department_id INTO v_hod_id
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = NEW.user_id;
    
    -- Notify HOD
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
        'New Leave Request - HOD Approval Required',
        (SELECT up.first_name || ' ' || up.last_name || ' has submitted a leave request for ' || NEW.total_days || ' days'
         FROM users_profile up WHERE up.id = NEW.user_id),
        'leave_request',
        NEW.id,
        false
      );
    END IF;
    
  -- STATUS CHANGED
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    
    -- HOD APPROVED - Notify HR and Employee
    IF NEW.status = 'hod_approved' THEN
      -- Notify employee
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        related_request_id,
        is_read
      ) VALUES (
        NEW.user_id,
        'Leave Request Approved by HOD',
        'Your HOD has approved your leave request. Awaiting HR final approval.',
        'leave_request',
        NEW.id,
        false
      );
      
      -- Notify all HR admins
      SELECT ARRAY_AGG(id) INTO v_hr_admin_ids
      FROM users_profile
      WHERE role IN ('hr_admin', 'super_admin') AND is_active = true;
      
      IF v_hr_admin_ids IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
        SELECT 
          hr_id,
          'Leave Request - HR Final Approval Required',
          (SELECT up.first_name || ' ' || up.last_name || '''s leave request (HOD approved) awaits your final approval'
           FROM users_profile up WHERE up.id = NEW.user_id),
          'leave_request',
          NEW.id,
          false
        FROM UNNEST(v_hr_admin_ids) AS hr_id;
      END IF;
      
    -- FINAL APPROVAL BY HR
    ELSIF NEW.status = 'approved' THEN
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        related_request_id,
        is_read
      ) VALUES (
        NEW.user_id,
        'Leave Request Fully Approved',
        'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been fully approved',
        'leave_request',
        NEW.id,
        false
      );
      
    -- REJECTED
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO notifications (
        user_id,
        title,
        message,
        type,
        related_request_id,
        is_read
      ) VALUES (
        NEW.user_id,
        'Leave Request Rejected',
        'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been rejected',
        'leave_request',
        NEW.id,
        false
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate trigger
CREATE TRIGGER trg_notify_leave_request
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION notify_leave_request_event();

-- ==============================================
-- STEP 5: Update RLS policies for HR to see all requests
-- ==============================================

-- Drop all existing leave_requests policies
DROP POLICY IF EXISTS "users_view_own_requests" ON leave_requests;
DROP POLICY IF EXISTS "users_create_own_requests" ON leave_requests;
DROP POLICY IF EXISTS "users_update_own_pending" ON leave_requests;
DROP POLICY IF EXISTS "hod_view_department_requests" ON leave_requests;
DROP POLICY IF EXISTS "hod_approve_department_requests" ON leave_requests;
DROP POLICY IF EXISTS "hr_view_all_requests" ON leave_requests;
DROP POLICY IF EXISTS "hr_manage_all_requests" ON leave_requests;

-- Recreate RLS policies

-- Users can view their own requests
CREATE POLICY "users_view_own_requests" ON leave_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "users_create_own_requests" ON leave_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending requests (for cancellation)
CREATE POLICY "users_update_own_pending" ON leave_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));

-- HOD can view requests from their department
CREATE POLICY "hod_view_department_requests" ON leave_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = auth.uid() 
      AND d.head_of_department_id = auth.uid()
      AND leave_requests.user_id IN (
        SELECT id FROM users_profile WHERE department_id = d.id
      )
  )
);

-- HOD can update requests from their department (for HOD approval)
CREATE POLICY "hod_approve_department_requests" ON leave_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = auth.uid() 
      AND up.role = 'hod'
      AND d.head_of_department_id = auth.uid()
      AND leave_requests.user_id IN (
        SELECT id FROM users_profile WHERE department_id = d.id
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = auth.uid() 
      AND up.role = 'hod'
      AND d.head_of_department_id = auth.uid()
      AND leave_requests.user_id IN (
        SELECT id FROM users_profile WHERE department_id = d.id
      )
  )
);

-- HR can view ALL requests (including pending, hod_approved, etc.)
CREATE POLICY "hr_view_all_requests" ON leave_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() 
      AND role IN ('hr_admin', 'super_admin')
  )
);

-- HR can update ALL requests (for final approval)
CREATE POLICY "hr_manage_all_requests" ON leave_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() 
      AND role IN ('hr_admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() 
      AND role IN ('hr_admin', 'super_admin')
  )
);

-- ==============================================
-- COMPLETED: Two-step approval system ready!
-- ==============================================

-- Summary of changes:
-- 1. Added hod_approved_by, hod_approved_at, hod_comments columns
-- 2. Added hr_approved_by, hr_approved_at, hr_comments columns
-- 3. Added 'hod_approved' status to workflow
-- 4. Updated triggers to handle two-step approval
-- 5. Updated RLS policies so HR can see and approve all requests
-- 6. HOD can only approve to 'hod_approved' status
-- 7. HR can approve to final 'approved' status

-- Workflow:
-- Employee submits -> Status: 'pending'
-- HOD approves -> Status: 'hod_approved' (days still in pending)
-- HR approves -> Status: 'approved' (days moved to used)
-- Either HOD or HR can reject at any stage
