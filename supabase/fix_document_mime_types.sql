-- Fix document_types allowed MIME types to include all common formats
-- This allows employees to upload Word documents, JPG files, etc.

-- Update all document types to allow common file formats
UPDATE document_types
SET allowed_mime_types = ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
WHERE is_active = true;

-- Increase max file size to 10MB (from default 5MB)
UPDATE document_types
SET max_file_size = 10485760
WHERE is_active = true;

-- Verify the changes
SELECT 
    name,
    display_name,
    allowed_mime_types,
    max_file_size,
    pg_size_pretty(max_file_size::bigint) as max_size_readable
FROM document_types
WHERE is_active = true
ORDER BY name;
