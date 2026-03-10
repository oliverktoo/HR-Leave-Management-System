-- Improve HOD RLS Policy (Alternative/Backup Solution)
-- This creates a more flexible RLS policy that works with role-based system
-- Use this if you don't want to maintain head_of_department_id field

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS hod_view_department_requests ON leave_requests;

-- Create improved policy that only requires role='hod' and matching department_id
CREATE POLICY hod_view_department_requests ON leave_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users_profile up
    WHERE up.id = auth.uid()
      AND (up.role)::text = 'hod'::text
      AND leave_requests.user_id IN (
        SELECT users_profile.id
        FROM users_profile
        WHERE users_profile.department_id = up.department_id
      )
  )
);

-- Also update the UPDATE policy for consistency
DROP POLICY IF EXISTS hod_approve_department_requests ON leave_requests;

CREATE POLICY hod_approve_department_requests ON leave_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users_profile up
    WHERE up.id = auth.uid()
      AND (up.role)::text = 'hod'::text
      AND leave_requests.user_id IN (
        SELECT users_profile.id
        FROM users_profile
        WHERE users_profile.department_id = up.department_id
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM users_profile up
    WHERE up.id = auth.uid()
      AND (up.role)::text = 'hod'::text
      AND leave_requests.user_id IN (
        SELECT users_profile.id
        FROM users_profile
        WHERE users_profile.department_id = up.department_id
      )
  )
);

-- Verify the new policies
SELECT * FROM pg_policies 
WHERE tablename = 'leave_requests' 
  AND policyname LIKE 'hod%'
ORDER BY policyname;
