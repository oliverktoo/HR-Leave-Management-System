-- =====================================================
-- Fix Attendance System RLS Policies
-- =====================================================
-- Run this if you already created the attendance tables
-- but need to add the missing DELETE policy

-- Drop and recreate policies to ensure they're correct
DROP POLICY IF EXISTS "HR admins can view all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR admins can update all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR admins can delete attendance" ON public.attendance_records;

-- HR Admins and Super Admins can view all attendance records
CREATE POLICY "HR admins can view all attendance"
    ON public.attendance_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- HR Admins can update/correct attendance records
CREATE POLICY "HR admins can update all attendance"
    ON public.attendance_records
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- HR Admins can delete attendance records
CREATE POLICY "HR admins can delete attendance"
    ON public.attendance_records
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- Verify policies are set up correctly
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'attendance_records'
ORDER BY policyname;
