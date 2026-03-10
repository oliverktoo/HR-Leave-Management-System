-- ================================================
-- Document Storage Verification Script
-- ================================================
-- Run this to verify the storage setup is complete

-- 1. Check if storage bucket exists
SELECT 
  name as bucket_name,
  public,
  created_at
FROM storage.buckets 
WHERE name = 'leave-documents';

-- 2. Check storage policies
SELECT 
  policyname,
  cmd as operation,
  qual as using_clause
FROM pg_policies 
WHERE tablename = 'objects' 
  AND schemaname = 'storage'
  AND policyname LIKE '%document%'
ORDER BY policyname;

-- 3. Verify document_url column exists
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'leave_requests' 
  AND column_name = 'document_url';

-- 4. Check if helper functions exist
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_leave_document_metadata', 'log_document_upload');

-- 5. Check if trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'leave_document_upload_trigger';

-- 6. Test query - Check recent document uploads (if any)
SELECT 
  lr.id,
  up.first_name || ' ' || up.last_name as employee_name,
  lr.document_url,
  lr.created_at
FROM leave_requests lr
JOIN users_profile up ON lr.user_id = up.id
WHERE lr.document_url IS NOT NULL
ORDER BY lr.created_at DESC
LIMIT 5;
