-- MASTER SETUP SCRIPT - Run this FIRST
-- This script runs all necessary setup steps in the correct order
-- Safe to run multiple times

-- ==============================================
-- STEP 1: Fix color column if needed
-- ==============================================
DO $$
BEGIN
    -- Case 1: If color_code exists but color doesn't, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) THEN
        ALTER TABLE leave_types RENAME COLUMN color_code TO color;
        RAISE NOTICE '✅ Renamed color_code to color';
    END IF;
    
    -- If both exist, drop color_code and keep color
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) THEN
        ALTER TABLE leave_types DROP COLUMN color_code;
        RAISE NOTICE '✅ Dropped duplicate color_code column';
    END IF;
    
    -- If neither exists, add color column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) THEN
        ALTER TABLE leave_types ADD COLUMN color VARCHAR(7) DEFAULT '#4F46E5';
        RAISE NOTICE '✅ Added color column';
    END IF;
END $$;

-- Fix the check constraint to allow 0 days (for unpaid leave)
DO $$
BEGIN
    -- Drop old constraint if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_positive' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types DROP CONSTRAINT chk_max_days_positive;
        RAISE NOTICE '✅ Dropped old max_days constraint';
    END IF;
    
    -- Add new constraint that allows >= 0
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_non_negative' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types ADD CONSTRAINT chk_max_days_non_negative CHECK (max_days_per_year >= 0);
        RAISE NOTICE '✅ Added new max_days constraint (allows 0)';
    END IF;
END $$;

-- ==============================================
-- STEP 2: Fix RLS policy for leave_balances
-- ==============================================
DROP POLICY IF EXISTS "hr_manage_balances" ON leave_balances;

CREATE POLICY "hr_manage_balances" ON leave_balances
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() 
    AND role IN ('hr_admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() 
    AND role IN ('hr_admin', 'super_admin')
  )
);

-- ==============================================
-- STEP 3: Ensure base data exists
-- ==============================================
BEGIN;

-- Leave Types
INSERT INTO leave_types (name, description, max_days_per_year, requires_documentation, min_notice_days, is_active)
VALUES 
    ('Annual Leave', 'Paid annual vacation leave', 21, false, 7, true),
    ('Sick Leave', 'Medical or health-related leave', 10, true, 0, true),
    ('Maternity Leave', 'Leave for expecting mothers', 90, true, 30, true),
    ('Paternity Leave', 'Leave for new fathers', 14, true, 7, true),
    ('Compassionate Leave', 'Leave for family emergencies or bereavement', 7, false, 0, true),
    ('Study Leave', 'Educational or training leave', 5, true, 14, true),
    ('Unpaid Leave', 'Leave without pay', 0, false, 7, true)
ON CONFLICT (name) DO UPDATE SET
    max_days_per_year = EXCLUDED.max_days_per_year,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- Update colors for leave types (if color column exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) THEN
        UPDATE leave_types
        SET color = CASE 
            WHEN LOWER(name) LIKE '%annual%' THEN '#3b82f6'
            WHEN LOWER(name) LIKE '%sick%' THEN '#ef4444'
            WHEN LOWER(name) LIKE '%maternity%' THEN '#ec4899'
            WHEN LOWER(name) LIKE '%paternity%' THEN '#8b5cf6'
            WHEN LOWER(name) LIKE '%compassionate%' THEN '#6b7280'
            WHEN LOWER(name) LIKE '%study%' THEN '#10b981'
            WHEN LOWER(name) LIKE '%unpaid%' THEN '#f59e0b'
            ELSE COALESCE(color, '#4F46E5')
        END;
        RAISE NOTICE '✅ Updated leave type colors';
    END IF;
END $$;

-- Departments
INSERT INTO departments (name, description, is_active)
VALUES 
    ('Human Resources', 'HR and People Operations', true),
    ('Finance', 'Finance and Accounting', true),
    ('Operations', 'Operations and Logistics', true),
    ('Marketing', 'Marketing and Communications', true),
    ('IT', 'Information Technology', true),
    ('Technical', 'Technical Department', true),
    ('Administration', 'General Administration', true)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;

-- System Settings
INSERT INTO system_settings (id, settings, updated_at)
VALUES (
    1,
    '{
        "max_annual_leave_days": 21,
        "max_sick_leave_days": 10,
        "max_maternity_leave_days": 90,
        "max_paternity_leave_days": 14,
        "leave_year_start_month": 1,
        "carry_forward_limit": 5,
        "minimum_notice_days": 7,
        "auto_approve_limit": 0,
        "require_hod_approval": true,
        "require_hr_approval": false,
        "escalation_days": 3,
        "email_notifications": true,
        "reminder_notifications": true,
        "approval_notifications": true,
        "working_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        "exclude_weekends": true,
        "exclude_holidays": true,
        "allow_backdated_requests": false,
        "max_future_booking_months": 12
    }'::jsonb,
    NOW()
)
ON CONFLICT (id) DO UPDATE SET
    settings = EXCLUDED.settings,
    updated_at = NOW();

-- Public Holidays for 2026 (Kenya Example)
INSERT INTO public_holidays (name, date, description, is_recurring)
VALUES 
    ('New Year''s Day', '2026-01-01', 'New Year celebration', true),
    ('Good Friday', '2026-04-03', 'Christian holiday', false),
    ('Easter Monday', '2026-04-06', 'Christian holiday', false),
    ('Labour Day', '2026-05-01', 'International Workers Day', true),
    ('Madaraka Day', '2026-06-01', 'Self-governance day', true),
    ('Mashujaa Day', '2026-10-20', 'Heroes Day', true),
    ('Jamhuri Day', '2026-12-12', 'Independence Day', true),
    ('Christmas Day', '2026-12-25', 'Christmas celebration', true),
    ('Boxing Day', '2026-12-26', 'Day after Christmas', true)
ON CONFLICT (date) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

COMMIT;

-- ==============================================
-- VERIFICATION
-- ==============================================
SELECT 
    '==================== SETUP SUMMARY ====================' as info,
    '' as value
UNION ALL
SELECT 
    'Leave Types:',
    COUNT(*)::text || ' active'
FROM leave_types WHERE is_active = true
UNION ALL
SELECT 
    'Departments:',
    COUNT(*)::text || ' active'
FROM departments WHERE is_active = true
UNION ALL
SELECT 
    'Active Employees:',
    COUNT(*)::text
FROM users_profile WHERE is_active = true AND role != 'super_admin'
UNION ALL
SELECT 
    'Public Holidays (2026):',
    COUNT(*)::text
FROM public_holidays WHERE date >= '2026-01-01' AND date < '2027-01-01';

-- Show leave types
SELECT 
    '==================== LEAVE TYPES ====================' as section,
    NULL as name, NULL as max_days
UNION ALL
SELECT 
    NULL,
    name,
    max_days_per_year::text || ' days'
FROM leave_types 
WHERE is_active = true
ORDER BY section NULLS LAST, name;

SELECT '✅ MASTER SETUP COMPLETE! Next: Run populate_all_leave_balances.sql' as next_step;
