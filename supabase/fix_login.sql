-- Check and fix authentication for Oliver's account
-- Run this to diagnose and fix the login issue

-- 1. Check if user exists in auth.users
SELECT 
    'Auth User Check' as info,
    id, 
    email, 
    email_confirmed_at,
    created_at,
    CASE 
        WHEN email_confirmed_at IS NULL THEN '❌ Email not confirmed'
        ELSE '✅ Email confirmed'
    END as status
FROM auth.users 
WHERE email = 'oliverkiptook@gmail.com';

-- 2. Check users_profile
SELECT 
    'Profile Check' as info,
    id,
    email,
    role,
    is_active,
    CASE 
        WHEN is_active = true THEN '✅ Active'
        ELSE '❌ Inactive'
    END as status
FROM users_profile 
WHERE email = 'oliverkiptook@gmail.com';

-- 3. If auth user doesn't exist or has issues, let's create/fix it
DO $$
DECLARE
    v_user_id uuid := 'a16fcdb3-7af0-4885-901a-93630290141c';
    v_auth_user_exists boolean := false;
BEGIN
    -- Check if auth user exists
    SELECT EXISTS(SELECT 1 FROM auth.users WHERE email = 'oliverkiptook@gmail.com') INTO v_auth_user_exists;
    
    IF NOT v_auth_user_exists THEN
        -- Create auth user if it doesn't exist
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
        )
        VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            'oliverkiptook@gmail.com',
            crypt('TempPassword123!', gen_salt('bf')), -- Temporary password
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{}'::jsonb,
            now(),
            now(),
            '',
            '',
            '',
            ''
        );
        RAISE NOTICE '✅ Created auth user with temporary password: TempPassword123!';
    ELSE
        -- Update existing auth user to ensure it's confirmed
        UPDATE auth.users 
        SET 
            email_confirmed_at = now(),
            encrypted_password = crypt('TempPassword123!', gen_salt('bf'))
        WHERE email = 'oliverkiptook@gmail.com';
        RAISE NOTICE '✅ Updated auth user with temporary password: TempPassword123!';
    END IF;
    
    RAISE NOTICE 'Login credentials:';
    RAISE NOTICE 'Email: oliverkiptook@gmail.com';
    RAISE NOTICE 'Password: TempPassword123!';
    RAISE NOTICE 'URL: http://localhost:5177/';
END $$;

-- 4. Final verification
SELECT 
    'Final Check' as info,
    au.email,
    au.email_confirmed_at IS NOT NULL as email_confirmed,
    up.role,
    up.is_active,
    '✅ Ready to login' as status
FROM auth.users au
JOIN users_profile up ON au.id = up.id
WHERE au.email = 'oliverkiptook@gmail.com';