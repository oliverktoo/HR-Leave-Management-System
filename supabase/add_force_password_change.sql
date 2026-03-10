-- ================================================
-- ADD FORCE PASSWORD CHANGE FUNCTIONALITY
-- ================================================
-- This adds the ability to force users to change their password after admin reset
-- Run this in Supabase SQL Editor

-- Step 1: Add must_change_password column to users_profile
ALTER TABLE users_profile 
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN users_profile.must_change_password IS 'Flag to force user to change password on next login (set by admin after password reset)';

-- Step 2: Update the admin_reset_user_password function to set the flag
CREATE OR REPLACE FUNCTION admin_reset_user_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSON;
    v_admin_role TEXT;
BEGIN
    -- Check if caller is HR admin or super admin
    SELECT role INTO v_admin_role 
    FROM users_profile 
    WHERE id = auth.uid();
    
    IF v_admin_role NOT IN ('hr_admin', 'super_admin') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Only HR admins can reset passwords'
        );
    END IF;
    
    -- Update password in auth.users
    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;
    
    -- Check if update was successful
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not found'
        );
    END IF;
    
    -- Set flag to force password change on next login
    UPDATE users_profile
    SET must_change_password = TRUE
    WHERE id = p_user_id;
    
    -- Log the password reset action
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_data,
        user_id
    ) VALUES (
        'auth.users',
        p_user_id,
        'password_reset_by_admin',
        json_build_object('reset_by', auth.uid(), 'reset_at', now(), 'must_change', true),
        auth.uid()
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password reset successfully. User will be required to change password on next login.'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Step 3: Update reset_employee_password function as well
CREATE OR REPLACE FUNCTION reset_employee_password(
    p_email TEXT,
    p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_admin_role TEXT;
BEGIN
    -- Check if caller is HR admin or super admin
    SELECT role INTO v_admin_role 
    FROM users_profile 
    WHERE id = auth.uid();
    
    IF v_admin_role NOT IN ('hr_admin', 'super_admin') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Only HR admins can reset passwords'
        );
    END IF;
    
    -- Get user_id from email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not found with email: ' || p_email
        );
    END IF;
    
    -- Update password in auth.users
    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_user_id;
    
    -- Set flag to force password change on next login
    UPDATE users_profile
    SET must_change_password = TRUE
    WHERE id = v_user_id;
    
    -- Log the password reset action
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_data,
        user_id
    ) VALUES (
        'auth.users',
        v_user_id,
        'password_reset_by_admin',
        json_build_object(
            'reset_by', auth.uid(), 
            'reset_at', now(), 
            'user_email', p_email,
            'must_change', true
        ),
        auth.uid()
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password reset successfully. User will be required to change password on next login.',
        'user_id', v_user_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Step 4: Create function to clear the force password change flag
CREATE OR REPLACE FUNCTION clear_must_change_password()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Clear the flag for the current user
    UPDATE users_profile
    SET must_change_password = FALSE
    WHERE id = auth.uid();
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User profile not found'
        );
    END IF;
    
    -- Log the action
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        new_data,
        user_id
    ) VALUES (
        'users_profile',
        auth.uid(),
        'password_changed_by_user',
        json_build_object('changed_at', now()),
        auth.uid()
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password change requirement cleared'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION clear_must_change_password() TO authenticated;

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- Check that column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users_profile' 
AND column_name = 'must_change_password';

-- Success message
DO $$ 
BEGIN 
    RAISE NOTICE '✅ Force Password Change functionality added successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 What was added:';
    RAISE NOTICE '   1. must_change_password column in users_profile table';
    RAISE NOTICE '   2. Updated admin_reset_user_password() to set flag';
    RAISE NOTICE '   3. Updated reset_employee_password() to set flag';
    RAISE NOTICE '   4. Created clear_must_change_password() function';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Next steps:';
    RAISE NOTICE '   - Update frontend to check this flag on login';
    RAISE NOTICE '   - Redirect users to /change-password if flag is true';
    RAISE NOTICE '   - Call clear_must_change_password() after password change';
END $$;
