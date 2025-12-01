-- Fix RLS policies to allow HODs to view requests from ALL departments they manage
-- (not just their own department)

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "hod_view_department_requests" ON leave_requests;

-- Create new policy: HODs can view requests from users in ANY department where they are HOD
CREATE POLICY "hod_view_department_requests" ON leave_requests
FOR SELECT
TO authenticated
USING (
  -- Allow if user is HOD/HR_ADMIN and the request is from someone in a department they manage
  EXISTS (
    SELECT 1 FROM users_profile up
    INNER JOIN departments d ON up.department_id = d.id
    WHERE up.id = leave_requests.user_id  -- The request submitter
    AND d.head_of_department_id = auth.uid()  -- Current user is HOD of that department
  )
  OR
  -- OR if user is HR admin (can see all)
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- Also fix the approval policy to match
DROP POLICY IF EXISTS "hod_approve_department_requests" ON leave_requests;

CREATE POLICY "hod_approve_department_requests" ON leave_requests
FOR UPDATE
TO authenticated
USING (
  -- Allow if user is HOD/HR_ADMIN and the request is from someone in a department they manage
  EXISTS (
    SELECT 1 FROM users_profile up
    INNER JOIN departments d ON up.department_id = d.id
    WHERE up.id = leave_requests.user_id  -- The request submitter
    AND d.head_of_department_id = auth.uid()  -- Current user is HOD of that department
  )
  OR
  -- OR if user is HR admin (can manage all)
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);

-- Also fix leave_balances policy for consistency
DROP POLICY IF EXISTS "hod_view_department_balances" ON leave_balances;

CREATE POLICY "hod_view_department_balances" ON leave_balances
FOR SELECT
TO authenticated
USING (
  -- Allow if user is HOD/HR_ADMIN and the balance is for someone in a department they manage
  EXISTS (
    SELECT 1 FROM users_profile up
    INNER JOIN departments d ON up.department_id = d.id
    WHERE up.id = leave_balances.user_id  -- The balance owner
    AND d.head_of_department_id = auth.uid()  -- Current user is HOD of that department
  )
  OR
  -- OR if user is HR admin (can see all)
  EXISTS (
    SELECT 1 FROM users_profile 
    WHERE id = auth.uid() AND role = 'hr_admin'
  )
);
