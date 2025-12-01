-- =============================================
-- CREATE SUPER ADMIN USER - OLIVER KIPTOOK
-- Email: oliverkiptook@gmail.com
-- Special privileges: Full system access, hidden from HR admin lists
-- Date: November 16, 2025
-- =============================================

-- INSTRUCTIONS:
-- 1. First, create the auth user in Supabase Dashboard:
--    Go to Authentication > Users > Invite User
--    Email: oliverkiptook@gmail.com
--    Send invitation or set temporary password
-- 2. Copy the user ID after creation
-- 3. Replace 'USER_ID_HERE' below with the actual UUID
-- 4. Run this entire script in Supabase SQL Editor

-- Step 1: Add 'super_admin' role to the constraint
ALTER TABLE users_profile 
DROP CONSTRAINT IF EXISTS chk_role;

ALTER TABLE users_profile 
ADD CONSTRAINT chk_role CHECK (role IN ('employee', 'hod', 'hr_admin', 'super_admin'));

-- Step 2: Create the super admin user profile
DO $$
DECLARE
  v_user_id UUID := 'USER_ID_HERE'; -- REPLACE THIS WITH ACTUAL USER ID
  v_dept_id UUID;
BEGIN
  -- Verify the user exists in auth.users
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User ID % does not exist in auth.users. Please create the auth user first.', v_user_id;
  END IF;

  -- Get or create System Administration department
  SELECT id INTO v_dept_id FROM departments WHERE name = 'System Administration' LIMIT 1;
  
  IF v_dept_id IS NULL THEN
    INSERT INTO departments (name, description, is_active)
    VALUES ('System Administration', 'System-level administrative department', true)
    RETURNING id INTO v_dept_id;
    
    RAISE NOTICE 'Created System Administration department';
  END IF;

  -- Insert the super admin profile
  INSERT INTO users_profile (
    id, 
    employee_id, 
    first_name, 
    last_name, 
    email, 
    department_id, 
    role, 
    job_title,
    is_active,
    hire_date
  )
  VALUES (
    v_user_id,
    'SUPER001',
    'Oliver',
    'Kiptook',
    'oliverkiptook@gmail.com',
    v_dept_id,
    'super_admin',
    'System Administrator',
    true,
    CURRENT_DATE
  )
  ON CONFLICT (id) 
  DO UPDATE SET
    role = 'super_admin',
    job_title = 'System Administrator',
    is_active = true,
    updated_at = NOW();

  RAISE NOTICE 'Super admin user created/updated successfully';
END $$;

-- Step 3: Grant super admin full access via RLS policies

-- Drop existing super_admin policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "super_admin_view_all_profiles" ON users_profile;
DROP POLICY IF EXISTS "super_admin_update_all_profiles" ON users_profile;
DROP POLICY IF EXISTS "super_admin_insert_profiles" ON users_profile;
DROP POLICY IF EXISTS "super_admin_delete_profiles" ON users_profile;
DROP POLICY IF EXISTS "super_admin_view_all_requests" ON leave_requests;
DROP POLICY IF EXISTS "super_admin_update_all_requests" ON leave_requests;
DROP POLICY IF EXISTS "super_admin_insert_requests" ON leave_requests;
DROP POLICY IF EXISTS "super_admin_delete_requests" ON leave_requests;
DROP POLICY IF EXISTS "super_admin_view_all_balances" ON leave_balances;
DROP POLICY IF EXISTS "super_admin_update_all_balances" ON leave_balances;
DROP POLICY IF EXISTS "super_admin_view_all_departments" ON departments;
DROP POLICY IF EXISTS "super_admin_manage_departments" ON departments;
DROP POLICY IF EXISTS "super_admin_manage_leave_types" ON leave_types;
DROP POLICY IF EXISTS "super_admin_manage_holidays" ON public_holidays;
DROP POLICY IF EXISTS "super_admin_view_audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "super_admin_manage_notifications" ON notifications;

-- Users Profile - Super admin can see and modify all profiles
CREATE POLICY "super_admin_view_all_profiles" 
ON users_profile FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_update_all_profiles" 
ON users_profile FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_insert_profiles" 
ON users_profile FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_delete_profiles" 
ON users_profile FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Leave Requests - Super admin can see and manage all
CREATE POLICY "super_admin_view_all_requests" 
ON leave_requests FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_update_all_requests" 
ON leave_requests FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_insert_requests" 
ON leave_requests FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_delete_requests" 
ON leave_requests FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Leave Balances - Super admin can see and modify all
CREATE POLICY "super_admin_view_all_balances" 
ON leave_balances FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_update_all_balances" 
ON leave_balances FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Departments - Super admin can manage all
CREATE POLICY "super_admin_view_all_departments" 
ON departments FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "super_admin_manage_departments" 
ON departments FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Leave Types - Super admin can manage all
CREATE POLICY "super_admin_manage_leave_types" 
ON leave_types FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Public Holidays - Super admin can manage all
CREATE POLICY "super_admin_manage_holidays" 
ON public_holidays FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Audit Logs - Super admin can view all
CREATE POLICY "super_admin_view_audit_logs" 
ON audit_logs FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Notifications - Super admin can manage all
CREATE POLICY "super_admin_manage_notifications" 
ON notifications FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Step 4: Create view to hide super_admin from regular HR admin queries
CREATE OR REPLACE VIEW hr_visible_users AS
SELECT * FROM users_profile
WHERE role != 'super_admin';

GRANT SELECT ON hr_visible_users TO authenticated;

COMMENT ON VIEW hr_visible_users IS 'User profiles visible to HR admins (excludes super_admin role)';

-- Step 5: Add helpful comments
COMMENT ON COLUMN users_profile.role IS 'User role: employee, hod, hr_admin, or super_admin (super_admin is hidden from HR views)';

-- Verification: Check the super admin user was created
SELECT 
  id,
  employee_id,
  email, 
  first_name, 
  last_name, 
  role, 
  job_title,
  is_active,
  created_at
FROM users_profile
WHERE email = 'oliverkiptook@gmail.com';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '===========================================';
  RAISE NOTICE 'Super Admin Setup Complete!';
  RAISE NOTICE 'Email: oliverkiptook@gmail.com';
  RAISE NOTICE 'Role: super_admin';
  RAISE NOTICE 'Access: Full system access';
  RAISE NOTICE 'Visibility: Hidden from HR admin user lists';
  RAISE NOTICE '===========================================';
END $$;
