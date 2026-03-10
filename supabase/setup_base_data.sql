-- Complete System Data Setup
-- Run this FIRST to ensure all required base data exists before populating balances
-- Safe to run multiple times (uses ON CONFLICT)

BEGIN;

-- ==============================================
-- 0. FIX CHECK CONSTRAINT
-- ==============================================
-- Fix the constraint to allow 0 days for unpaid leave
DO $$
BEGIN
    -- Drop old constraint if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_positive' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types DROP CONSTRAINT chk_max_days_positive;
    END IF;
    
    -- Add new constraint that allows >= 0
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_non_negative' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types ADD CONSTRAINT chk_max_days_non_negative CHECK (max_days_per_year >= 0);
    END IF;
END $$;

-- ==============================================
-- 1. ENSURE LEAVE TYPES EXIST
-- ==============================================
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

-- ==============================================
-- 2. ENSURE DEPARTMENTS EXIST (Add your actual departments)
-- ==============================================
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

-- ==============================================
-- 3. ENSURE SYSTEM SETTINGS EXIST
-- ==============================================
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

-- ==============================================
-- 4. ADD SOME PUBLIC HOLIDAYS FOR 2026 (Kenya Example)
-- ==============================================
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
-- VERIFY SETUP
-- ==============================================
SELECT 
    '✅ SETUP COMPLETE!' as status,
    '' as details
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
FROM public_holidays WHERE date >= '2026-01-01' AND date < '2027-01-01'
UNION ALL
SELECT 
    'System Settings:',
    CASE WHEN EXISTS(SELECT 1 FROM system_settings) THEN '✓ Configured' ELSE '✗ Missing' END
FROM system_settings LIMIT 1;

-- Show what was created
SELECT 
    '==================== LEAVE TYPES ====================' as section,
    NULL as name, NULL as days, NULL as color_info
UNION ALL
SELECT 
    NULL,
    name,
    max_days_per_year::text || ' days',
    'Active'
FROM leave_types 
WHERE is_active = true
ORDER BY section NULLS LAST, name;

SELECT 
    '==================== DEPARTMENTS ====================' as section,
    NULL as name, NULL as head
UNION ALL
SELECT 
    NULL,
    d.name,
    COALESCE(up.first_name || ' ' || up.last_name, 'No HOD assigned')
FROM departments d
LEFT JOIN users_profile up ON d.head_of_department_id = up.id
WHERE d.is_active = true
ORDER BY section NULLS LAST, d.name;
