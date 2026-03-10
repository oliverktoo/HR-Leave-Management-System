-- Check Ann Kiarie's leave requests specifically
SELECT 
    lr.id,
    lr.status,
    lr.created_at,
    lt.name as leave_type,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lr.user_id,
    up.email,
    up.department_id
FROM leave_requests lr
JOIN users_profile up ON up.id = lr.user_id
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE up.email = 'ann.kiarie@footballkenya.org'
ORDER BY lr.created_at DESC;

-- Check all pending requests with full details
SELECT 
    lr.id,
    lr.status,
    lr.user_id,
    up.email,
    up.first_name,
    up.last_name,
    up.department_id,
    d.name as department_name,
    lt.name as leave_type,
    lr.start_date,
    lr.end_date
FROM leave_requests lr
JOIN users_profile up ON up.id = lr.user_id
LEFT JOIN departments d ON d.id = up.department_id
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.status = 'pending'
ORDER BY lr.created_at DESC;

-- Check what statuses Ann's requests have
SELECT status, COUNT(*) as count
FROM leave_requests 
WHERE user_id = '0fd21af0-c689-4bef-b676-bfaf02c5b26b'
GROUP BY status;
