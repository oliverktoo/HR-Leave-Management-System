-- Add leave balances for Oliver (HR Admin) so dashboard shows real data
-- Run this in Supabase SQL Editor

-- First check current leave types
SELECT id, name, max_days_per_year FROM leave_types;

-- Add leave balances for Oliver for 2025
DO $$
DECLARE
    v_user_id uuid := 'a16fcdb3-7af0-4885-901a-93630290141c';
BEGIN
    -- Annual Leave - 21 days
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT v_user_id, id, 2025, 21, 0, 0, 0
    FROM leave_types 
    WHERE name = 'Annual Leave'
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        annual_allocation = 21;

    -- Sick Leave - 14 days
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT v_user_id, id, 2025, 14, 0, 0, 0
    FROM leave_types 
    WHERE name = 'Sick Leave'
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        annual_allocation = 14;

    -- Maternity Leave - 90 days
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT v_user_id, id, 2025, 90, 0, 0, 0
    FROM leave_types 
    WHERE name = 'Maternity Leave'
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        annual_allocation = 90;

    -- Paternity Leave - 14 days
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT v_user_id, id, 2025, 14, 0, 0, 0
    FROM leave_types 
    WHERE name = 'Paternity Leave'
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        annual_allocation = 14;

    -- Compassionate Leave - 7 days
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT v_user_id, id, 2025, 7, 0, 0, 0
    FROM leave_types 
    WHERE name = 'Compassionate Leave'
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        annual_allocation = 7;

    RAISE NOTICE '✅ Leave balances added for Oliver!';
    RAISE NOTICE 'Total allocation: 146 days across all leave types';
END $$;

-- Verify the balances
SELECT 
    lt.name as leave_type,
    lb.annual_allocation,
    lb.used_days,
    lb.pending_days,
    lb.carryforward_days,
    (lb.annual_allocation + lb.carryforward_days - lb.used_days - lb.pending_days) as available
FROM leave_balances lb
JOIN leave_types lt ON lb.leave_type_id = lt.id
JOIN users_profile up ON lb.user_id = up.id
WHERE up.email = 'oliverkiptook@gmail.com' AND lb.year = 2025
ORDER BY lt.name;