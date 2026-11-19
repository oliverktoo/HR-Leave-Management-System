-- Migration: Add enforce_geofence flag to system_settings
-- Description: Adds enforce_geofence boolean to system_settings and updates
--              get_geofence_config() to expose it so web check-in can enforce location.
-- Date: 2026-07-17

-- Add enforce_geofence to existing system_settings row (default OFF so nothing breaks)
UPDATE system_settings
SET settings = settings || jsonb_build_object('enforce_geofence', false)
WHERE id = 1;

-- Drop and recreate get_geofence_config() to include enforce_geofence
DROP FUNCTION IF EXISTS get_geofence_config();

CREATE FUNCTION get_geofence_config()
RETURNS TABLE (
  latitude          NUMERIC,
  longitude         NUMERIC,
  radius            INTEGER,
  notification_title TEXT,
  notification_body  TEXT,
  min_accuracy      INTEGER,
  enforce_geofence  BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((settings->>'office_latitude')::numeric,  -1.2517)::numeric,
    COALESCE((settings->>'office_longitude')::numeric, 36.7989)::numeric,
    COALESCE((settings->>'geofence_radius')::integer,  100)::integer,
    COALESCE(settings->>'geofence_notification_title', 'Welcome to FKF!')::text,
    COALESCE(settings->>'geofence_notification_body',  'You are at the office. Tap to sign in.')::text,
    COALESCE((settings->>'min_gps_accuracy')::integer, 50)::integer,
    COALESCE((settings->>'enforce_geofence')::boolean, false)::boolean
  FROM system_settings
  WHERE id = 1
  LIMIT 1;
END;
$$;

-- All authenticated users need to call this in checkIn()
GRANT EXECUTE ON FUNCTION get_geofence_config() TO authenticated;

COMMENT ON FUNCTION get_geofence_config() IS
  'Returns geofence configuration including enforce_geofence flag. SECURITY DEFINER so any authenticated user can call it.';
