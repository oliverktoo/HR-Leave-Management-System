-- Fix Function Conflicts - Run this FIRST if you get function errors
-- This will clean up any existing functions that might conflict

DROP FUNCTION IF EXISTS calculate_working_days(date, date);
DROP FUNCTION IF EXISTS get_leave_balance(uuid, uuid, integer);
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS audit_leave_request_changes();

-- Clean up any existing triggers
DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
DROP TRIGGER IF EXISTS update_users_profile_updated_at ON users_profile;
DROP TRIGGER IF EXISTS update_public_holidays_updated_at ON public_holidays;
DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON leave_balances;
DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON leave_requests;
DROP TRIGGER IF EXISTS audit_leave_requests ON leave_requests;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "users_profile_select_policy" ON users_profile;
DROP POLICY IF EXISTS "users_profile_update_policy" ON users_profile;
DROP POLICY IF EXISTS "users_profile_insert_policy" ON users_profile;
DROP POLICY IF EXISTS "leave_requests_select_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_insert_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_requests_update_policy" ON leave_requests;
DROP POLICY IF EXISTS "leave_balances_select_policy" ON leave_balances;
DROP POLICY IF EXISTS "departments_policy" ON departments;
DROP POLICY IF EXISTS "leave_types_select_policy" ON leave_types;
DROP POLICY IF EXISTS "leave_types_modify_policy" ON leave_types;
DROP POLICY IF EXISTS "public_holidays_select_policy" ON public_holidays;
DROP POLICY IF EXISTS "public_holidays_modify_policy" ON public_holidays;

SELECT 'Function conflicts cleaned up. Now run the main setup script.' AS message;