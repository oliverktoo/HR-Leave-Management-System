-- Auto Check-Out Features Migration
-- Adds support for automatic check-out with multiple options

-- Add auto checkout settings to attendance_settings table
DO $$
BEGIN
    -- Check if columns don't exist before adding them
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'attendance_settings' 
                   AND column_name = 'auto_checkout_enabled') THEN
        ALTER TABLE attendance_settings 
        ADD COLUMN auto_checkout_enabled BOOLEAN DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'attendance_settings' 
                   AND column_name = 'auto_checkout_time') THEN
        ALTER TABLE attendance_settings 
        ADD COLUMN auto_checkout_time TIME DEFAULT '18:00:00';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'attendance_settings' 
                   AND column_name = 'grace_period_hours') THEN
        ALTER TABLE attendance_settings 
        ADD COLUMN grace_period_hours INTEGER DEFAULT 9;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'attendance_settings' 
                   AND column_name = 'geofence_exit_checkout') THEN
        ALTER TABLE attendance_settings 
        ADD COLUMN geofence_exit_checkout BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Add comments
COMMENT ON COLUMN attendance_settings.auto_checkout_enabled IS 'Enable automatic check-out at end of day';
COMMENT ON COLUMN attendance_settings.auto_checkout_time IS 'Time to automatically check out unchecked-out staff (e.g., 18:00)';
COMMENT ON COLUMN attendance_settings.grace_period_hours IS 'Hours after check-in to auto checkout (prevents extremely long shifts)';
COMMENT ON COLUMN attendance_settings.geofence_exit_checkout IS 'Auto checkout when staff exits office geofence';

-- Create function to auto-checkout users based on grace period
CREATE OR REPLACE FUNCTION auto_checkout_grace_period()
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    check_in_time TIMESTAMPTZ,
    auto_checkout_time TIMESTAMPTZ,
    hours_worked DECIMAL
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_grace_hours INTEGER;
BEGIN
    -- Get grace period setting
    SELECT grace_period_hours INTO v_grace_hours
    FROM attendance_settings
    LIMIT 1;

    IF v_grace_hours IS NULL THEN
        v_grace_hours := 9; -- Default 9 hours
    END IF;

    -- Auto checkout records that exceed grace period
    RETURN QUERY
    WITH auto_checkouts AS (
        UPDATE attendance_records ar
        SET 
            check_out_time = ar.check_in_time + (v_grace_hours || ' hours')::INTERVAL,
            notes = COALESCE(ar.notes || E'\n', '') || 'Auto-checkout: Grace period (' || v_grace_hours || ' hours) exceeded',
            work_hours = v_grace_hours
        WHERE 
            ar.check_out_time IS NULL
            AND ar.check_in_time IS NOT NULL
            AND ar.check_in_time < NOW() - (v_grace_hours || ' hours')::INTERVAL
            AND ar.date = CURRENT_DATE
        RETURNING 
            ar.user_id,
            ar.check_in_time,
            ar.check_out_time,
            v_grace_hours
    )
    SELECT 
        ac.user_id,
        up.username,
        ac.check_in_time,
        ac.check_out_time AS auto_checkout_time,
        ac.v_grace_hours AS hours_worked
    FROM auto_checkouts ac
    JOIN users_profile up ON up.user_id = ac.user_id;
END;
$$;

-- Create function for end-of-day auto checkout
CREATE OR REPLACE FUNCTION auto_checkout_end_of_day()
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    check_in_time TIMESTAMPTZ,
    auto_checkout_time TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
DECLARE
    v_checkout_time TIME;
    v_enabled BOOLEAN;
BEGIN
    -- Get end-of-day checkout settings
    SELECT auto_checkout_enabled, auto_checkout_time 
    INTO v_enabled, v_checkout_time
    FROM attendance_settings
    LIMIT 1;

    IF NOT v_enabled THEN
        RETURN; -- Auto checkout disabled
    END IF;

    IF v_checkout_time IS NULL THEN
        v_checkout_time := '18:00:00'::TIME;
    END IF;

    -- Only run if current time is past checkout time
    IF CURRENT_TIME < v_checkout_time THEN
        RETURN; -- Not time yet
    END IF;

    -- Auto checkout all unchecked-out staff for today
    RETURN QUERY
    WITH auto_checkouts AS (
        UPDATE attendance_records ar
        SET 
            check_out_time = (ar.date || ' ' || v_checkout_time)::TIMESTAMPTZ,
            notes = COALESCE(ar.notes || E'\n', '') || 'Auto-checkout: End of day at ' || v_checkout_time::TEXT
        WHERE 
            ar.check_out_time IS NULL
            AND ar.check_in_time IS NOT NULL
            AND ar.date = CURRENT_DATE
        RETURNING 
            ar.user_id,
            ar.check_in_time,
            ar.check_out_time
    )
    SELECT 
        ac.user_id,
        up.username,
        ac.check_in_time,
        ac.check_out_time AS auto_checkout_time
    FROM auto_checkouts ac
    JOIN users_profile up ON up.user_id = ac.user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION auto_checkout_grace_period() TO authenticated;
GRANT EXECUTE ON FUNCTION auto_checkout_end_of_day() TO authenticated;

-- Create a manual trigger function for testing
CREATE OR REPLACE FUNCTION run_auto_checkouts()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
    grace_count INTEGER;
    eod_count INTEGER;
BEGIN
    -- Run grace period checkout
    SELECT COUNT(*) INTO grace_count
    FROM auto_checkout_grace_period();

    -- Run end of day checkout
    SELECT COUNT(*) INTO eod_count
    FROM auto_checkout_end_of_day();

    result := json_build_object(
        'success', true,
        'grace_period_checkouts', grace_count,
        'end_of_day_checkouts', eod_count,
        'timestamp', NOW()
    );

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION run_auto_checkouts() TO authenticated;

-- Update default settings for existing record or do nothing if table is empty
-- We don't insert a new record, just set defaults for existing one
DO $$
BEGIN
    -- Update the first/only record if it exists
    UPDATE attendance_settings 
    SET 
        auto_checkout_enabled = COALESCE(auto_checkout_enabled, false),
        auto_checkout_time = COALESCE(auto_checkout_time, '18:00:00'),
        grace_period_hours = COALESCE(grace_period_hours, 9),
        geofence_exit_checkout = COALESCE(geofence_exit_checkout, false)
    WHERE id = (SELECT id FROM attendance_settings LIMIT 1);
    
    -- If no record exists, you may need to create one first
    -- This assumes attendance_settings already has at least one record
END $$;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Auto checkout features added successfully!';
    RAISE NOTICE '';
    RAISE NOTICE 'New Features:';
    RAISE NOTICE '1. End-of-Day Auto Checkout (configurable time)';
    RAISE NOTICE '2. Grace Period Auto Checkout (max hours per shift)';
    RAISE NOTICE '3. Geofence Exit Auto Checkout (mobile)';
    RAISE NOTICE '';
    RAISE NOTICE 'Admin can configure these in: Office Locations settings';
    RAISE NOTICE '';
    RAISE NOTICE 'To manually run auto checkouts:';
    RAISE NOTICE '  SELECT * FROM run_auto_checkouts();';
END $$;
