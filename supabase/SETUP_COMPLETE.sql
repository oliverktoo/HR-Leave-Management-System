-- IMMEDIATE FIX for oliverkiptook@gmail.com admin access
-- Run this in Supabase SQL Editor RIGHT NOW

-- Step 1: Check current user status
DO $$
DECLARE
    user_record RECORD;
BEGIN
    -- Check if user exists in auth and profile
    SELECT 
        au.id,
        au.email,
        up.role,
        up.first_name,
        up.last_name
    INTO user_record
    FROM auth.users au
    LEFT JOIN users_profile up ON au.id = up.id
    WHERE au.email = 'oliverkiptook@gmail.com';
    
    IF user_record.id IS NULL THEN
        RAISE NOTICE 'ERROR: No auth user found for oliverkiptook@gmail.com';
        RAISE NOTICE 'You need to create the auth user first in Authentication > Users';
    ELSIF user_record.role IS NULL THEN
        RAISE NOTICE 'Found auth user but no profile. Creating admin profile...';
        
        -- Create the profile
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
            user_record.id,
            'EMP001',
            'oliverkiptook@gmail.com',
            'Oliver',
            'Kiptook',
            (SELECT id FROM departments WHERE name ILIKE '%hr%' OR name ILIKE '%human%' LIMIT 1),
            'System Administrator',
            'hr_admin',
            CURRENT_DATE,
            true
        );
        
        RAISE NOTICE 'SUCCESS: Admin profile created with role hr_admin';
        
    ELSIF user_record.role != 'hr_admin' THEN
        RAISE NOTICE 'Found profile with role: %. Updating to hr_admin...', user_record.role;
        
        -- Update the role
        UPDATE users_profile 
        SET role = 'hr_admin',
            job_title = 'System Administrator',
            is_active = true
        WHERE id = user_record.id;
        
        RAISE NOTICE 'SUCCESS: Role updated to hr_admin';
        
    ELSE
        RAISE NOTICE 'SUCCESS: User already has hr_admin role';
    END IF;
END $$;

-- Step 2: Verify the fix
SELECT 
    'VERIFICATION: Current user status' as check_type,
    up.email,
    up.role,
    up.first_name,
    up.last_name,
    up.is_active,
    CASE 
        WHEN up.role = 'hr_admin' AND up.is_active = true THEN 'READY FOR ADMIN ACCESS ✅'
        ELSE 'NEEDS FURTHER FIXES ❌'
    END as status
FROM users_profile up
WHERE up.email = 'oliverkiptook@gmail.com';

-- If no results above, run this check:
SELECT 
    'AUTH USER CHECK' as check_type,
    au.email,
    au.id,
    'Profile missing - run the script above' as issue
FROM auth.users au
WHERE au.email = 'oliverkiptook@gmail.com'
AND NOT EXISTS (SELECT 1 FROM users_profile up WHERE up.id = au.id);