-- ================================================
-- CREATE SIMPLE TEST ADMIN USER
-- ================================================
-- This creates a new admin user you can use to test login
-- Run this in Supabase SQL Editor

DO $$
DECLARE
    v_user_id uuid;
    v_email text := 'admin@test.com';
    v_password text := 'TestAdmin123!';
    v_hr_dept_id uuid;
    v_user_exists boolean := false;
BEGIN
    -- Check if user already exists
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = v_email) INTO v_user_exists;
    
    IF v_user_exists THEN
        -- Get existing user ID
        SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
        
        -- Update password
        UPDATE auth.users 
        SET 
            encrypted_password = crypt(v_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE email = v_email;
        
        RAISE NOTICE '✅ Updated existing user password';
    ELSE
        -- Generate new user ID
        v_user_id := gen_random_uuid();
        
        -- Create auth user
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at,
            confirmation_token,
            recovery_token,
            email_change_token_new,
            email_change
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_email,
            crypt(v_password, gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"password_changed": true}'::jsonb,
            now(),
            now(),
            '',
            '',
            '',
            ''
        );
        
        RAISE NOTICE '✅ Created new auth user';
    END IF;
    
    -- Get or create HR department
    SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'Human Resources' LIMIT 1;
    
    IF v_hr_dept_id IS NULL THEN
        INSERT INTO departments (name, description, head_of_department_id) 
        VALUES ('Human Resources', 'HR Department', v_user_id) 
        RETURNING id INTO v_hr_dept_id;
        RAISE NOTICE '✅ Created HR department';
    END IF;
    
    -- Create or update user profile
    INSERT INTO users_profile (
        id,
        email,
        first_name,
        last_name,
        employee_id,
        role,
        department_id,
        job_title,
        hire_date,
        is_active
    ) VALUES (
        v_user_id,
        v_email,
        'Test',
        'Admin',
        'EMP-TEST-ADMIN',
        'hr_admin',
        v_hr_dept_id,
        'System Administrator',
        CURRENT_DATE,
        true
    ) ON CONFLICT (id) DO UPDATE SET
        role = 'hr_admin',
        is_active = true,
        updated_at = now();
    
    RAISE NOTICE '✅ User profile created/updated';
    
    -- Create leave balances for current year
    INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
    SELECT 
        v_user_id,
        id,
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,
        max_days_per_year,
        0,
        0,
        0
    FROM leave_types
    WHERE is_active = true
    ON CONFLICT (user_id, leave_type_id, year) DO NOTHING;
    
    RAISE NOTICE '✅ Leave balances created';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ TEST ADMIN USER CREATED!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE 'Password: %', v_password;
    RAISE NOTICE 'Role: HR Administrator';
    RAISE NOTICE 'URL: http://localhost:5177/';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now login with these credentials!';
END $$;

-- Verify the setup
SELECT 
    '✅ Verification' as status,
    au.email,
    au.email_confirmed_at IS NOT NULL as email_confirmed,
    up.first_name || ' ' || up.last_name as name,
    up.role,
    up.is_active,
    d.name as department
FROM auth.users au
JOIN users_profile up ON au.id = up.id
LEFT JOIN departments d ON up.department_id = d.id
WHERE au.email = 'admin@test.com';
