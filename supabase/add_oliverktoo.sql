-- ================================================
-- Add oliverktoo@gmail.com as Test Employee
-- ================================================

-- Step 1: First check if user exists in auth.users
-- Run this query to find the user ID:
SELECT id, email FROM auth.users WHERE email = 'oliverktoo@gmail.com';

-- If user doesn't exist, go to Supabase Dashboard > Authentication > Users
-- and invite/create user with email: oliverktoo@gmail.com
-- Then come back and run the queries below

-- Step 2: Create user profile and assign to IT department
-- Replace 'USER_ID_FROM_AUTH' with the actual UUID from auth.users

DO $$
DECLARE
  v_user_id UUID;
  v_it_dept_id UUID;
BEGIN
  -- Get user ID from auth.users
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'oliverktoo@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User oliverktoo@gmail.com not found in auth.users. Please create the user first.';
  END IF;
  
  -- Get IT department ID
  SELECT id INTO v_it_dept_id FROM departments WHERE name = 'IT';
  
  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM users_profile WHERE id = v_user_id) THEN
    RAISE NOTICE 'User profile already exists, updating...';
    
    -- Update existing profile
    UPDATE users_profile SET
      employee_id = 'EMP-IT-002',
      first_name = 'Oliver',
      last_name = 'Ktoo',
      department_id = v_it_dept_id,
      role = 'employee',
      job_title = 'Software Developer',
      is_active = true
    WHERE id = v_user_id;
  ELSE
    -- Create new user profile
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
      'EMP-IT-002',
      'Oliver',
      'Ktoo',
      'oliverktoo@gmail.com',
      v_it_dept_id,
      'employee',
      'Software Developer',
      CURRENT_DATE,
      true
    );
  END IF;
  
  -- Delete existing leave balances (if any)
  DELETE FROM leave_balances WHERE user_id = v_user_id;
  
  -- Create leave balances for 2025
  INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation)
  SELECT 
    v_user_id,
    id,
    2025,
    max_days_per_year
  FROM leave_types
  WHERE is_active = true;
  
  RAISE NOTICE '✅ User oliverktoo@gmail.com configured successfully!';
  RAISE NOTICE 'Department: IT';
  RAISE NOTICE 'Role: employee';
  RAISE NOTICE 'Employee ID: EMP-IT-002';
  RAISE NOTICE 'Now assign yourself as HOD of IT department to see their requests';
END $$;

-- Step 3: Make yourself (oliverkiptook@gmail.com) HOD of IT department
UPDATE departments 
SET head_of_department_id = 'a16fcdb3-7af0-4885-901a-93630290141c'
WHERE name = 'IT';

-- Verify the setup
SELECT 
  d.name as department,
  d.head_of_department_id,
  hod.first_name || ' ' || hod.last_name as hod_name,
  emp.first_name || ' ' || emp.last_name as employee_name,
  emp.email as employee_email
FROM departments d
LEFT JOIN users_profile hod ON d.head_of_department_id = hod.id
LEFT JOIN users_profile emp ON emp.department_id = d.id
WHERE d.name = 'IT';
