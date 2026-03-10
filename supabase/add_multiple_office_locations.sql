-- Add support for multiple office locations
-- Run this migration to allow organizations with multiple offices

-- Create office_locations table
CREATE TABLE IF NOT EXISTS office_locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  radius INTEGER NOT NULL DEFAULT 100,
  notification_title VARCHAR(100) DEFAULT 'Welcome to Office!',
  notification_body VARCHAR(200) DEFAULT 'You are at the office. Tap to sign in.',
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_latitude CHECK (latitude >= -90 AND latitude <= 90),
  CONSTRAINT valid_longitude CHECK (longitude >= -180 AND longitude <= 180),
  CONSTRAINT valid_radius CHECK (radius >= 10 AND radius <= 1000)
);

-- Create index for active locations lookup
CREATE INDEX IF NOT EXISTS idx_office_locations_active ON office_locations(is_active);

-- Ensure only one default location
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_default_location 
ON office_locations(is_default) 
WHERE is_default = TRUE;

-- Add comment
COMMENT ON TABLE office_locations IS 'Stores multiple office locations for organizations with multiple branches';

-- Insert sample data from existing system_settings (if any)
DO $$
DECLARE
  v_settings JSONB;
  v_lat DECIMAL;
  v_lon DECIMAL;
  v_radius INTEGER;
  v_title VARCHAR;
  v_body VARCHAR;
BEGIN
  -- Try to get existing settings
  SELECT settings INTO v_settings
  FROM system_settings
  WHERE id = 1;

  IF v_settings IS NOT NULL THEN
    v_lat := (v_settings->>'office_latitude')::DECIMAL;
    v_lon := (v_settings->>'office_longitude')::DECIMAL;
    v_radius := COALESCE((v_settings->>'geofence_radius')::INTEGER, 100);
    v_title := COALESCE(v_settings->>'geofence_notification_title', 'Welcome to Office!');
    v_body := COALESCE(v_settings->>'geofence_notification_body', 'You are at the office. Tap to sign in.');

    -- Insert as main office if coordinates are valid
    IF v_lat IS NOT NULL AND v_lon IS NOT NULL THEN
      INSERT INTO office_locations (name, latitude, longitude, radius, notification_title, notification_body, is_active, is_default)
      VALUES ('Main Office', v_lat, v_lon, v_radius, v_title, v_body, TRUE, TRUE)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_office_location_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS update_office_locations_timestamp ON office_locations;
CREATE TRIGGER update_office_locations_timestamp
  BEFORE UPDATE ON office_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_office_location_timestamp();

-- Grant permissions
GRANT SELECT ON office_locations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON office_locations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE office_locations_id_seq TO authenticated;

-- Create view for active locations only
CREATE OR REPLACE VIEW active_office_locations AS
SELECT 
  id,
  name,
  latitude,
  longitude,
  radius,
  notification_title,
  notification_body,
  is_default
FROM office_locations
WHERE is_active = TRUE
ORDER BY is_default DESC, name ASC;

GRANT SELECT ON active_office_locations TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Multiple office locations support added successfully!';
  RAISE NOTICE 'Table: office_locations created';
  RAISE NOTICE 'View: active_office_locations created';
END $$;
