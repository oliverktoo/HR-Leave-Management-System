-- Populate Leave Balances for All Active Employees
-- Run this in Supabase SQL Editor to create leave balances for all users
-- This allows them to see their real data on the dashboard

-- Current year
DO $$
DECLARE
    v_year INTEGER := 2026;
    v_user RECORD;
    v_leave_type RECORD;
    v_settings JSONB;
    v_allocation INTEGER;
BEGIN
    -- Get system settings for default allocations
    SELECT settings INTO v_settings FROM system_settings WHERE id = 1;
    
    IF v_settings IS NULL THEN
        RAISE NOTICE '⚠️  No system settings found. Using hardcoded defaults.';
        v_settings := '{
            "max_annual_leave_days": 21,
            "max_sick_leave_days": 10,
            "max_maternity_leave_days": 90,
            "max_paternity_leave_days": 14
        }'::jsonb;
    END IF;

    -- Loop through all active employees (excluding super_admin)
    FOR v_user IN 
        SELECT id, first_name, last_name, email, role
        FROM users_profile 
        WHERE is_active = true 
        AND role != 'super_admin'
    LOOP
        -- Loop through all active leave types
        FOR v_leave_type IN 
            SELECT id, name, max_days_per_year 
            FROM leave_types 
            WHERE is_active = true
        LOOP
            -- Determine allocation based on leave type name
            v_allocation := CASE 
                WHEN LOWER(v_leave_type.name) LIKE '%annual%' THEN 
                    COALESCE((v_settings->>'max_annual_leave_days')::INTEGER, 21)
                WHEN LOWER(v_leave_type.name) LIKE '%sick%' THEN 
                    COALESCE((v_settings->>'max_sick_leave_days')::INTEGER, 10)
                WHEN LOWER(v_leave_type.name) LIKE '%maternity%' THEN 
                    COALESCE((v_settings->>'max_maternity_leave_days')::INTEGER, 90)
                WHEN LOWER(v_leave_type.name) LIKE '%paternity%' THEN 
                    COALESCE((v_settings->>'max_paternity_leave_days')::INTEGER, 14)
                WHEN LOWER(v_leave_type.name) LIKE '%compassionate%' THEN 7
                WHEN LOWER(v_leave_type.name) LIKE '%study%' THEN 5
                WHEN LOWER(v_leave_type.name) LIKE '%unpaid%' THEN 0
                ELSE v_leave_type.max_days_per_year
            END;

            -- Insert or update leave balance
            INSERT INTO leave_balances (
                user_id, 
                leave_type_id, 
                year, 
                annual_allocation, 
                used_days, 
                pending_days, 
                carryforward_days
            )
            VALUES (
                v_user.id,
                v_leave_type.id,
                v_year,
                v_allocation,
                0, -- used_days starts at 0
                0, -- pending_days starts at 0
                0  -- carryforward_days (can be updated later)
            )
            ON CONFLICT (user_id, leave_type_id, year) 
            DO UPDATE SET
                annual_allocation = EXCLUDED.annual_allocation,
                updated_at = NOW();
        END LOOP;
        
        RAISE NOTICE '✅ Created balances for: % % (%)', v_user.first_name, v_user.last_name, v_user.email;
    END LOOP;
    
    RAISE NOTICE '🎉 Leave balances populated for all active employees for year %!', v_year;
END $$;

-- Verify the results
SELECT 
    up.first_name || ' ' || up.last_name as employee_name,
    up.email,
    up.role,
    lt.name as leave_type,
    lb.annual_allocation,
    lb.used_days,
    lb.pending_days,
    lb.carryforward_days,
    (lb.annual_allocation + lb.carryforward_days - lb.used_days - lb.pending_days) as available
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE lb.year = 2026
AND up.is_active = true
ORDER BY up.first_name, up.last_name, lt.name;

-- Summary statistics
SELECT 
    up.role,
    COUNT(DISTINCT up.id) as employee_count,
    COUNT(lb.id) as total_balance_records,
    COALESCE(SUM(lb.annual_allocation), 0) as total_days_allocated
FROM users_profile up
LEFT JOIN leave_balances lb ON up.id = lb.user_id AND lb.year = 2026
WHERE up.is_active = true AND up.role != 'super_admin'
GROUP BY up.role
ORDER BY up.role;
