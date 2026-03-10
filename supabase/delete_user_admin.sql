-- Function to delete a user (admin only)
-- This function handles all cascading deletes properly

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS delete_user_admin(UUID);

CREATE OR REPLACE FUNCTION delete_user_admin(user_id_to_delete UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  current_user_role TEXT;
  user_email TEXT;
  result JSON;
BEGIN
  -- Get current user's ID and role
  current_user_id := auth.uid();
  
  SELECT role INTO current_user_role
  FROM users_profile
  WHERE id = current_user_id;
  
  -- Check if user is HR admin or super admin
  IF current_user_role NOT IN ('hr_admin', 'super_admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Permission denied: Only HR admins can delete users'
    );
  END IF;
  
  -- Prevent deleting yourself
  IF current_user_id = user_id_to_delete THEN
    RETURN json_build_object(
      'success', false,
      'error', 'You cannot delete your own account'
    );
  END IF;
  
  -- Get user email for audit log
  SELECT email INTO user_email
  FROM users_profile
  WHERE id = user_id_to_delete;
  
  IF user_email IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User not found'
    );
  END IF;
  
  -- Delete related records (in order to respect foreign keys)
  
  -- 1. First handle audit logs to avoid foreign key issues
  BEGIN
    -- Try to set user_id to NULL to preserve audit history
    UPDATE audit_logs SET user_id = NULL WHERE user_id = user_id_to_delete;
  EXCEPTION
    WHEN OTHERS THEN
      -- If update fails, try to delete
      BEGIN
        DELETE FROM audit_logs WHERE user_id = user_id_to_delete;
      EXCEPTION
        WHEN OTHERS THEN
          -- Continue anyway
          NULL;
      END;
  END;
  
  -- 2. Delete leave requests
  DELETE FROM leave_requests WHERE user_id = user_id_to_delete;
  
  -- 3. Delete leave balances
  DELETE FROM leave_balances WHERE user_id = user_id_to_delete;
  
  -- 4. Delete documents (if table exists)
  BEGIN
    DELETE FROM hr_documents WHERE uploaded_by = user_id_to_delete;
    DELETE FROM hr_documents WHERE employee_id = user_id_to_delete;
  EXCEPTION
    WHEN undefined_table THEN
      -- Table doesn't exist yet, continue
      NULL;
  END;
  
  -- 5. Delete from users_profile
  DELETE FROM users_profile WHERE id = user_id_to_delete;
  
  -- 6. Delete from auth.users
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
  RETURN json_build_object(
    'success', true,
    'message', 'User deleted successfully'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_admin(UUID) TO authenticated;

COMMENT ON FUNCTION delete_user_admin IS 'Deletes a user and all associated data. Only HR admins can execute this function.';
