-- Direct test: Get Ann's pending leave requests
-- This should return 2 records
SELECT 
    lr.*,
    lt.name as leave_type_name,
    lt.color as leave_type_color
FROM leave_requests lr
LEFT JOIN leave_types lt ON lt.id = lr.leave_type_id
WHERE lr.user_id = '0fd21af0-c689-4bef-b676-bfaf02c5b26b'
  AND lr.status = 'pending';

-- Check foreign key constraint name
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'leave_requests'
  AND tc.constraint_type = 'FOREIGN KEY';
