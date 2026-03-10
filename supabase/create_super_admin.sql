-- Create Super Admin User for Leave Management System
-- Run this in Supabase SQL Editor after creating the auth user

-- Step 1: First, create the user in Supabase Dashboard:
-- Go to Authentication → Users → Add User
-- Email: admin@fkf.com
-- Password: Admin123!@# (change this after first login)
-- ✅ Auto Confirm User
-- Copy the user ID after creation

-- Step 2: Run this script, replacing 'USER_ID_HERE' with the actual user ID

DO $$
DECLARE
    v_user_id uuid := 'USER_ID_HERE'; -- Replace with actual user ID from auth.users
    v_admin_email text := 'admin@fkf.com';
    v_hr_dept_id uuid;
BEGIN
    -- Get or create HR department
    SELECT id INTO v_hr_dept_id 
    FROM departments 
    WHERE name = 'Human Resources' 
    LIMIT 1;
    
    -- If HR department doesn't exist, create it
    IF v_hr_dept_id IS NULL THEN
        INSERT INTO departments (name, hod_user_id)
        VALUES ('Human Resources', v_user_id)
        RETURNING id INTO v_hr_dept_id;
        
        RAISE NOTICE 'Created HR department with ID: %', v_hr_dept_id;
    END IF;
    
    -- Create super admin profile
    INSERT INTO users_profile (
        id,
        email,
        first_name,
        last_name,
        role,
        department_id,
        phone,
        employee_id,
        hire_date,
        is_active
    ) VALUES (
        v_user_id,
        v_admin_email,
        'System',
        'Administrator',
        'hr_admin',
        v_hr_dept_id,
        '+254700000000',
        'EMP-ADMIN-001',
        CURRENT_DATE,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'hr_admin',
        department_id = v_hr_dept_id,
        is_active = true;
    
    RAISE NOTICE 'Created/Updated super admin profile';
    
    -- Create leave balances for current year (2025)
    INSERT INTO leave_balances (user_id, leave_type_id, year, balance, used, pending)
    SELECT 
        v_user_id,
        lt.id,
        2025,
        lt.default_days,
        0,
        0
    FROM leave_types lt
    ON CONFLICT (user_id, leave_type_id, year) DO UPDATE SET
        balance = leave_types.default_days;
    
    RAISE NOTICE 'Created leave balances for super admin';
    
    -- Update HR department to set admin as HOD if not set
    UPDATE departments 
    SET hod_user_id = v_user_id
    WHERE name = 'Human Resources' AND hod_user_id IS NULL;
    
    RAISE NOTICE 'Super admin setup complete!';
    RAISE NOTICE 'Email: %', v_admin_email;
    RAISE NOTICE 'Role: hr_admin';
    RAISE NOTICE 'Department: Human Resources';
    
END $$;

-- Verify the setup
SELECT 
    up.email,
    up.first_name,
    up.last_name,
    up.role,
    up.employee_id,
    d.name as department,
    up.is_active,
    COUNT(lb.id) as leave_types_configured
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
LEFT JOIN leave_balances lb ON up.id = lb.user_id AND lb.year = 2025
WHERE up.email = 'admin@fkf.com'
GROUP BY up.id, up.email, up.first_name, up.last_name, up.role, up.employee_id, d.name, up.is_active;
