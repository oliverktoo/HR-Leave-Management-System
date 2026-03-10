-- ================================================
-- HR ADMIN PASSWORD RESET FUNCTION
-- ================================================
-- This allows HR admins to reset user passwords without email
-- Run this in Supabase SQL Editor

-- Create function to reset user password (requires elevated permissions)
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
        json_build_object('reset_by', auth.uid(), 'reset_at', now()),
        auth.uid()
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password reset successfully'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permission to authenticated users (RLS will handle authorization)
GRANT EXECUTE ON FUNCTION admin_reset_user_password(UUID, TEXT) TO authenticated;

-- Create a simpler version that can be called from frontend
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
        RAISE EXCEPTION 'Only HR admins can reset passwords';
    END IF;
    
    -- Get user ID from email
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    
    -- Update password
    UPDATE auth.users
    SET 
        encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_user_id;
    
    -- Log the action
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
            'target_email', p_email
        ),
        auth.uid()
    );
    
    RETURN json_build_object(
        'success', true,
        'message', 'Password reset successfully for ' || p_email
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reset_employee_password(TEXT, TEXT) TO authenticated;

-- ================================================
-- Verification
-- ================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Password Reset Functions Created!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions available:';
    RAISE NOTICE '1. admin_reset_user_password(user_id, new_password)';
    RAISE NOTICE '2. reset_employee_password(email, new_password)';
    RAISE NOTICE '';
    RAISE NOTICE 'Only HR Admins can use these functions';
    RAISE NOTICE 'All password resets are logged in audit_logs';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- Test query (don't run in production with real data)
-- SELECT * FROM reset_employee_password('user@example.com', 'NewPassword123!');
