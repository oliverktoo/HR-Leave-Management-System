-- Fix Leave Types Check Constraint
-- Issue: The constraint requires max_days_per_year > 0, but Unpaid Leave needs 0
-- Solution: Replace constraint to allow >= 0 instead of > 0

DO $$
BEGIN
    -- Drop the old constraint that requires > 0
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_positive' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types DROP CONSTRAINT chk_max_days_positive;
        RAISE NOTICE '✅ Dropped old constraint (required > 0)';
    END IF;
    
    -- Add new constraint that allows >= 0
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_max_days_non_negative' 
        AND table_name = 'leave_types'
    ) THEN
        ALTER TABLE leave_types ADD CONSTRAINT chk_max_days_non_negative CHECK (max_days_per_year >= 0);
        RAISE NOTICE '✅ Added new constraint (allows >= 0)';
    END IF;
    
    -- Also check notice_days constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'chk_notice_days_non_negative' 
        AND table_name = 'leave_types'
    ) THEN
        RAISE NOTICE '✅ Notice days constraint already correct (allows >= 0)';
    END IF;
END $$;

-- Verify the constraints
SELECT 
    constraint_name,
    check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE 'chk_%'
AND constraint_schema = 'public';

-- Test: Try to insert unpaid leave (should now work)
INSERT INTO leave_types (name, description, max_days_per_year, is_active)
VALUES ('Unpaid Leave Test', 'Test unpaid leave with 0 days', 0, false)
ON CONFLICT (name) DO NOTHING;

-- Clean up test
DELETE FROM leave_types WHERE name = 'Unpaid Leave Test';

SELECT '✅ Check constraint fixed! Unpaid leave with 0 days is now allowed.' as status;
