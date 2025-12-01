-- ================================================
-- Create Test Employee for Approval Testing
-- ================================================

-- 1. First, create a test user in auth.users
-- Note: This needs to be done via Supabase Dashboard > Authentication > Users
-- Click "Invite User" or "Add User" and use: test.employee@example.com

-- 2. After creating the auth user, get their ID and run this:
-- Replace 'PASTE_AUTH_USER_ID_HERE' with the actual UUID from auth.users

DO $$
DECLARE
  v_user_id UUID := 'PASTE_AUTH_USER_ID_HERE'; -- Replace this!
  v_hr_dept_id UUID;
BEGIN
  -- Get HR department ID
  SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'Human Resources';
  
  -- Create user profile
  INSERT INTO users_profile (
    id,
    employee_id,
    first_name,
    last_name,
    email,
    department_id,
    role,
    job_title,
    hire_date,
    is_active
  ) VALUES (
    v_user_id,
    'EMP-TEST-001',
    'Test',
    'Employee',
    'test.employee@example.com',
    v_hr_dept_id,
    'employee',
    'HR Assistant',
    CURRENT_DATE,
    true
  );
  
  -- Create leave balances for 2025
  INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation)
  SELECT 
    v_user_id,
    id,
    2025,
    max_days_per_year
  FROM leave_types
  WHERE is_active = true;
  
  RAISE NOTICE 'Test employee created successfully!';
  RAISE NOTICE 'Email: test.employee@example.com';
  RAISE NOTICE 'Department: Human Resources';
  RAISE NOTICE 'Role: employee';
END $$;
