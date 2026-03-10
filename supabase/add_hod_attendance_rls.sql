-- Create HOD RLS policies for attendance_records table
-- This allows HODs to view attendance records for employees in their department

-- First, check existing policies
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'attendance_records' 
  AND policyname LIKE '%hod%'
ORDER BY policyname;

-- Drop existing HOD policies if they exist
DROP POLICY IF EXISTS hod_view_department_attendance ON attendance_records;

-- Create new policy: HOD can view attendance for their department employees
CREATE POLICY hod_view_department_attendance ON attendance_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users_profile up
    WHERE up.id = auth.uid()
      AND (up.role)::text = 'hod'::text
      AND attendance_records.user_id IN (
        SELECT users_profile.id
        FROM users_profile
        WHERE users_profile.department_id = up.department_id
      )
  )
);

-- Verify the new policy was created
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'attendance_records' 
  AND policyname = 'hod_view_department_attendance';

-- Test: Check if Oliver (HOD) can now see Ann's attendance
-- When Oliver is logged in (auth.uid() = '6c0e92ce-91a0-41de-8f95-75c80d5021b4')
-- This should return attendance records for all Infrastructure employees
SELECT 
    ar.id,
    ar.date,
    ar.check_in_time,
    ar.check_out_time,
    up.first_name,
    up.last_name,
    up.email
FROM attendance_records ar
JOIN users_profile up ON ar.user_id = up.id
WHERE up.department_id = '00000000-0000-0000-0000-000000000002'
ORDER BY ar.date DESC
LIMIT 10;
