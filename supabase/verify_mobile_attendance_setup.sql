-- =====================================================
-- Mobile Attendance Setup Verification Script
-- =====================================================
-- Run this script to verify that all mobile attendance features are properly configured
-- This will check database schema, columns, indexes, and functions

-- ======================
-- 1. CHECK ATTENDANCE RECORDS TABLE
-- ======================

DO $$
BEGIN
    RAISE NOTICE '=== Checking attendance_records table ===';
    
    -- Check if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance_records'
    ) THEN
        RAISE NOTICE '✅ attendance_records table exists';
    ELSE
        RAISE EXCEPTION '❌ attendance_records table NOT FOUND! Run setup_attendance_system.sql first.';
    END IF;
    
    -- Check for coords column (GPS coordinates)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance_records' 
        AND column_name = 'coords'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ coords column exists (for GPS coordinates)';
    ELSE
        RAISE NOTICE '❌ coords column MISSING! Run migrate_mobile_attendance.sql';
    END IF;
    
    -- Check for synced_at column (offline sync tracking)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance_records' 
        AND column_name = 'synced_at'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ synced_at column exists (for offline sync tracking)';
    ELSE
        RAISE NOTICE '❌ synced_at column MISSING! Run migrate_mobile_attendance.sql';
    END IF;
    
    -- Check for is_offline_sync column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance_records' 
        AND column_name = 'is_offline_sync'
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE '✅ is_offline_sync column exists';
    ELSE
        RAISE NOTICE '❌ is_offline_sync column MISSING! Run migrate_mobile_attendance.sql';
    END IF;
    
END $$;

-- ======================
-- 2. CHECK INDEXES
-- ======================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Checking Indexes ===';
    
    -- Check spatial index for coordinates
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'attendance_records' 
        AND indexname = 'idx_attendance_coords'
    ) THEN
        RAISE NOTICE '✅ Spatial index on coords exists';
    ELSE
        RAISE NOTICE '❌ Spatial index on coords MISSING!';
    END IF;
    
    -- Check synced_at index
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'attendance_records' 
        AND indexname = 'idx_attendance_synced_at'
    ) THEN
        RAISE NOTICE '✅ Index on synced_at exists';
    ELSE
        RAISE NOTICE '❌ Index on synced_at MISSING!';
    END IF;
    
    -- Check offline_sync index
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE tablename = 'attendance_records' 
        AND indexname = 'idx_attendance_offline_sync'
    ) THEN
        RAISE NOTICE '✅ Index on is_offline_sync exists';
    ELSE
        RAISE NOTICE '❌ Index on is_offline_sync MISSING!';
    END IF;
    
END $$;

-- ======================
-- 3. CHECK HELPER FUNCTIONS
-- ======================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Checking Helper Functions ===';
    
    -- Check calculate_distance function
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'calculate_distance'
        AND pg_catalog.pg_function_is_visible(oid)
    ) THEN
        RAISE NOTICE '✅ calculate_distance function exists';
    ELSE
        RAISE NOTICE '❌ calculate_distance function MISSING!';
    END IF;
    
END $$;

-- ======================
-- 4. CHECK VIEWS
-- ======================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Checking Views ===';
    
    -- Check attendance_offline_synced view
    IF EXISTS (
        SELECT 1 FROM information_schema.views 
        WHERE table_schema = 'public' 
        AND table_name = 'attendance_offline_synced'
    ) THEN
        RAISE NOTICE '✅ attendance_offline_synced view exists';
    ELSE
        RAISE NOTICE '⚠️ attendance_offline_synced view MISSING (optional)';
    END IF;
    
END $$;

-- ======================
-- 5. CHECK SYSTEM SETTINGS TABLE
-- ======================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Checking System Settings ===';
    
    -- Check if system_settings table exists for geofence config
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'system_settings'
    ) THEN
        RAISE NOTICE '✅ system_settings table exists';
        
        -- Check if settings contain geofence config
        IF EXISTS (
            SELECT 1 FROM system_settings 
            WHERE settings ? 'office_latitude' 
            AND settings ? 'office_longitude'
            LIMIT 1
        ) THEN
            RAISE NOTICE '✅ Geofence coordinates configured';
        ELSE
            RAISE NOTICE '⚠️ Geofence coordinates NOT configured. Using defaults.';
        END IF;
    ELSE
        RAISE NOTICE '⚠️ system_settings table MISSING. Using default geofence config.';
    END IF;
    
END $$;

-- ======================
-- 6. SAMPLE DATA CHECK
-- ======================

DO $$
DECLARE
    total_records INTEGER;
    offline_records INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Data Statistics ===';
    
    SELECT COUNT(*) INTO total_records FROM attendance_records;
    RAISE NOTICE 'Total attendance records: %', total_records;
    
    SELECT COUNT(*) INTO offline_records 
    FROM attendance_records 
    WHERE is_offline_sync = true;
    RAISE NOTICE 'Offline-synced records: %', offline_records;
    
END $$;

-- ======================
-- 7. TEST DISTANCE CALCULATION
-- ======================

DO $$
DECLARE
    test_distance NUMERIC;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Testing Distance Calculation ===';
    
    -- Test with Nairobi coordinates (FKF Office to City Center - ~5km)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'calculate_distance') THEN
        SELECT calculate_distance(
            point(36.7989, -1.2517),  -- FKF Office
            point(36.8219, -1.2864)   -- Nairobi City Center
        ) INTO test_distance;
        
        RAISE NOTICE 'Test distance calculation: % meters', ROUND(test_distance);
        
        IF test_distance BETWEEN 4000 AND 6000 THEN
            RAISE NOTICE '✅ Distance calculation working correctly';
        ELSE
            RAISE NOTICE '⚠️ Distance calculation may be incorrect (expected ~5000m)';
        END IF;
    END IF;
    
END $$;

-- ======================
-- 8. SUMMARY
-- ======================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=================================================';
    RAISE NOTICE '📊 MOBILE ATTENDANCE SETUP VERIFICATION COMPLETE';
    RAISE NOTICE '=================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next Steps:';
    RAISE NOTICE '1. If any ❌ errors shown, run the missing migration scripts';
    RAISE NOTICE '2. Configure geofence coordinates in system_settings table';
    RAISE NOTICE '3. Build mobile app: npm run mobile:build';
    RAISE NOTICE '4. Sync to devices: npx cap sync android/ios';
    RAISE NOTICE '5. Test on physical device';
    RAISE NOTICE '';
    
END $$;

-- ======================
-- OPTIONAL: VIEW SCHEMA
-- ======================

-- Uncomment to see full attendance_records schema
-- \d attendance_records

-- Uncomment to see sample data with GPS coordinates
-- SELECT 
--     id, 
--     employee_name, 
--     check_in_time, 
--     coords,
--     location,
--     is_offline_sync,
--     synced_at
-- FROM attendance_records 
-- WHERE coords IS NOT NULL 
-- ORDER BY check_in_time DESC 
-- LIMIT 5;
