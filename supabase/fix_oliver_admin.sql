-- Fix Admin Login for oliverkiptook@gmail.com
-- Run this in your Supabase SQL Editor

-- First, let's check what exists for your email
SELECT 
    au.id as auth_id,
    au.email as auth_email,
    au.created_at,
    up.id as profile_id,
    up.role,
    up.first_name,
    up.last_name
FROM auth.users au
LEFT JOIN users_profile up ON au.id = up.id
WHERE au.email = 'oliverkiptook@gmail.com';

-- If you see an auth user but no profile (profile_id is null), run this:
-- (This will automatically use your auth user ID)

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
)
SELECT 
    au.id,
    'EMP001',
    'oliverkiptook@gmail.com',
    'Oliver',
    'Kiptook',
    (SELECT id FROM departments WHERE name ILIKE '%hr%' OR name ILIKE '%human%' LIMIT 1),
    'System Administrator',
    'hr_admin',
    CURRENT_DATE,
    true
FROM auth.users au
WHERE au.email = 'oliverkiptook@gmail.com'
AND NOT EXISTS (
    SELECT 1 FROM users_profile up WHERE up.id = au.id
);

-- If the profile exists but doesn't have admin role, run this:
UPDATE users_profile 
SET role = 'hr_admin',
    job_title = 'System Administrator',
    is_active = true
WHERE email = 'oliverkiptook@gmail.com';

-- Verify the fix
SELECT 
    up.id,
    up.email,
    up.first_name,
    up.last_name,
    up.role,
    up.job_title,
    up.is_active,
    d.name as department_name
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
WHERE up.email = 'oliverkiptook@gmail.com';

-- Success message
SELECT 'Admin profile fixed! You can now log in with oliverkiptook@gmail.com' as message;