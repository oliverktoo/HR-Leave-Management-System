-- =============================================
-- DIAGNOSE SUPER ADMIN ACCESS ISSUES
-- Run this in Supabase SQL Editor to check your setup
-- =============================================

-- Check 1: Verify super admin user profile exists
SELECT 
  id,
  email,
  first_name,
  last_name,
  role,
  department_id,
  is_active
FROM users_profile 
WHERE role = 'super_admin';

-- Check 2: Verify role constraint allows super_admin
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'users_profile'::regclass
  AND conname = 'chk_role';

-- Check 3: List all RLS policies for super_admin
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE policyname LIKE '%super_admin%'
ORDER BY tablename, policyname;

-- Check 4: Verify you can see data (run as super_admin user)
-- This will show if RLS policies are working
SELECT 'users_profile' as table_name, COUNT(*) as total_rows FROM users_profile
UNION ALL
SELECT 'leave_requests', COUNT(*) FROM leave_requests
UNION ALL
SELECT 'leave_balances', COUNT(*) FROM leave_balances
UNION ALL
SELECT 'departments', COUNT(*) FROM departments
UNION ALL
SELECT 'leave_types', COUNT(*) FROM leave_types;

-- =============================================
-- EXPECTED RESULTS:
-- =============================================
-- Check 1: Should show oliverkiptook@gmail.com with role='super_admin'
-- Check 2: Should show constraint includes 'super_admin' in the list
-- Check 3: Should show multiple policies for super_admin (view, update, insert, delete)
-- Check 4: Should show counts > 0 for all tables
--
-- If any check fails, you need to run setup_oliver_super_admin.sql
-- =============================================
