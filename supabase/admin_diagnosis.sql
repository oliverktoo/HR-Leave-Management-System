-- Quick Admin Diagnosis Script
-- Run this in your Supabase SQL Editor to check admin status

-- 1. Check all auth users
SELECT id, email, created_at, email_confirmed_at 
FROM auth.users 
ORDER BY created_at;

-- 2. Check all user profiles  
SELECT id, email, first_name, last_name, role, is_active 
FROM users_profile 
ORDER BY created_at;

-- 3. Check for admin users without profiles
SELECT au.id, au.email, au.created_at, up.role
FROM auth.users au
LEFT JOIN users_profile up ON au.id = up.id
WHERE up.id IS NULL;

-- 4. Check existing admin profiles
SELECT up.*, au.email as auth_email
FROM users_profile up
JOIN auth.users au ON up.id = au.id
WHERE up.role = 'hr_admin' OR up.role = 'super_admin';

-- If you have an auth user but no profile, use this template:
-- (Replace USER_ID with your actual auth user ID)
/*
INSERT INTO users_profile (
    id, employee_id, email, first_name, last_name,
    department_id, job_title, role, hire_date, is_active
) VALUES (
    'YOUR_AUTH_USER_ID_HERE',
    'EMP001',
    'your-email@example.com',
    'Admin',
    'User',
    (SELECT id FROM departments WHERE name ILIKE '%hr%' LIMIT 1),
    'System Administrator',
    'hr_admin',
    CURRENT_DATE,
    true
);
*/