-- ================================================
-- Phase 3: Document Upload Storage Configuration
-- ================================================
-- This script sets up Supabase Storage for leave documents
-- Run this in Supabase SQL Editor

-- 1. Create storage bucket for leave documents (if not exists)
-- Note: Storage buckets are usually created via Supabase Dashboard
-- This is for reference - execute via Dashboard > Storage > Create Bucket

/*
Bucket Configuration:
- Name: leave-documents
- Public: No (private, accessible only to authenticated users)
- Allowed MIME types: application/pdf, image/jpeg, image/png, image/jpg, 
                      application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document
- Max file size: 5MB (5242880 bytes)
*/

-- 2. Set up RLS policies for storage bucket
-- Allow authenticated users to upload their own documents
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'leave-documents' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own documents
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'leave-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'leave-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow HODs and HR admins to view all documents in their department
CREATE POLICY "HODs and HR admins can view department documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'leave-documents'
  AND (
    -- HR admins can view all documents
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid() AND role = 'hr_admin'
    )
    OR
    -- HODs can view documents from their department users
    EXISTS (
      SELECT 1 FROM users_profile up1
      JOIN users_profile up2 ON up1.department_id = up2.department_id
      WHERE up1.id = auth.uid() 
        AND up1.role = 'hod'
        AND up2.id = (storage.foldername(name))[1]::uuid
    )
  )
);

-- 3. Verify document_url column exists in leave_requests table
-- This should already exist from initial schema, but verify:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_requests' AND column_name = 'document_url'
  ) THEN
    ALTER TABLE leave_requests ADD COLUMN document_url TEXT;
    COMMENT ON COLUMN leave_requests.document_url IS 'URL to uploaded supporting document in Supabase Storage';
  END IF;
END $$;

-- 4. Create helper function to get document metadata
CREATE OR REPLACE FUNCTION get_leave_document_metadata(request_id UUID)
RETURNS TABLE (
  document_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  uploaded_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lr.document_url,
    COALESCE(so.name, 'Unknown') as file_name,
    so.metadata->>'size' as file_size,
    so.created_at as uploaded_at
  FROM leave_requests lr
  LEFT JOIN storage.objects so ON lr.document_url LIKE '%' || so.name
  WHERE lr.id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add audit log trigger for document uploads
CREATE OR REPLACE FUNCTION log_document_upload()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.document_url IS NOT NULL AND (OLD.document_url IS NULL OR OLD.document_url != NEW.document_url) THEN
    INSERT INTO audit_logs (
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      user_id
    ) VALUES (
      'leave_requests',
      NEW.id,
      'document_uploaded',
      jsonb_build_object('document_url', OLD.document_url),
      jsonb_build_object('document_url', NEW.document_url),
      NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS leave_document_upload_trigger ON leave_requests;
CREATE TRIGGER leave_document_upload_trigger
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_document_upload();

-- 6. Grant necessary permissions
GRANT SELECT ON storage.objects TO authenticated;
GRANT INSERT ON storage.objects TO authenticated;
GRANT DELETE ON storage.objects TO authenticated;

-- ================================================
-- Verification Queries
-- ================================================

-- Check if storage bucket exists (run in Supabase Dashboard SQL Editor)
-- SELECT * FROM storage.buckets WHERE name = 'leave-documents';

-- Check storage policies
-- SELECT * FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage';

-- Check recent document uploads
-- SELECT lr.id, up.full_name, lr.document_url, lr.created_at
-- FROM leave_requests lr
-- JOIN users_profile up ON lr.user_id = up.id
-- WHERE lr.document_url IS NOT NULL
-- ORDER BY lr.created_at DESC
-- LIMIT 10;

-- ================================================
-- Manual Storage Bucket Creation Steps
-- ================================================
/*
Since Supabase storage buckets are best created via Dashboard:

1. Go to Supabase Dashboard → Storage
2. Click "Create a new bucket"
3. Enter details:
   - Name: leave-documents
   - Public bucket: OFF (keep private)
4. Click "Create bucket"
5. Go to bucket settings → Policies
6. Run the RLS policies above in SQL Editor
7. Test upload from frontend

File size limit and MIME type restrictions are enforced in frontend code.
*/

-- ================================================
-- Cleanup (if needed to reset)
-- ================================================
-- DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
-- DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
-- DROP POLICY IF EXISTS "HODs and HR admins can view department documents" ON storage.objects;
-- DROP FUNCTION IF EXISTS get_leave_document_metadata(UUID);
-- DROP TRIGGER IF EXISTS leave_document_upload_trigger ON leave_requests;
-- DROP FUNCTION IF EXISTS log_document_upload();
