-- =====================================================
-- Staff Attendance System Setup
-- =====================================================
-- This script creates tables and policies for staff attendance tracking
-- Run this script in your Supabase SQL Editor

-- Create attendance_records table
CREATE TABLE IF NOT EXISTS public.attendance_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'late', 'half_day', 'absent')),
    location VARCHAR(255),
    ip_address INET,
    notes TEXT,
    work_hours DECIMAL(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_attendance_user_id ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance_records(date);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_id ON public.attendance_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON public.attendance_records(user_id, date);

-- Add unique constraint to prevent duplicate check-ins per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_user_date ON public.attendance_records(user_id, date);

-- Create attendance_settings table for configurable rules
CREATE TABLE IF NOT EXISTS public.attendance_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    work_start_time TIME DEFAULT '08:00:00',
    work_end_time TIME DEFAULT '17:00:00',
    late_threshold_minutes INTEGER DEFAULT 15,
    half_day_hours DECIMAL(4,2) DEFAULT 4.0,
    full_day_hours DECIMAL(4,2) DEFAULT 8.0,
    grace_period_minutes INTEGER DEFAULT 5,
    enable_location_tracking BOOLEAN DEFAULT false,
    require_checkout BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings if not exists
INSERT INTO public.attendance_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.attendance_settings LIMIT 1);

-- Enable Row Level Security
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can insert their own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Users can update their own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR admins can view all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR admins can update all attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR admins can delete attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HODs can view department attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "Everyone can view attendance settings" ON public.attendance_settings;
DROP POLICY IF EXISTS "Only admins can modify attendance settings" ON public.attendance_settings;

-- RLS Policies for attendance_records

-- Staff can view their own attendance records
CREATE POLICY "Users can view their own attendance"
    ON public.attendance_records
    FOR SELECT
    USING (auth.uid() = user_id);

-- Staff can create their own attendance records (check-in)
CREATE POLICY "Users can insert their own attendance"
    ON public.attendance_records
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Staff can update their own attendance records (check-out)
CREATE POLICY "Users can update their own attendance"
    ON public.attendance_records
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- HR Admins and Super Admins can view all attendance records
CREATE POLICY "HR admins can view all attendance"
    ON public.attendance_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- HR Admins can update/correct attendance records
CREATE POLICY "HR admins can update all attendance"
    ON public.attendance_records
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- HR Admins can delete attendance records
CREATE POLICY "HR admins can delete attendance"
    ON public.attendance_records
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- HODs can view their department's attendance
CREATE POLICY "HODs can view department attendance"
    ON public.attendance_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile as hod
            INNER JOIN public.users_profile as staff ON hod.department_id = staff.department_id
            WHERE hod.id = auth.uid()
            AND hod.role = 'hod'
            AND staff.id = attendance_records.user_id
        )
    );

-- RLS Policies for attendance_settings

-- Everyone can view settings
CREATE POLICY "Everyone can view attendance settings"
    ON public.attendance_settings
    FOR SELECT
    USING (true);

-- Only admins can modify settings
CREATE POLICY "Only admins can modify attendance settings"
    ON public.attendance_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users_profile
            WHERE users_profile.id = auth.uid()
            AND users_profile.role IN ('hr_admin', 'super_admin')
        )
    );

-- Create function to calculate work hours
CREATE OR REPLACE FUNCTION calculate_work_hours(
    check_in TIMESTAMPTZ,
    check_out TIMESTAMPTZ
)
RETURNS DECIMAL(5,2)
LANGUAGE plpgsql
AS $$
DECLARE
    hours DECIMAL(5,2);
BEGIN
    IF check_out IS NULL THEN
        RETURN 0;
    END IF;
    
    hours := EXTRACT(EPOCH FROM (check_out - check_in)) / 3600.0;
    RETURN ROUND(hours, 2);
END;
$$;

-- Create trigger to automatically calculate work hours on update
CREATE OR REPLACE FUNCTION update_attendance_work_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.check_out_time IS NOT NULL THEN
        NEW.work_hours := calculate_work_hours(NEW.check_in_time, NEW.check_out_time);
        NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calculate_work_hours ON public.attendance_records;
CREATE TRIGGER trigger_calculate_work_hours
    BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW
    EXECUTE FUNCTION update_attendance_work_hours();

-- Create function to determine attendance status based on check-in time
CREATE OR REPLACE FUNCTION determine_attendance_status(
    check_in_time TIMESTAMPTZ,
    work_start_time TIME,
    late_threshold_minutes INTEGER
)
RETURNS VARCHAR(20)
LANGUAGE plpgsql
AS $$
DECLARE
    check_in_time_only TIME;
    minutes_late INTEGER;
BEGIN
    check_in_time_only := check_in_time::TIME;
    minutes_late := EXTRACT(EPOCH FROM (check_in_time_only - work_start_time)) / 60;
    
    IF minutes_late <= 0 THEN
        RETURN 'present';
    ELSIF minutes_late <= late_threshold_minutes THEN
        RETURN 'present';
    ELSE
        RETURN 'late';
    END IF;
END;
$$;

-- Create view for attendance summary (for reports)
CREATE OR REPLACE VIEW public.attendance_summary AS
SELECT 
    u.id as user_id,
    u.employee_id,
    u.first_name || ' ' || u.last_name as full_name,
    u.department_id,
    u.email,
    COUNT(ar.id) as days_present,
    COUNT(CASE WHEN ar.status = 'late' THEN 1 END) as days_late,
    COUNT(CASE WHEN ar.status = 'half_day' THEN 1 END) as half_days,
    COALESCE(SUM(ar.work_hours), 0) as total_hours,
    DATE_TRUNC('month', CURRENT_DATE) as month,
    CURRENT_DATE as report_date
FROM public.users_profile u
LEFT JOIN public.attendance_records ar ON u.id = ar.user_id 
    AND DATE_TRUNC('month', ar.date) = DATE_TRUNC('month', CURRENT_DATE)
WHERE u.role IN ('employee', 'hod', 'hr_admin', 'super_admin')
GROUP BY u.id, u.employee_id, u.first_name, u.last_name, u.department_id, u.email;

-- Grant permissions for the view
GRANT SELECT ON public.attendance_summary TO authenticated;

-- Create function to get today's attendance for a user
CREATE OR REPLACE FUNCTION get_today_attendance(user_uuid UUID)
RETURNS TABLE (
    id UUID,
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    status VARCHAR(20),
    work_hours DECIMAL(5,2),
    date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ar.id,
        ar.check_in_time,
        ar.check_out_time,
        ar.status,
        ar.work_hours,
        ar.date
    FROM public.attendance_records ar
    WHERE ar.user_id = user_uuid
    AND ar.date = CURRENT_DATE;
END;
$$;

-- =====================================================
-- Attendance System Setup Complete
-- =====================================================

COMMENT ON TABLE public.attendance_records IS 'Stores staff check-in/check-out records for attendance tracking';
COMMENT ON TABLE public.attendance_settings IS 'Configurable settings for attendance system';
COMMENT ON VIEW public.attendance_summary IS 'Monthly attendance summary for reporting';
