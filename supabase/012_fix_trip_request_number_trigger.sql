-- Fix: trip_request_number trigger missing SECURITY DEFINER
-- 
-- Without SECURITY DEFINER, the trigger's SELECT on trip_requests is subject
-- to RLS. Inside a BEFORE INSERT trigger, auth.uid() may return NULL, causing
-- the RLS policy (requester_id = auth.uid()) to filter out ALL existing rows.
-- This means MAX() always sees 0 rows → always generates 'TR-YYYY-0001' → 
-- duplicate key constraint violation on every insert after the first.
--
-- Fix: Add SECURITY DEFINER so the function runs as its owner (postgres),
-- bypassing RLS to correctly read all existing request numbers.

CREATE OR REPLACE FUNCTION generate_trip_request_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    next_number INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    
    -- SECURITY DEFINER bypasses RLS so we can see all existing request numbers
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM 9) AS INTEGER)), 0) + 1
    INTO next_number
    FROM trip_requests
    WHERE request_number LIKE 'TR-' || year_prefix || '-%';
    
    NEW.request_number := 'TR-' || year_prefix || '-' || LPAD(next_number::TEXT, 4, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Clean up any duplicate/orphaned trip requests from failed submissions
-- (only deletes rows that were accidentally committed and not yet reviewed)
-- Remove duplicates keeping the latest one per request_number:
DELETE FROM trip_requests
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY request_number ORDER BY created_at DESC) AS rn
        FROM trip_requests
    ) t
    WHERE rn > 1
);
