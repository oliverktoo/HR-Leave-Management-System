-- Check leave requests for oliverktoo@gmail.com

-- First, find the user
SELECT 
    id,
    email,
    first_name,
    last_name,
    employee_id
FROM users_profile
WHERE email = 'oliverktoo@gmail.com';

-- Check their leave requests
SELECT 
    lr.id,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lr.status,
    lr.created_at,
    lt.name as leave_type,
    lr.reason,
    up.first_name || ' ' || up.last_name as employee_name,
    up.email as employee_email
FROM leave_requests lr
JOIN users_profile up ON lr.user_id = up.id
LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
WHERE up.email = 'oliverktoo@gmail.com'
ORDER BY lr.created_at DESC;

-- Check the exact date values with timezone info
SELECT 
    lr.id,
    lr.start_date::text as start_date_text,
    lr.end_date::text as end_date_text,
    lr.start_date::date as start_date_only,
    lr.end_date::date as end_date_only,
    lr.total_days,
    lr.status
FROM leave_requests lr
JOIN users_profile up ON lr.user_id = up.id
WHERE up.email = 'oliverktoo@gmail.com'
ORDER BY lr.created_at DESC;
