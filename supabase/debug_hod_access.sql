-- Debug Oliver's HOD access
-- Run these queries to verify everything is set up correctly

-- 1. Verify Oliver's profile
SELECT 
    id,
    email,
    role,
    department_id,
    first_name,
    last_name
FROM users_profile 
WHERE email = 'oliverktoo@gmail.com';

-- 2. Check RLS policies for attendance_records
SELECT 
    policyname,
    cmd,
    CASE 
        WHEN policyname LIKE '%hod%' THEN '✓ HOD Policy'
        ELSE ''
    END as policy_type
FROM pg_policies 
WHERE tablename = 'attendance_records'
ORDER BY policyname;

-- 3. Verify the HOD policy exists and is correct
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'attendance_records' 
  AND policyname = 'hod_view_department_attendance';

-- If the above returns nothing, run this to create the policy:
-- CREATE POLICY hod_view_department_attendance ON attendance_records
-- FOR SELECT TO authenticated
-- USING (
--   EXISTS (
--     SELECT 1 FROM users_profile up
--     WHERE up.id = auth.uid()
--       AND (up.role)::text = 'hod'::text
--       AND attendance_records.user_id IN (
--         SELECT users_profile.id FROM users_profile
--         WHERE users_profile.department_id = up.department_id
--       )
--   )
-- );
