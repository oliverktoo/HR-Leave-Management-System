-- ================================================
-- Fix RLS Policies for Approvals Page
-- ================================================

-- 1. Check current leave requests in database
SELECT 
  lr.id,
  up.first_name || ' ' || up.last_name as employee,
  up.department_id,
  d.name as department,
  lr.status,
  lr.created_at
FROM leave_requests lr
JOIN users_profile up ON lr.user_id = up.id
LEFT JOIN departments d ON up.department_id = d.id
ORDER BY lr.created_at DESC;

-- 2. Check RLS policies for leave_requests
SELECT 
  policyname,
  cmd as operation,
  roles,
  qual as using_clause,
  with_check
FROM pg_policies 
WHERE tablename = 'leave_requests'
ORDER BY cmd, policyname;

-- 3. Drop and recreate HOD view policy with better logic
DROP POLICY IF EXISTS "hod_view_department_requests" ON leave_requests;

CREATE POLICY "hod_view_department_requests" 
ON leave_requests
FOR SELECT
TO authenticated
USING (
  -- HODs can view requests from their department
  EXISTS (
    SELECT 1 
    FROM users_profile up
    JOIN departments d ON up.department_id = d.id
    WHERE up.id = leave_requests.user_id
      AND d.head_of_department_id = auth.uid()
  )
);

-- 4. Ensure HR admins can view all requests
DROP POLICY IF EXISTS "hr_view_all_requests" ON leave_requests;

CREATE POLICY "hr_view_all_requests" 
ON leave_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- 5. Verify policies
SELECT 
  policyname,
  cmd as operation,
  CASE 
    WHEN policyname LIKE '%own%' THEN 'Employee - Own Requests'
    WHEN policyname LIKE '%hod%' OR policyname LIKE '%department%' THEN 'HOD - Department Requests'
    WHEN policyname LIKE '%hr%' THEN 'HR Admin - All Requests'
    ELSE 'Other'
  END as policy_type
FROM pg_policies 
WHERE tablename = 'leave_requests' AND cmd = 'SELECT'
ORDER BY policy_type;

-- 6. Test what oliverkiptook@gmail.com can see
-- Get oliverkiptook's user ID and department info
SELECT 
  up.id as user_id,
  up.first_name || ' ' || up.last_name as name,
  up.role,
  up.department_id,
  d.name as department,
  d.head_of_department_id,
  CASE 
    WHEN d.head_of_department_id = up.id THEN '✅ IS HOD'
    ELSE 'Not HOD'
  END as hod_status
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
WHERE up.email = 'oliverkiptook@gmail.com';

-- 7. Check which departments oliverkiptook is HOD of
SELECT 
  d.name as department,
  d.head_of_department_id,
  COUNT(lr.id) as pending_requests
FROM departments d
LEFT JOIN users_profile up ON up.department_id = d.id
LEFT JOIN leave_requests lr ON lr.user_id = up.id AND lr.status = 'pending'
WHERE d.head_of_department_id = (SELECT id FROM users_profile WHERE email = 'oliverkiptook@gmail.com')
GROUP BY d.name, d.head_of_department_id;
