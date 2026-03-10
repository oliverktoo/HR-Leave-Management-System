-- ================================================
-- Fix Employee Setup (Avoiding FK Conflicts)
-- ================================================

-- Step 1: Check if user exists in auth
SELECT 
  au.id as auth_id,
  au.email as auth_email,
  up.id as profile_id,
  up.email as profile_email
FROM auth.users au
LEFT JOIN users_profile up ON au.id = up.id
WHERE au.email = 'oliverktoo@gmail.com';

-- Step 2: Create/Update profile WITHOUT deleting first
DO $$
DECLARE
  v_user_id UUID;
  v_it_dept_id UUID;
  v_profile_exists BOOLEAN;
BEGIN
  -- Get user ID from auth
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'oliverktoo@gmail.com';
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found in auth.users. Create user in Authentication > Users first.';
  END IF;
  
  -- Get IT department ID
  SELECT id INTO v_it_dept_id FROM departments WHERE name = 'IT';
  
  -- Check if profile exists
  SELECT EXISTS(SELECT 1 FROM users_profile WHERE id = v_user_id) INTO v_profile_exists;
  
  IF v_profile_exists THEN
    -- Update existing profile
    RAISE NOTICE 'Profile exists, updating...';
    
    UPDATE users_profile SET
      employee_id = 'EMP-IT-002',
      first_name = 'Oliver',
      last_name = 'Ktoo',
      email = 'oliverktoo@gmail.com',
      department_id = v_it_dept_id,
      role = 'employee',
      job_title = 'Software Developer',
      hire_date = CURRENT_DATE,
      is_active = true
    WHERE id = v_user_id;
    
  ELSE
    -- Create new profile
    RAISE NOTICE 'Creating new profile...';
    
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
  
  -- Delete and recreate leave balances
  DELETE FROM leave_balances WHERE user_id = v_user_id;
  
  INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation)
  SELECT 
    v_user_id,
    id,
    2025,
    max_days_per_year
  FROM leave_types
  WHERE is_active = true;
  
  RAISE NOTICE '✅ User profile configured successfully!';
  RAISE NOTICE 'Email: oliverktoo@gmail.com';
  RAISE NOTICE 'Department: IT';
  RAISE NOTICE 'Role: employee';
END $$;

-- Step 3: Make oliverkiptook@gmail.com HOD of IT department
UPDATE departments 
SET head_of_department_id = (
  SELECT id FROM users_profile WHERE email = 'oliverkiptook@gmail.com'
)
WHERE name = 'IT';

-- Step 4: Verify the setup
SELECT 
  d.name as department,
  hod.first_name || ' ' || hod.last_name as hod_name,
  hod.email as hod_email,
  emp.first_name || ' ' || emp.last_name as employee_name,
  emp.email as employee_email,
  emp.role as employee_role
FROM departments d
LEFT JOIN users_profile hod ON d.head_of_department_id = hod.id
LEFT JOIN users_profile emp ON emp.department_id = d.id
WHERE d.name = 'IT'
ORDER BY emp.role DESC;
