-- Simple Database Check and Admin Setup
-- Run this to see what's already in your database and set up admin access

-- Check existing tables
SELECT 
  schemaname,
  tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Check if we have users_profile table and what roles exist
SELECT 
  role,
  COUNT(*) as user_count
FROM users_profile 
GROUP BY role
ORDER BY role;

-- Check existing departments
SELECT id, name, description FROM departments ORDER BY name;

-- Check existing leave types
SELECT id, name, max_days_per_year, color_code FROM leave_types ORDER BY name;

-- If you need to create an admin user, first check if one exists
SELECT 
  up.id,
  up.email,
  up.first_name,
  up.last_name,
  up.role,
  au.email as auth_email
FROM users_profile up
LEFT JOIN auth.users au ON up.id = au.id
WHERE up.role = 'hr_admin';

-- Instructions for creating admin user if none exists:
-- 1. Go to Authentication > Users in Supabase Dashboard
-- 2. Create user with email: admin@fkf.com, password: Admin123!@#
-- 3. Copy the generated User ID
-- 4. Run this insert (replace USER_ID with actual ID):
/*
INSERT INTO users_profile (
    id,
    employee_id,
    email,
    first_name,
    last_name,
    department_id,
    job_title,
    role,
    hire_date,
    is_active
) VALUES (
    'REPLACE_WITH_ACTUAL_USER_ID',
    'EMP001',
    'admin@fkf.com',
    'System',
    'Administrator',
    (SELECT id FROM departments WHERE name = 'Human Resources' LIMIT 1),
    'HR Administrator',
    'hr_admin',
    CURRENT_DATE,
    true
);
*/