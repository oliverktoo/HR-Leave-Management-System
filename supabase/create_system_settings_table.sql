-- Create system_settings table for storing global policy settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure only one settings record exists
  CONSTRAINT single_settings CHECK (id = 1)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for system_settings - allow all authenticated users to read/write
-- (Role-based restrictions are handled at the application level)
CREATE POLICY "Allow authenticated users to read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert system settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Insert default settings
INSERT INTO public.system_settings (id, settings, updated_at)
VALUES (
  1,
  '{
    "max_annual_leave_days": 21,
    "max_sick_leave_days": 10,
    "max_maternity_leave_days": 90,
    "max_paternity_leave_days": 14,
    "leave_year_start_month": 1,
    "carry_forward_limit": 5,
    "minimum_notice_days": 7,
    "auto_approve_limit": 0,
    "require_hod_approval": true,
    "require_hr_approval": true,
    "escalation_days": 3,
    "email_notifications": true,
    "reminder_notifications": true,
    "approval_notifications": true,
    "deadline_notifications": true,
    "working_days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
    "exclude_weekends": true,
    "exclude_holidays": true,
    "allow_backdated_requests": false,
    "max_future_booking_months": 12,
    "require_manager_coverage": true,
    "block_overlapping_requests": true
  }'::jsonb,
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create index on updated_at for better query performance
CREATE INDEX IF NOT EXISTS idx_system_settings_updated_at 
ON public.system_settings(updated_at);

-- Add comment
COMMENT ON TABLE public.system_settings IS 'Global system policy settings and configurations (singleton table)';
