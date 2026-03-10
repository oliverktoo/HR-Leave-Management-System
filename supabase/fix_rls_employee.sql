-- ================================================
-- Fix RLS Issue for New Employee
-- ================================================

-- 1. Check if oliverktoo user exists in auth and profile
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

-- 2. If profile doesn't exist, create it
-- First, get the auth user ID
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
  
  -- Delete existing profile if any
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
  
  -- Create leave balances
  DELETE FROM leave_balances WHERE user_id = v_user_id;
  
  INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation)
  SELECT 
    v_user_id,
    id,
    2025,
    max_days_per_year
  FROM leave_types
  WHERE is_active = true;
  
  RAISE NOTICE 'User profile created for oliverktoo@gmail.com';
END $$;

-- 3. Verify RLS policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'leave_requests'
ORDER BY policyname;

-- 4. Test query to simulate what the user can do
SET ROLE authenticated;
SET request.jwt.claims.sub = (SELECT id::text FROM auth.users WHERE email = 'oliverktoo@gmail.com');

SELECT 'Can see own profile:' as test, COUNT(*) as result
FROM users_profile 
WHERE id = auth.uid();

SELECT 'Can see leave types:' as test, COUNT(*) as result
FROM leave_types;

SELECT 'Can see leave balances:' as test, COUNT(*) as result
FROM leave_balances 
WHERE user_id = auth.uid();

RESET ROLE;
