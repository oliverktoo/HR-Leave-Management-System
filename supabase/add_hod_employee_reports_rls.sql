-- Add HOD RLS policies for Employee Reports access
-- This allows HODs to view leave balances and leave requests for their department employees

-- ====================================
-- LEAVE BALANCES TABLE
-- ====================================

-- Check existing policies for leave_balances
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'leave_balances' 
  AND policyname LIKE '%hod%'
ORDER BY policyname;

-- Drop existing HOD policy if it exists
DROP POLICY IF EXISTS hod_view_department_leave_balances ON leave_balances;

-- Create policy: HOD can view leave balances for their department employees
CREATE POLICY hod_view_department_leave_balances ON leave_balances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users_profile up
    WHERE up.id = auth.uid()
      AND (up.role)::text = 'hod'::text
      AND leave_balances.user_id IN (
        SELECT users_profile.id
        FROM users_profile
        WHERE users_profile.department_id = up.department_id
      )
  )
);

-- Verify the policy was created
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'leave_balances' 
  AND policyname = 'hod_view_department_leave_balances';

-- ====================================
-- LEAVE TYPES TABLE (for reference data)
-- ====================================

-- Check if there's a read policy for leave_types
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'leave_types'
ORDER BY policyname;

-- If no policy exists for authenticated users to read leave_types, create one
-- (This is typically needed for everyone to see available leave types)
DROP POLICY IF EXISTS authenticated_read_leave_types ON leave_types;

CREATE POLICY authenticated_read_leave_types ON leave_types
FOR SELECT
TO authenticated
USING (true);

-- ====================================
-- TEST QUERIES
-- ====================================

-- Test: Check if Oliver (HOD) can see leave balances for Infrastructure department
SELECT 
    lb.id,
    lb.user_id,
    up.first_name,
    up.last_name,
    up.email,
    lb.leave_type_id,
    lt.name as leave_type,
    lb.annual_allocation,
    lb.used_days,
    lb.pending_days
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
LEFT JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE up.department_id = '00000000-0000-0000-0000-000000000002'
ORDER BY up.last_name, lt.name
LIMIT 20;

-- Summary of policies created
SELECT 
    'leave_balances' as table_name,
    policyname,
    cmd
FROM pg_policies 
WHERE tablename = 'leave_balances' 
  AND policyname LIKE '%hod%'
UNION ALL
SELECT 
    'leave_types' as table_name,
    policyname,
    cmd
FROM pg_policies 
WHERE tablename = 'leave_types' 
  AND policyname LIKE '%authenticated%'
ORDER BY table_name, policyname;
