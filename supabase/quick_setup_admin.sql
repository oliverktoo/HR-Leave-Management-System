-- Quick Setup Script for Super Admin
-- Copy and paste this entire script into Supabase SQL Editor
-- It will create the auth user and profile in one go

-- STEP 1: Create the auth user with a secure password
-- This creates the user directly in auth.users
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at
)
SELECT
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(), -- This will be the user ID
    'authenticated',
    'authenticated',
    'admin@fkf.com',
    crypt('Admin123!@#', gen_salt('bf')), -- Password: Admin123!@#
    now(),
    NULL,
    '',
    NULL,
    '',
    NULL,
    '',
    '',
    NULL,
    NULL,
    '{"provider":"email","providers":["email"]}',
    '{}',
    NULL,
    now(),
    now(),
    NULL,
    NULL,
    '',
    '',
    NULL,
    '',
    0,
    NULL,
    '',
    NULL,
    false,
    NULL
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'admin@fkf.com'
);

-- STEP 2: Get the user ID we just created
DO $$
DECLARE
    v_user_id uuid;
    v_hr_dept_id uuid;
BEGIN
    -- Get the user ID
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE email = 'admin@fkf.com';
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not created. Please check if user already exists.';
    END IF;
    
    RAISE NOTICE 'User ID: %', v_user_id;
    
    -- Get or create HR department
    SELECT id INTO v_hr_dept_id 
    FROM departments 
    WHERE name = 'Human Resources' 
    LIMIT 1;
    
    IF v_hr_dept_id IS NULL THEN
        INSERT INTO departments (name, hod_user_id)
        VALUES ('Human Resources', v_user_id)
        RETURNING id INTO v_hr_dept_id;
        
        RAISE NOTICE 'Created HR department';
    ELSE
        RAISE NOTICE 'Using existing HR department';
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
        'admin@fkf.com',
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
        first_name = 'System',
        last_name = 'Administrator',
        department_id = v_hr_dept_id,
        is_active = true;
    
    RAISE NOTICE 'Created super admin profile';
    
    -- Create leave balances for 2025
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
        balance = EXCLUDED.balance;
    
    RAISE NOTICE 'Created leave balances';
    
    -- Update HR department HOD
    UPDATE departments 
    SET hod_user_id = v_user_id
    WHERE id = v_hr_dept_id;
    
    RAISE NOTICE '✅ Super Admin Setup Complete!';
    RAISE NOTICE 'Email: admin@fkf.com';
    RAISE NOTICE 'Password: Admin123!@#';
    RAISE NOTICE 'Role: HR Admin';
    
END $$;

-- STEP 3: Verify the setup
SELECT 
    up.id,
    up.email,
    up.first_name || ' ' || up.last_name as full_name,
    up.role,
    up.employee_id,
    d.name as department,
    up.is_active,
    COUNT(lb.id) as leave_balances_count
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
LEFT JOIN leave_balances lb ON up.id = lb.user_id AND lb.year = 2025
WHERE up.email = 'admin@fkf.com'
GROUP BY up.id, up.email, up.first_name, up.last_name, up.role, up.employee_id, d.name, up.is_active;

-- STEP 4: Show leave balances
SELECT 
    up.email,
    lt.name as leave_type,
    lb.balance,
    lb.used,
    lb.pending,
    lb.year
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE up.email = 'admin@fkf.com'
ORDER BY lt.name;
