-- Fix Leave Balances RLS Policy
-- Issue: Missing WITH CHECK clause prevents HR admins from updating leave balances
-- Solution: Drop and recreate the policy with proper WITH CHECK clause

-- Drop the existing insufficient policy
DROP POLICY IF EXISTS "hr_manage_balances" ON leave_balances;

-- Create comprehensive policy for HR admins and super admins to manage all balances
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

-- Also ensure the trigger function can update balances (SECURITY DEFINER already set)
-- The trigger needs to bypass RLS, which is handled by SECURITY DEFINER

-- Verify the policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'leave_balances'
ORDER BY policyname;
