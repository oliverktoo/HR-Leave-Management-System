-- Migration: 002_triggers_and_rls.sql
-- Description: Database triggers for balance updates and Row Level Security policies
-- Date: 2025-11-15

-- ==============================================
-- TRIGGERS: Leave Balance Management
-- ==============================================

-- Function to automatically update leave balances when request status changes
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
      
  -- When a request is approved
  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status != 'approved') THEN
    UPDATE leave_balances
    SET used_days = used_days + NEW.total_days,
        pending_days = pending_days - NEW.total_days,
        updated_at = NOW()
    WHERE user_id = NEW.user_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
      
  -- When a request is rejected or cancelled
  ELSIF (TG_OP = 'UPDATE' AND NEW.status IN ('rejected', 'cancelled') AND OLD.status = 'pending') THEN
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

CREATE TRIGGER trg_update_leave_balance
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_leave_balance();

-- ==============================================
-- TRIGGERS: Request History Logging
-- ==============================================

-- Function to log all status changes to history table
CREATE OR REPLACE FUNCTION log_request_history()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO leave_request_history (
    leave_request_id,
    action,
    performed_by,
    comments
  ) VALUES (
    NEW.id,
    NEW.status,
    COALESCE(NEW.reviewed_by, NEW.user_id),
    NEW.reviewer_comments
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_log_request_history
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION log_request_history();

-- ==============================================
-- TRIGGERS: Audit Logging
-- ==============================================

-- Function to log all changes to sensitive tables
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    user_id
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN row_to_json(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
    COALESCE(NEW.user_id, OLD.user_id, auth.uid())
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit logging to sensitive tables
CREATE TRIGGER audit_leave_requests
AFTER INSERT OR UPDATE OR DELETE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_leave_balances
AFTER INSERT OR UPDATE OR DELETE ON leave_balances
FOR EACH ROW EXECUTE FUNCTION log_audit();

CREATE TRIGGER audit_users_profile
AFTER INSERT OR UPDATE OR DELETE ON users_profile
FOR EACH ROW EXECUTE FUNCTION log_audit();

-- ==============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================

-- Enable RLS on all tables
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- RLS POLICIES: users_profile
-- ==============================================

-- Users can view their own profile
CREATE POLICY "users_view_own_profile" ON users_profile
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- HODs can view profiles in their department
CREATE POLICY "hod_view_department_profiles" ON users_profile
FOR SELECT
TO authenticated
USING (
  department_id IN (
    SELECT department_id FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);

-- HR admins can view all profiles
CREATE POLICY "hr_view_all_profiles" ON users_profile
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- Users can update their own profile (limited fields)
CREATE POLICY "users_update_own_profile" ON users_profile
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- HR admins can manage all profiles
CREATE POLICY "hr_manage_profiles" ON users_profile
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: departments
-- ==============================================

-- Everyone can view active departments
CREATE POLICY "view_active_departments" ON departments
FOR SELECT
TO authenticated
USING (is_active = true);

-- HR admins can manage departments
CREATE POLICY "hr_manage_departments" ON departments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: leave_types
-- ==============================================

-- Everyone can view active leave types
CREATE POLICY "view_active_leave_types" ON leave_types
FOR SELECT
TO authenticated
USING (is_active = true);

-- HR admins can manage leave types
CREATE POLICY "hr_manage_leave_types" ON leave_types
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: leave_balances
-- ==============================================

-- Users can view their own balances
CREATE POLICY "users_view_own_balances" ON leave_balances
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- HODs can view department balances
CREATE POLICY "hod_view_department_balances" ON leave_balances
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);

-- HR admins can manage all balances
CREATE POLICY "hr_manage_balances" ON leave_balances
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: leave_requests
-- ==============================================

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

-- Users can update their own pending requests (cancel)
CREATE POLICY "users_update_own_pending_requests" ON leave_requests
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id);

-- HODs can view department requests
CREATE POLICY "hod_view_department_requests" ON leave_requests
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);

-- HODs can approve/reject department requests
CREATE POLICY "hod_approve_department_requests" ON leave_requests
FOR UPDATE
TO authenticated
USING (
  user_id IN (
    SELECT id FROM users_profile 
    WHERE department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
)
WITH CHECK (
  status IN ('approved', 'rejected') AND
  reviewed_by = auth.uid()
);

-- HR admins have full access
CREATE POLICY "hr_manage_all_requests" ON leave_requests
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: leave_request_history
-- ==============================================

-- Users can view history of their own requests
CREATE POLICY "users_view_own_request_history" ON leave_request_history
FOR SELECT
TO authenticated
USING (
  leave_request_id IN (
    SELECT id FROM leave_requests WHERE user_id = auth.uid()
  )
);

-- HODs can view department request history
CREATE POLICY "hod_view_department_history" ON leave_request_history
FOR SELECT
TO authenticated
USING (
  leave_request_id IN (
    SELECT lr.id FROM leave_requests lr
    JOIN users_profile up ON lr.user_id = up.id
    WHERE up.department_id = (
      SELECT department_id FROM users_profile WHERE id = auth.uid()
    )
  ) AND
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
  )
);

-- HR admins can view all history
CREATE POLICY "hr_view_all_history" ON leave_request_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- RLS POLICIES: notifications
-- ==============================================

-- Users can view and update their own notifications
CREATE POLICY "users_manage_own_notifications" ON notifications
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ==============================================
-- RLS POLICIES: public_holidays
-- ==============================================

-- Everyone can view public holidays
CREATE POLICY "view_public_holidays" ON public_holidays
FOR SELECT
TO authenticated
USING (true);

-- HR admins can manage public holidays
CREATE POLICY "hr_manage_holidays" ON public_holidays
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Function to calculate working days between two dates
CREATE OR REPLACE FUNCTION calculate_working_days(
  start_date DATE,
  end_date DATE
) RETURNS DECIMAL AS $$
DECLARE
  working_days DECIMAL := 0;
  check_date DATE := start_date;
BEGIN
  WHILE check_date <= end_date LOOP
    -- Exclude weekends (Saturday = 6, Sunday = 0)
    IF EXTRACT(DOW FROM check_date) NOT IN (0, 6) THEN
      -- Exclude public holidays
      IF NOT EXISTS (
        SELECT 1 FROM public_holidays WHERE date = check_date
      ) THEN
        working_days := working_days + 1;
      END IF;
    END IF;
    check_date := check_date + 1;
  END LOOP;
  
  RETURN working_days;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has sufficient leave balance
CREATE OR REPLACE FUNCTION check_leave_balance(
  p_user_id UUID,
  p_leave_type_id UUID,
  p_year INTEGER,
  p_requested_days DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
  v_available_days DECIMAL;
BEGIN
  SELECT (annual_allocation + carryforward_days - used_days - pending_days)
  INTO v_available_days
  FROM leave_balances
  WHERE user_id = p_user_id
    AND leave_type_id = p_leave_type_id
    AND year = p_year;
  
  RETURN COALESCE(v_available_days, 0) >= p_requested_days;
END;
$$ LANGUAGE plpgsql;
