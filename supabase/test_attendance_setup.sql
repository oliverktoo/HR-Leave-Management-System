-- =====================================================
-- Test Attendance System Setup
-- =====================================================
-- Run this to verify the attendance system is set up correctly

-- 1. Check if tables exist
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('attendance_records', 'attendance_settings')
ORDER BY table_name;

-- 2. Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('attendance_records', 'attendance_settings');

-- 3. Check all RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename IN ('attendance_records', 'attendance_settings')
ORDER BY tablename, policyname;

-- 4. Check if attendance_settings has default data
SELECT * FROM public.attendance_settings;

-- 5. Check table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'attendance_records'
ORDER BY ordinal_position;

-- 6. Check foreign key constraints
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'attendance_records'
ORDER BY tc.constraint_type, tc.constraint_name;

-- 7. Check current user's role (if logged in)
SELECT 
    id,
    email,
    role,
    first_name,
    last_name
FROM public.users_profile
WHERE id = auth.uid();
