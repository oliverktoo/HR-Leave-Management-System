-- ================================================
-- Complete Document Storage Setup (Missing Parts Only)
-- ================================================
-- Run this if storage policies already exist

-- 1. Verify document_url column exists in leave_requests table
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

-- 2. Create helper function to get document metadata
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
    COALESCE((so.metadata->>'size')::BIGINT, 0) as file_size,
    so.created_at as uploaded_at
  FROM leave_requests lr
  LEFT JOIN storage.objects so ON lr.document_url LIKE '%' || so.name
  WHERE lr.id = request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Add audit log trigger for document uploads
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

-- 4. Grant necessary permissions (in case they're missing)
GRANT SELECT ON storage.objects TO authenticated;
GRANT INSERT ON storage.objects TO authenticated;
GRANT DELETE ON storage.objects TO authenticated;

-- ================================================
-- Success Message
-- ================================================
DO $$
BEGIN
  RAISE NOTICE 'Document storage setup completed successfully!';
  RAISE NOTICE 'Now verify the bucket exists: SELECT * FROM storage.buckets WHERE name = ''leave-documents'';';
END $$;
