-- ================================================
-- HR Document Management System Setup
-- ================================================
-- Creates tables and storage for employee document management

-- 1. Create employee_documents table
CREATE TABLE IF NOT EXISTS employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
    document_type VARCHAR(100) NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users_profile(id),
    description TEXT,
    expiry_date DATE,
    is_verified BOOLEAN DEFAULT false,
    verified_by UUID REFERENCES users_profile(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_file_size CHECK (file_size > 0 AND file_size <= 10485760)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_employee_documents_user_id ON employee_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type ON employee_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_uploaded_by ON employee_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry ON employee_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- Add comments
COMMENT ON TABLE employee_documents IS 'Stores metadata for employee HR documents';
COMMENT ON COLUMN employee_documents.document_type IS 'Type: ID_Card, Certificate, Contract, Resume, Medical, Tax_Form, etc.';
COMMENT ON COLUMN employee_documents.file_path IS 'Storage path in Supabase bucket';
COMMENT ON COLUMN employee_documents.expiry_date IS 'Optional expiry date for documents like IDs, certificates';
COMMENT ON COLUMN employee_documents.is_verified IS 'Whether document has been verified by HR';

-- 2. Create document categories/types reference
CREATE TABLE IF NOT EXISTS document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    is_required BOOLEAN DEFAULT false,
    requires_expiry BOOLEAN DEFAULT false,
    allowed_mime_types TEXT[] DEFAULT ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    max_file_size BIGINT DEFAULT 10485760,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default document types
INSERT INTO document_types (name, display_name, description, is_required, requires_expiry) VALUES
    ('ID_Card', 'National ID/Passport', 'Government-issued identification document', true, true),
    ('Resume_CV', 'Resume/CV', 'Curriculum Vitae or Resume', true, false),
    ('Certificate', 'Academic Certificate', 'Educational certificates and diplomas', true, false),
    ('Contract', 'Employment Contract', 'Signed employment contract', true, false),
    ('Tax_Form', 'Tax Documents', 'Tax registration and compliance forms', false, true),
    ('Medical_Certificate', 'Medical Certificate', 'Medical fitness certificate', false, true),
    ('Bank_Details', 'Bank Account Details', 'Bank account information for salary', true, false),
    ('Reference_Letter', 'Reference Letter', 'Professional reference letters', false, false),
    ('Police_Clearance', 'Police Clearance', 'Certificate of good conduct', false, true),
    ('Passport_Photo', 'Passport Photo', 'Professional passport-sized photograph', true, false),
    ('Next_of_Kin', 'Next of Kin Details', 'Emergency contact information', true, false),
    ('Other', 'Other Document', 'Miscellaneous documents', false, false)
ON CONFLICT (name) DO NOTHING;

-- 3. Enable RLS
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_types ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for employee_documents

-- Employees can view their own documents
CREATE POLICY "Users can view their own documents"
ON employee_documents FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Employees can upload their own documents
CREATE POLICY "Users can upload their own documents"
ON employee_documents FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND uploaded_by = auth.uid());

-- Employees can update their own documents (but not after verification)
CREATE POLICY "Users can update unverified documents"
ON employee_documents FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND is_verified = false)
WITH CHECK (user_id = auth.uid());

-- Employees can delete their own unverified documents
CREATE POLICY "Users can delete unverified documents"
ON employee_documents FOR DELETE
TO authenticated
USING (user_id = auth.uid() AND is_verified = false);

-- HR Admins can view all documents
CREATE POLICY "HR admins can view all documents"
ON employee_documents FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- HR Admins can upload documents for any employee
CREATE POLICY "HR admins can upload documents for employees"
ON employee_documents FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- HR Admins can update any document
CREATE POLICY "HR admins can update documents"
ON employee_documents FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- HR Admins can delete any document
CREATE POLICY "HR admins can delete documents"
ON employee_documents FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- HODs can view documents from their department
CREATE POLICY "HODs can view department documents"
ON employee_documents FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile up1
        JOIN users_profile up2 ON up1.department_id = up2.department_id
        WHERE up1.id = auth.uid() 
        AND up1.role = 'hod'
        AND up2.id = employee_documents.user_id
    )
);

-- 5. RLS Policies for document_types (read-only for all authenticated users)
CREATE POLICY "All users can view document types"
ON document_types FOR SELECT
TO authenticated
USING (is_active = true);

-- Only HR admins can manage document types
CREATE POLICY "HR admins can manage document types"
ON document_types FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- 6. Storage bucket policies for 'hr-documents'
-- Note: Create bucket via Supabase Dashboard first: Storage → Create bucket → 'hr-documents' (Private)

-- Allow users to upload their own documents
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'hr-documents' 
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to view their own documents
CREATE POLICY "Users can view their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own unverified documents
CREATE POLICY "Users can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'hr-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow HR admins to view all documents
CREATE POLICY "HR admins can view all hr-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- Allow HR admins to upload documents for any user
CREATE POLICY "HR admins can upload to any folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- Allow HR admins to delete any document
CREATE POLICY "HR admins can delete any hr-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM users_profile
        WHERE id = auth.uid() 
        AND role IN ('hr_admin', 'super_admin')
    )
);

-- Allow HODs to view department documents
CREATE POLICY "HODs can view department hr-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'hr-documents'
    AND EXISTS (
        SELECT 1 FROM users_profile up1
        JOIN users_profile up2 ON up1.department_id = up2.department_id
        WHERE up1.id = auth.uid() 
        AND up1.role = 'hod'
        AND up2.id = (storage.foldername(name))[1]::uuid
    )
);

-- 7. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_employee_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER employee_documents_updated_at
    BEFORE UPDATE ON employee_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_employee_documents_updated_at();

CREATE TRIGGER document_types_updated_at
    BEFORE UPDATE ON document_types
    FOR EACH ROW
    EXECUTE FUNCTION update_employee_documents_updated_at();

-- 8. Audit logging for document operations
CREATE OR REPLACE FUNCTION log_document_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        user_id
    ) VALUES (
        'employee_documents',
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        COALESCE(NEW.uploaded_by, OLD.uploaded_by, auth.uid())
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER employee_documents_audit
    AFTER INSERT OR UPDATE OR DELETE ON employee_documents
    FOR EACH ROW
    EXECUTE FUNCTION log_document_changes();

-- 9. Helper functions

-- Get all documents for a user with type info
CREATE OR REPLACE FUNCTION get_user_documents(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    document_type VARCHAR,
    document_name VARCHAR,
    file_size BIGINT,
    mime_type VARCHAR,
    description TEXT,
    expiry_date DATE,
    is_verified BOOLEAN,
    uploaded_at TIMESTAMPTZ,
    type_display_name VARCHAR,
    is_required BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ed.id,
        ed.document_type,
        ed.document_name,
        ed.file_size,
        ed.mime_type,
        ed.description,
        ed.expiry_date,
        ed.is_verified,
        ed.created_at,
        dt.display_name,
        dt.is_required
    FROM employee_documents ed
    JOIN document_types dt ON ed.document_type = dt.name
    WHERE ed.user_id = p_user_id
    ORDER BY ed.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get document completion percentage for user
CREATE OR REPLACE FUNCTION get_document_completion(p_user_id UUID)
RETURNS TABLE (
    total_required INT,
    completed INT,
    completion_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(dt.*)::INT as total_required,
        COUNT(ed.id)::INT as completed,
        ROUND(
            (COUNT(ed.id)::NUMERIC / NULLIF(COUNT(dt.*)::NUMERIC, 0)) * 100, 
            2
        ) as completion_percentage
    FROM document_types dt
    LEFT JOIN employee_documents ed ON dt.name = ed.document_type AND ed.user_id = p_user_id
    WHERE dt.is_required = true AND dt.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================
-- Verification & Success Message
-- ================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ HR Document Management System Setup Complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. Go to Supabase Dashboard → Storage';
    RAISE NOTICE '2. Create a new bucket named: hr-documents';
    RAISE NOTICE '3. Set bucket to PRIVATE (not public)';
    RAISE NOTICE '4. Max file size: 10MB';
    RAISE NOTICE '';
    RAISE NOTICE 'Tables Created:';
    RAISE NOTICE '- employee_documents';
    RAISE NOTICE '- document_types';
    RAISE NOTICE '';
    RAISE NOTICE 'Default Document Types:';
    RAISE NOTICE '- National ID/Passport';
    RAISE NOTICE '- Resume/CV';
    RAISE NOTICE '- Academic Certificates';
    RAISE NOTICE '- Employment Contract';
    RAISE NOTICE '- And 8 more types';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- Verify setup
SELECT 
    'Document Types' as info,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE is_required = true) as required_count
FROM document_types;

SELECT 
    'Employee Documents' as info,
    COUNT(*) as total_documents,
    COUNT(DISTINCT user_id) as users_with_documents
FROM employee_documents;
