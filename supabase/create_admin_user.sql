-- Admin User Setup Script
-- Run this AFTER creating the auth user in Supabase Dashboard
-- 
-- STEPS:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw
-- 2. Go to Authentication > Users
-- 3. Click "Add user" 
-- 4. Email: admin@fkf.com
-- 5. Password: Admin123!@#
-- 6. Copy the User ID that gets generated
-- 7. Replace 'PASTE_USER_ID_HERE' below with that ID
-- 8. Run this script in SQL Editor

INSERT INTO users_profile (
    id,
    employee_id,
    email,
    first_name,
    last_name,
    department_id,
    job_title,
    role,
    hire_date,
    is_active
) VALUES (
    'PASTE_USER_ID_HERE', -- Replace with actual auth.users ID from step 6
    'EMP001',
    'admin@fkf.com',
    'System',
    'Administrator',
    '00000000-0000-0000-0000-000000000001', -- HR Department
    'HR Administrator',
    'hr_admin',
    '2024-01-01',
    true
);

-- Create initial leave balances for admin user
INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days, used_days, pending_days, carried_forward_days) VALUES
    ('PASTE_USER_ID_HERE', '00000000-0000-0000-0000-000000000011', 2025, 21, 0, 0, 0), -- Annual Leave
    ('PASTE_USER_ID_HERE', '00000000-0000-0000-0000-000000000012', 2025, 14, 0, 0, 0), -- Sick Leave
    ('PASTE_USER_ID_HERE', '00000000-0000-0000-0000-000000000015', 2025, 5, 0, 0, 0),  -- Compassionate Leave
    ('PASTE_USER_ID_HERE', '00000000-0000-0000-0000-000000000016', 2025, 10, 0, 0, 0); -- Study Leave

SELECT 'Admin user profile created successfully!' AS message;