-- Check RLS policies for attendance_records table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'attendance_records'
ORDER BY policyname;

-- Check if HOD can see attendance records for their department
-- Replace the UUID with Oliver's ID: 6c0e92ce-91a0-41de-8f95-75c80d5021b4
SELECT 
    ar.*,
    up.first_name,
    up.last_name,
    up.department_id,
    d.name as department_name
FROM attendance_records ar
JOIN users_profile up ON ar.user_id = up.id
JOIN departments d ON up.department_id = d.id
WHERE up.department_id = '00000000-0000-0000-0000-000000000002'
ORDER BY ar.date DESC
LIMIT 10;

-- Check Oliver's profile and department
SELECT 
    up.id,
    up.email,
    up.role,
    up.department_id,
    d.name as department_name
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
WHERE up.email = 'oliverktoo@gmail.com';

-- Check all users in Infrastructure department
SELECT 
    up.id,
    up.email,
    up.first_name,
    up.last_name,
    up.role,
    up.department_id
FROM users_profile up
WHERE up.department_id = '00000000-0000-0000-0000-000000000002'
ORDER BY up.last_name;
