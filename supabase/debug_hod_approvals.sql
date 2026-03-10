-- Debug HOD Approvals Issue
-- Find out why HOD can't see leave requests

-- 1. Check the HOD user and their department
SELECT 
    id,
    email,
    first_name,
    last_name,
    role,
    department_id,
    (SELECT name FROM departments WHERE id = users_profile.department_id) as department_name
FROM users_profile
WHERE role = 'hod'
ORDER BY email;

-- 2. Check all employees in Infrastructure department (assuming it's department_id = '00000000-0000-0000-0000-000000000002')
SELECT 
    up.id,
    up.email,
    up.first_name,
    up.last_name,
    up.role,
    d.name as department_name,
    up.department_id
FROM users_profile up
LEFT JOIN departments d ON d.id = up.department_id
WHERE up.department_id = '00000000-0000-0000-0000-000000000002'
ORDER BY up.role, up.first_name;

-- 3. Check all pending leave requests and which department the users are in
SELECT 
    lr.id as request_id,
    lr.status,
    lr.created_at,
    lt.name as leave_type,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    up.first_name || ' ' || up.last_name as employee_name,
    up.email as employee_email,
    up.department_id as employee_dept_id,
    d.name as department_name
FROM leave_requests lr
JOIN users_profile up ON up.id = lr.user_id
LEFT JOIN departments d ON d.id = up.department_id
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.status = 'pending'
ORDER BY lr.created_at DESC;

-- 4. Check all departments
SELECT 
    id,
    name,
    is_active,
    (SELECT COUNT(*) FROM users_profile WHERE department_id = departments.id) as employee_count
FROM departments
ORDER BY name;

-- 5. Check if there's a mismatch - employees who submitted requests but may not have department_id set
SELECT 
    up.id,
    up.email,
    up.first_name,
    up.last_name,
    up.department_id,
    COUNT(lr.id) as pending_requests
FROM users_profile up
JOIN leave_requests lr ON lr.user_id = up.id
WHERE lr.status = 'pending'
GROUP BY up.id, up.email, up.first_name, up.last_name, up.department_id
ORDER BY pending_requests DESC;
