-- Verify and Display All User Data Setup
-- Run this to check what data exists and what's missing

-- 1. CHECK ACTIVE LEAVE TYPES
SELECT 
    '==================== LEAVE TYPES ====================' as info,
    NULL as count, NULL as details
UNION ALL
SELECT 
    'Active Leave Types:' as info,
    COUNT(*)::text as count,
    STRING_AGG(name || ' (' || max_days_per_year || ' days)', ', ') as details
FROM leave_types 
WHERE is_active = true;

-- 2. CHECK ACTIVE USERS
SELECT 
    '==================== USERS ====================' as info,
    NULL as count, NULL as details
UNION ALL
SELECT 
    'Active Employees:' as info,
    COUNT(*)::text as count,
    STRING_AGG(first_name || ' ' || last_name || ' - ' || role, ', ') as details
FROM users_profile 
WHERE is_active = true;

-- 3. CHECK DEPARTMENTS
SELECT 
    '==================== DEPARTMENTS ====================' as info,
    NULL as count, NULL as details
UNION ALL
SELECT 
    'Active Departments:' as info,
    COUNT(*)::text as count,
    STRING_AGG(name, ', ') as details
FROM departments 
WHERE is_active = true;

-- 4. CHECK LEAVE BALANCES FOR 2026
SELECT 
    '==================== LEAVE BALANCES (2026) ====================' as info,
    NULL as count, NULL as details
UNION ALL
SELECT 
    'Employees with Balances:' as info,
    COUNT(DISTINCT user_id)::text as count,
    'Total balance records: ' || COUNT(*)::text as details
FROM leave_balances 
WHERE year = 2026;

-- Detailed view: Show which employees HAVE balances
SELECT 
    '==================== EMPLOYEES WITH BALANCES ====================' as section,
    NULL as employee, NULL as email, NULL as balance_count
UNION ALL
SELECT 
    NULL as section,
    up.first_name || ' ' || up.last_name as employee,
    up.email,
    COUNT(lb.id)::text || ' leave types' as balance_count
FROM users_profile up
LEFT JOIN leave_balances lb ON up.id = lb.user_id AND lb.year = 2026
WHERE up.is_active = true
GROUP BY up.id, up.first_name, up.last_name, up.email
ORDER BY section NULLS LAST, employee;

-- Detailed view: Show which employees DON'T have balances
SELECT 
    '==================== EMPLOYEES WITHOUT BALANCES ====================' as warning,
    up.first_name || ' ' || up.last_name as employee_name,
    up.email,
    up.role
FROM users_profile up
LEFT JOIN leave_balances lb ON up.id = lb.user_id AND lb.year = 2026
WHERE up.is_active = true
AND lb.id IS NULL
AND up.role != 'super_admin';

-- Show full balance breakdown for all users
SELECT 
    '==================== FULL BALANCE BREAKDOWN ====================' as section,
    NULL as employee, NULL as leave_type, NULL as allocated, NULL as used, NULL as available
UNION ALL
SELECT 
    NULL as section,
    up.first_name || ' ' || up.last_name as employee,
    lt.name as leave_type,
    lb.annual_allocation::text as allocated,
    lb.used_days::text as used,
    (lb.annual_allocation + lb.carryforward_days - lb.used_days - lb.pending_days)::text as available
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE lb.year = 2026
AND up.is_active = true
ORDER BY section NULLS LAST, employee, leave_type;
