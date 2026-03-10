-- Fix to check and verify leave request dates for oliverktoo@gmail.com
-- Run this in Supabase SQL Editor to see the actual stored dates

-- 1. CHECK THE USER
SELECT 
    id,
    email,
    first_name,
    last_name,
    employee_id
FROM users_profile
WHERE email = 'oliverktoo@gmail.com';

-- 2. VIEW ALL LEAVE REQUESTS WITH DATES
SELECT 
    lr.id as request_id,
    up.first_name || ' ' || up.last_name as employee_name,
    up.email,
    lt.name as leave_type,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lr.status,
    lr.reason,
    lr.created_at as submitted_on
FROM leave_requests lr
JOIN users_profile up ON lr.user_id = up.id
LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
WHERE up.email = 'oliverktoo@gmail.com'
ORDER BY lr.created_at DESC;

-- 3. CHECK IF DATES NEED CORRECTION (Example: If you need to update a specific request)
-- UNCOMMENT AND MODIFY THIS IF YOU NEED TO FIX INCORRECT DATES:
/*
UPDATE leave_requests
SET 
    start_date = '2026-03-01',  -- Change to correct start date
    end_date = '2026-03-05',     -- Change to correct end date
    total_days = 5               -- Update total days
WHERE id = 'your-request-id-here'  -- Replace with actual request ID
    AND user_id = (SELECT id FROM users_profile WHERE email = 'oliverktoo@gmail.com');
*/

-- 4. VERIFY THE UPDATE (if you made changes)
/*
SELECT 
    lr.id,
    lr.start_date,
    lr.end_date,
    lr.total_days,
    lt.name as leave_type,
    lr.status
FROM leave_requests lr
LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
WHERE lr.user_id = (SELECT id FROM users_profile WHERE email = 'oliverktoo@gmail.com')
ORDER BY lr.created_at DESC
LIMIT 1;
*/
