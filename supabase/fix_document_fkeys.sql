-- ================================================
-- Fix Foreign Key References for Document Queries
-- ================================================
-- This ensures the frontend queries work correctly

-- First, let's check what foreign key names actually exist
DO $$
DECLARE
    fkey_user_id TEXT;
    fkey_uploaded_by TEXT;
    fkey_verified_by TEXT;
BEGIN
    -- Get actual foreign key names
    SELECT constraint_name INTO fkey_user_id
    FROM information_schema.table_constraints
    WHERE table_name = 'employee_documents'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%user_id%'
    LIMIT 1;

    SELECT constraint_name INTO fkey_uploaded_by
    FROM information_schema.table_constraints
    WHERE table_name = 'employee_documents'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%uploaded_by%'
    LIMIT 1;

    SELECT constraint_name INTO fkey_verified_by
    FROM information_schema.table_constraints
    WHERE table_name = 'employee_documents'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%verified_by%'
    LIMIT 1;

    RAISE NOTICE 'Foreign Key Names:';
    RAISE NOTICE 'user_id: %', COALESCE(fkey_user_id, 'NOT FOUND');
    RAISE NOTICE 'uploaded_by: %', COALESCE(fkey_uploaded_by, 'NOT FOUND');
    RAISE NOTICE 'verified_by: %', COALESCE(fkey_verified_by, 'NOT FOUND');
    RAISE NOTICE '';
    RAISE NOTICE 'Update frontend queries to use these exact names.';
END $$;

-- ================================================
-- Alternative: Simplified Query Without FK Names
-- ================================================
-- If the above approach doesn't work, use simple LEFT JOIN instead

-- Test query that mimics what frontend should do:
SELECT 
    ed.id,
    ed.user_id,
    ed.document_type,
    ed.document_name,
    ed.file_path,
    ed.file_size,
    ed.mime_type,
    ed.description,
    ed.expiry_date,
    ed.is_verified,
    ed.created_at,
    
    -- User info (document owner)
    json_build_object(
        'id', u.id,
        'first_name', u.first_name,
        'last_name', u.last_name,
        'email', u.email
    ) as user,
    
    -- Uploader info
    json_build_object(
        'id', up.id,
        'first_name', up.first_name,
        'last_name', up.last_name
    ) as uploader,
    
    -- Verifier info
    json_build_object(
        'id', vf.id,
        'first_name', vf.first_name,
        'last_name', vf.last_name
    ) as verifier,
    
    -- Document type info
    json_build_object(
        'name', dt.name,
        'display_name', dt.display_name,
        'is_required', dt.is_required,
        'requires_expiry', dt.requires_expiry
    ) as document_type_info
    
FROM employee_documents ed
LEFT JOIN users_profile u ON u.id = ed.user_id
LEFT JOIN users_profile up ON up.id = ed.uploaded_by
LEFT JOIN users_profile vf ON vf.id = ed.verified_by
LEFT JOIN document_types dt ON dt.name = ed.document_type
ORDER BY ed.created_at DESC
LIMIT 5;

RAISE NOTICE 'If the above query works, the frontend just needs to use LEFT JOIN instead of FK references';
