-- =====================================================
-- Mobile Attendance System - Database Migration
-- =====================================================
-- Adds GPS coordinates and offline sync tracking to attendance system
-- Run this in your Supabase SQL Editor

-- Add GPS coordinates column (PostgreSQL point type)
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS coords point;

-- Add sync tracking column for offline records
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- Add offline sync flag
ALTER TABLE public.attendance_records 
ADD COLUMN IF NOT EXISTS is_offline_sync boolean DEFAULT false;

-- Create spatial index for coordinate-based queries
CREATE INDEX IF NOT EXISTS idx_attendance_coords 
ON public.attendance_records USING GIST (coords);

-- Create index for synced_at queries
CREATE INDEX IF NOT EXISTS idx_attendance_synced_at 
ON public.attendance_records(synced_at) 
WHERE synced_at IS NOT NULL;

-- Create index for offline sync records
CREATE INDEX IF NOT EXISTS idx_attendance_offline_sync 
ON public.attendance_records(is_offline_sync) 
WHERE is_offline_sync = true;

-- Add helpful comments
COMMENT ON COLUMN public.attendance_records.coords IS 
'GPS coordinates (latitude, longitude) captured at check-in. Format: POINT(longitude latitude)';

COMMENT ON COLUMN public.attendance_records.synced_at IS 
'Timestamp when offline record was successfully synced to server. NULL for records created while online.';

COMMENT ON COLUMN public.attendance_records.is_offline_sync IS 
'TRUE if this record was created offline and later synced, FALSE or NULL for online records.';

-- Create helper function to calculate distance between two points (in meters)
CREATE OR REPLACE FUNCTION calculate_distance(
    coords1 point,
    coords2 point
) RETURNS numeric AS $$
DECLARE
    lat1 numeric;
    lon1 numeric;
    lat2 numeric;
    lon2 numeric;
    r numeric := 6371000; -- Earth radius in meters
    d_lat numeric;
    d_lon numeric;
    a numeric;
    c numeric;
BEGIN
    IF coords1 IS NULL OR coords2 IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Extract coordinates
    lon1 := coords1[0];
    lat1 := coords1[1];
    lon2 := coords2[0];
    lat2 := coords2[1];
    
    -- Haversine formula
    d_lat := radians(lat2 - lat1);
    d_lon := radians(lon2 - lon1);
    
    a := sin(d_lat/2) * sin(d_lat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(d_lon/2) * sin(d_lon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN r * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view for offline-synced records
CREATE OR REPLACE VIEW public.attendance_offline_synced AS
SELECT 
    id,
    user_id,
    employee_id,
    employee_name,
    check_in_time,
    date,
    coords,
    synced_at,
    (synced_at - check_in_time) as sync_delay,
    status,
    location,
    notes
FROM public.attendance_records
WHERE is_offline_sync = true
ORDER BY synced_at DESC;

GRANT SELECT ON public.attendance_offline_synced TO authenticated;

-- Create function to validate GPS coordinates are within office radius
CREATE OR REPLACE FUNCTION is_within_office_radius(
    check_coords point,
    office_coords point,
    radius_meters numeric
) RETURNS boolean AS $$
BEGIN
    IF check_coords IS NULL OR office_coords IS NULL THEN
        RETURN false;
    END IF;
    
    RETURN calculate_distance(check_coords, office_coords) <= radius_meters;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Example usage query (commented out):
-- Check if a check-in is within 200m of office
-- SELECT is_within_office_radius(
--     coords,
--     point(36.817223, -1.286389),  -- office coordinates
--     200
-- ) as is_at_office
-- FROM attendance_records
-- WHERE id = 'some-uuid';

COMMENT ON FUNCTION calculate_distance IS 
'Calculate distance in meters between two GPS points using Haversine formula';

COMMENT ON FUNCTION is_within_office_radius IS 
'Check if GPS coordinates are within specified radius of office location';

-- Migration complete
SELECT 'Mobile attendance migration completed successfully' as status;
