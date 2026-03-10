-- Fix leave_types color column
-- The database schema has 'color_code' but frontend code expects 'color'
-- This script ensures the 'color' column exists (by renaming or adding)

-- Check current state and fix accordingly
DO $$
BEGIN
    -- Case 1: If color_code exists but color doesn't, rename it
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) THEN
        ALTER TABLE leave_types RENAME COLUMN color_code TO color;
        RAISE NOTICE 'Renamed color_code to color';
    END IF;
    
    -- If both exist, drop color_code and keep color
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) THEN
        ALTER TABLE leave_types DROP COLUMN color_code;
        RAISE NOTICE 'Dropped duplicate color_code column';
    END IF;
    
    -- If neither exists, add color column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'leave_types' 
        AND column_name = 'color_code'
    ) THEN
        ALTER TABLE leave_types ADD COLUMN color VARCHAR(7) DEFAULT '#4F46E5';
        RAISE NOTICE 'Added color column';
    END IF;
END $$;

-- Update any NULL colors with default values based on leave type name
UPDATE leave_types
SET color = CASE 
    WHEN LOWER(name) LIKE '%annual%' THEN '#3b82f6'
    WHEN LOWER(name) LIKE '%sick%' THEN '#ef4444'
    WHEN LOWER(name) LIKE '%maternity%' THEN '#ec4899'
    WHEN LOWER(name) LIKE '%paternity%' THEN '#8b5cf6'
    WHEN LOWER(name) LIKE '%compassionate%' THEN '#6b7280'
    WHEN LOWER(name) LIKE '%study%' THEN '#10b981'
    WHEN LOWER(name) LIKE '%unpaid%' THEN '#f59e0b'
    ELSE '#4F46E5'
END
WHERE color IS NULL OR color = '';

-- Verify the change
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'leave_types' 
AND column_name IN ('color', 'color_code');
