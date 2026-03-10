-- Migration: Add Geofence Settings Support
-- Description: Adds support for storing office location and geofence configuration in system_settings
-- Date: 2026-03-05

-- Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Add comment to table
COMMENT ON TABLE system_settings IS 'Singleton table for storing system-wide configuration settings';

-- Enable Row Level Security
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin can read system settings" ON system_settings;
DROP POLICY IF EXISTS "Admin can update system settings" ON system_settings;
DROP POLICY IF EXISTS "Admin can insert system settings" ON system_settings;

-- Create policy for admin users to read settings
CREATE POLICY "Admin can read system settings" 
ON system_settings 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('hr_admin', 'super_admin')
  )
);

-- Create policy for admin users to update settings
CREATE POLICY "Admin can update system settings" 
ON system_settings 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('hr_admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('hr_admin', 'super_admin')
  )
);

-- Create policy for admin users to insert settings
CREATE POLICY "Admin can insert system settings" 
ON system_settings 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('hr_admin', 'super_admin')
  )
  AND id = 1
);

-- Insert default settings if no settings exist
INSERT INTO system_settings (id, settings, created_at, updated_at)
VALUES (
  1,
  jsonb_build_object(
    'max_annual_leave_days', 21,
    'max_sick_leave_days', 10,
    'max_maternity_leave_days', 90,
    'max_paternity_leave_days', 14,
    'leave_year_start_month', 1,
    'carry_forward_limit', 5,
    'minimum_notice_days', 7,
    'auto_approve_limit', 0,
    'require_hod_approval', true,
    'require_hr_approval', true,
    'escalation_days', 3,
    'email_notifications', true,
    'reminder_notifications', true,
    'approval_notifications', true,
    'deadline_notifications', true,
    'working_days', '["monday","tuesday","wednesday","thursday","friday"]'::jsonb,
    'exclude_weekends', true,
    'exclude_holidays', true,
    'allow_backdated_requests', false,
    'max_future_booking_months', 12,
    'require_manager_coverage', true,
    'block_overlapping_requests', true,
    'office_latitude', -1.2517,
    'office_longitude', 36.7989,
    'geofence_radius', 100,
    'geofence_notification_title', 'Welcome to FKF!',
    'geofence_notification_body', 'You are at the office. Tap to sign in.',
    'min_gps_accuracy', 50
  ),
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET 
  settings = system_settings.settings || jsonb_build_object(
    'office_latitude', COALESCE((system_settings.settings->>'office_latitude')::numeric, -1.2517),
    'office_longitude', COALESCE((system_settings.settings->>'office_longitude')::numeric, 36.7989),
    'geofence_radius', COALESCE((system_settings.settings->>'geofence_radius')::integer, 100),
    'geofence_notification_title', COALESCE(system_settings.settings->>'geofence_notification_title', 'Welcome to FKF!'),
    'geofence_notification_body', COALESCE(system_settings.settings->>'geofence_notification_body', 'You are at the office. Tap to sign in.'),
    'min_gps_accuracy', COALESCE((system_settings.settings->>'min_gps_accuracy')::integer, 50)
  ),
  updated_at = NOW();

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON system_settings TO authenticated;

-- Drop function if exists
DROP FUNCTION IF EXISTS get_geofence_config();

-- Create function to get geofence configuration
CREATE FUNCTION get_geofence_config()
RETURNS TABLE (
  latitude NUMERIC,
  longitude NUMERIC,
  radius INTEGER,
  notification_title TEXT,
  notification_body TEXT,
  min_accuracy INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE((settings->>'office_latitude')::numeric, -1.2517)::numeric,
    COALESCE((settings->>'office_longitude')::numeric, 36.7989)::numeric,
    COALESCE((settings->>'geofence_radius')::integer, 100)::integer,
    COALESCE(settings->>'geofence_notification_title', 'Welcome to FKF!')::text,
    COALESCE(settings->>'geofence_notification_body', 'You are at the office. Tap to sign in.')::text,
    COALESCE((settings->>'min_gps_accuracy')::integer, 50)::integer
  FROM system_settings
  WHERE id = 1
  LIMIT 1;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_geofence_config() TO authenticated;

COMMENT ON FUNCTION get_geofence_config() IS 'Returns the current geofence configuration for office location tracking';
