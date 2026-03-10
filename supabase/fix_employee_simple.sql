-- ================================================
-- Fix RLS Issue - Create Employee Profile
-- ================================================

-- Step 1: Check if user exists
SELECT 
  au.id as auth_id,
  au.email as auth_email,
  up.id as profile_id,
  up.email as profile_email,
  up.department_id,
  up.role
FROM auth.users au
LEFT JOIN users_profile up ON au.id = up.id
WHERE au.email = 'oliverktoo@gmail.com';

-- Step 2: Create profile if it doesn't exist
DO $$
DECLARE
  v_user_id UUID;
  v_it_dept_id UUID;
BEGIN
  -- Get user ID from auth
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'oliverktoo@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users. Create user in Authentication dashboard first.';
  END IF;
  
  -- Get IT department ID
  SELECT id INTO v_it_dept_id FROM departments WHERE name = 'IT';
  
  -- Delete existing profile if any (to start fresh)
  DELETE FROM leave_balances WHERE user_id = v_user_id;
  DELETE FROM users_profile WHERE id = v_user_id;
  
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
  
  -- Create leave balances for 2025
  INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation)
  SELECT 
    v_user_id,
    id,
    2025,
    max_days_per_year
  FROM leave_types
  WHERE is_active = true;
  
  RAISE NOTICE '✅ User profile created successfully!';
  RAISE NOTICE 'Email: oliverktoo@gmail.com';
  RAISE NOTICE 'Department: IT';
  RAISE NOTICE 'Role: employee';
END $$;

-- Step 3: Make oliverkiptook@gmail.com HOD of IT
UPDATE departments 
SET head_of_department_id = (
  SELECT id FROM users_profile WHERE email = 'oliverkiptook@gmail.com'
)
WHERE name = 'IT';

-- Step 4: Verify setup
SELECT 
  d.name as department,
  hod.email as hod_email,
  emp.email as employee_email,
  emp.role
FROM departments d
LEFT JOIN users_profile hod ON d.head_of_department_id = hod.id
LEFT JOIN users_profile emp ON emp.department_id = d.id
WHERE d.name = 'IT';

-- Step 5: Check RLS policies
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN cmd = 'SELECT' THEN 'View'
    WHEN cmd = 'INSERT' THEN 'Create'
    WHEN cmd = 'UPDATE' THEN 'Update'
    WHEN cmd = 'DELETE' THEN 'Delete'
  END as action
FROM pg_policies 
WHERE tablename = 'leave_requests'
  AND policyname LIKE '%users%'
ORDER BY policyname;
