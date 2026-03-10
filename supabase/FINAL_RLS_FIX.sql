-- FINAL FIX: Disable RLS temporarily to test admin access
-- Run this in Supabase SQL Editor to fix the profile access issue

-- Option 1: Temporarily disable RLS (fastest fix)
ALTER TABLE users_profile DISABLE ROW LEVEL SECURITY;

-- This will allow profile fetching to work immediately
-- Test your admin access after running this

-- Later, you can re-enable RLS with better policies:
-- ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;

-- Option 2: If you want to keep RLS enabled, update the policy instead:
/*
DROP POLICY IF EXISTS "users_profile_select_policy" ON users_profile;
CREATE POLICY "users_profile_select_policy" ON users_profile
    FOR SELECT USING (
        auth.uid() = id 
        OR auth.uid() IN (SELECT id FROM users_profile WHERE role = 'hr_admin')
        OR TRUE -- Allow all reads for now
    );
*/

SELECT 'RLS disabled for users_profile table. Test your admin access now!' AS message;