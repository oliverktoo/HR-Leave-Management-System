-- Show Ann's 2 pending requests with full details
SELECT 
    lr.id as request_id,
    lr.status,
    lr.user_id,
    lr.leave_type_id,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lr.reason,
    lr.created_at,
    -- User details
    up.email as user_email,
    up.first_name,
    up.last_name,
    up.employee_id,
    up.department_id as user_department_id,
    -- Leave type details
    lt.id as leave_type_table_id,
    lt.name as leave_type_name
FROM leave_requests lr
JOIN users_profile up ON up.id = lr.user_id
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE up.email = 'ann.kiarie@footballkenya.org'
  AND lr.status = 'pending'
ORDER BY lr.created_at DESC;

-- Check if the leave_type_id foreign key exists properly
SELECT 
    lr.id,
    lr.leave_type_id,
    lt.id as leave_types_id,
    lt.name as leave_type_name
FROM leave_requests lr
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.user_id = '0fd21af0-c689-4bef-b676-bfaf02c5b26b'
  AND lr.status = 'pending';
