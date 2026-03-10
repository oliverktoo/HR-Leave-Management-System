-- ================================================
-- Diagnostic Script for Document System
-- ================================================

-- 1. Check if employee_documents table exists
SELECT 
    'employee_documents table' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'employee_documents'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END as status;

-- 2. Check if document_types table exists
SELECT 
    'document_types table' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'document_types'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END as status;

-- 3. Check document types
SELECT 
    'Document Types Count' as check_name,
    COUNT(*)::TEXT as status
FROM document_types
WHERE is_active = true;

-- 4. List all document types
SELECT 
    name,
    display_name,
    is_required,
    max_file_size / 1048576 as max_mb
FROM document_types
WHERE is_active = true
ORDER BY is_required DESC, display_name;

-- 5. Check employee_documents foreign keys
SELECT
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'employee_documents';

-- 6. Check RLS policies on employee_documents
SELECT 
    policyname,
    cmd as operation,
    qual as using_expression,
    with_check
FROM pg_policies
WHERE tablename = 'employee_documents';

-- 7. Check storage bucket
SELECT 
    'hr-documents bucket' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM storage.buckets 
        WHERE name = 'hr-documents'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING - CREATE IN DASHBOARD' END as status;

-- 8. Count documents in table
SELECT 
    'Total Documents in DB' as check_name,
    COUNT(*)::TEXT as status
FROM employee_documents;

-- 9. Count documents in storage
SELECT 
    'Total Files in Storage' as check_name,
    COUNT(*)::TEXT as status
FROM storage.objects
WHERE bucket_id = 'hr-documents';

-- 10. Check recent documents
SELECT 
    ed.id,
    ed.user_id,
    ed.document_type,
    ed.document_name,
    ed.file_size / 1024 as size_kb,
    ed.is_verified,
    ed.created_at
FROM employee_documents ed
ORDER BY ed.created_at DESC
LIMIT 5;

-- 11. Check users_profile table (needed for joins)
SELECT 
    'users_profile table' as check_name,
    CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'users_profile'
    ) THEN '✓ EXISTS' ELSE '✗ MISSING' END as status;

-- 12. Sample query that frontend uses
SELECT 
    ed.*,
    u.first_name,
    u.last_name,
    u.email
FROM employee_documents ed
LEFT JOIN users_profile u ON u.id = ed.user_id
ORDER BY ed.created_at DESC
LIMIT 3;

-- ================================================
-- Instructions
-- ================================================
-- Run all these queries to diagnose document system
-- If hr-documents bucket is MISSING, create it in Supdase Dashboard:
--   1. Go to Storage
--   2. Click "New bucket"
--   3. Name: hr-documents
--   4. Set to PRIVATE (not public)
--   5. Max file size: 10MB
