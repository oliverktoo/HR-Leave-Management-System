-- Update attendance_summary view to include department names
-- This replaces the existing view to include department information

-- Drop the existing view first to allow column structure changes
DROP VIEW IF EXISTS public.attendance_summary;

-- Recreate the view with department names
CREATE VIEW public.attendance_summary AS
SELECT 
    u.id as user_id,
    u.employee_id,
    u.first_name || ' ' || u.last_name as full_name,
    u.department_id,
    d.name as department_name,
    u.email,
    COUNT(ar.id) as days_present,
    COUNT(CASE WHEN ar.status = 'late' THEN 1 END) as days_late,
    COUNT(CASE WHEN ar.status = 'half_day' THEN 1 END) as half_days,
    COALESCE(SUM(ar.work_hours), 0) as total_hours,
    DATE_TRUNC('month', CURRENT_DATE) as month,
    CURRENT_DATE as report_date
FROM public.users_profile u
LEFT JOIN public.departments d ON u.department_id = d.id
LEFT JOIN public.attendance_records ar ON u.id = ar.user_id 
    AND DATE_TRUNC('month', ar.date) = DATE_TRUNC('month', CURRENT_DATE)
WHERE u.role IN ('employee', 'hod', 'hr_admin', 'super_admin')
GROUP BY u.id, u.employee_id, u.first_name, u.last_name, u.department_id, d.name, u.email;

-- Grant permissions for the view
GRANT SELECT ON public.attendance_summary TO authenticated;

COMMENT ON VIEW public.attendance_summary IS 'Monthly attendance summary with department names for reporting';
