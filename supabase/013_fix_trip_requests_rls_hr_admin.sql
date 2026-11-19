-- Fix: Add hr_admin to trip_requests UPDATE policy
-- 
-- hr_admin role is allowed to approve/reject trip requests in the frontend
-- but was missing from the RLS update policy, causing "permission denied" errors.
--
-- Drop the existing fleet update policy and recreate it with hr_admin included.

DROP POLICY IF EXISTS "trip_requests_update_fleet" ON trip_requests;

CREATE POLICY "trip_requests_update_fleet" ON trip_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );
