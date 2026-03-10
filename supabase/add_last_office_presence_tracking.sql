-- Add column to track last time user was detected at office
-- This enables automatic checkout at the time they left office

-- Add last_office_presence column to attendance_records
ALTER TABLE attendance_records 
ADD COLUMN IF NOT EXISTS last_office_presence TIMESTAMPTZ;

-- Add comment
COMMENT ON COLUMN attendance_records.last_office_presence IS 'Last timestamp when user was confirmed to be at office location. Used for auto-checkout when leaving office.';

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_attendance_last_presence 
ON attendance_records(user_id, date, last_office_presence);

-- Add function to update last_office_presence
CREATE OR REPLACE FUNCTION update_last_office_presence(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE attendance_records
  SET 
    last_office_presence = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id 
    AND date = p_date
    AND check_out_time IS NULL; -- Only update if not checked out
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_last_office_presence(UUID, DATE) TO authenticated;

-- Add RLS policy for updating last_office_presence
-- Users can update their own last_office_presence
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'attendance_records' 
    AND policyname = 'Users can update last office presence'
  ) THEN
    CREATE POLICY "Users can update last office presence"
      ON attendance_records
      FOR UPDATE
      USING (auth.uid() = user_id AND check_out_time IS NULL)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Sample query to test
-- SELECT * FROM attendance_records WHERE user_id = auth.uid() AND date = CURRENT_DATE;

COMMENT ON FUNCTION update_last_office_presence(UUID, DATE) IS 
'Updates the last_office_presence timestamp for a user. Should be called periodically when user is confirmed to be at office.';
