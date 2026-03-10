-- ================================================
-- RESET PASSWORD FOR EXISTING USER
-- ================================================
-- This script will reset the password for your account
-- Run this in Supabase SQL Editor

-- Update credentials for oliverkiptook@gmail.com
DO $$
DECLARE
    v_user_id uuid;
    v_email text := 'oliverkiptook@gmail.com';
    v_new_password text := 'Admin123!@#';
    v_hr_dept_id uuid;
    v_auth_exists boolean := false;
BEGIN
    -- Check if auth user exists
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = v_email) INTO v_auth_exists;
    
    IF v_auth_exists THEN
        -- Get existing user ID
        SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;
        
        -- Update password and confirm email
        UPDATE auth.users 
        SET 
            encrypted_password = crypt(v_new_password, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE email = v_email;
        
        RAISE NOTICE '✅ Password reset successfully for existing user!';
    ELSE
        -- Create new auth user
        v_user_id := gen_random_uuid();
        
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
            crypt(v_new_password, gen_salt('bf')),
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
        
        RAISE NOTICE '✅ Created new auth user!';
    END IF;
    
    -- Get or create HR department
    SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'Human Resources' LIMIT 1;
    
    IF v_hr_dept_id IS NULL THEN
        INSERT INTO departments (name, description, head_of_department_id) 
        VALUES ('Human Resources', 'HR Department', v_user_id) 
        RETURNING id INTO v_hr_dept_id;
        RAISE NOTICE '✅ Created HR department';
    END IF;
    
    -- Create or update profile
    IF EXISTS(SELECT 1 FROM users_profile WHERE id = v_user_id) THEN
        UPDATE users_profile 
        SET 
            is_active = true,
            role = 'hr_admin',
            updated_at = now()
        WHERE id = v_user_id;
        RAISE NOTICE '✅ User profile updated';
    ELSE
        -- Create new profile
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
            'Oliver',
            'Kiptook',
            'EMP-ADMIN-001',
            'hr_admin',
            v_hr_dept_id,
            'HR Administrator',
            CURRENT_DATE,
            true
        );
        RAISE NOTICE '✅ User profile created';
    END IF;
    
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
    RAISE NOTICE 'LOGIN CREDENTIALS:';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Email: %', v_email;
    RAISE NOTICE 'Password: %', v_new_password;
    RAISE NOTICE 'URL: http://localhost:5177/';
    RAISE NOTICE '========================================';
END $$;

-- Verify the user setup
SELECT 
    'Auth User' as type,
    email,
    email_confirmed_at IS NOT NULL as confirmed,
    created_at
FROM auth.users 
WHERE email = 'oliverkiptook@gmail.com';

SELECT 
    'Profile' as type,
    email,
    first_name || ' ' || last_name as name,
    role,
    is_active
FROM users_profile 
WHERE email = 'oliverkiptook@gmail.com';
