-- Function to allow HR Admin and Super Admin to delete users
-- This handles both the profile and cascading deletes properly

CREATE OR REPLACE FUNCTION delete_user_admin(user_id_to_delete UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER -- This runs with the privileges of the function creator
AS $$
DECLARE
  current_user_role TEXT;
  user_email TEXT;
  result jsonb;
BEGIN
  -- Get the current user's role
  SELECT role INTO current_user_role
  FROM users_profile
  WHERE id = auth.uid();

  -- Check if current user is HR Admin or Super Admin
  IF current_user_role NOT IN ('hr_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Permission denied. Only HR Admin or Super Admin can delete users.';
  END IF;

  -- Prevent self-deletion
  IF user_id_to_delete = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account.';
  END IF;

  -- Get user email for logging
  SELECT email INTO user_email
  FROM users_profile
  WHERE id = user_id_to_delete;

  IF user_email IS NULL THEN
    RAISE EXCEPTION 'User not found.';
  END IF;

  -- Delete related records in the correct order to avoid foreign key violations
  
  -- 1. Delete audit logs where this user is referenced
  DELETE FROM audit_logs WHERE user_id = user_id_to_delete;
  
  -- 2. Delete notifications for this user
  DELETE FROM notifications WHERE user_id = user_id_to_delete;
  
  -- 3. Delete leave request history where user performed actions
  DELETE FROM leave_request_history WHERE performed_by = user_id_to_delete;
  
  -- 4. Delete leave request history for this user's requests (via leave_requests cascade)
  DELETE FROM leave_request_history 
  WHERE leave_request_id IN (
    SELECT id FROM leave_requests WHERE user_id = user_id_to_delete
  );
  
  -- 5. Delete leave requests (after history is cleaned up)
  DELETE FROM leave_requests WHERE user_id = user_id_to_delete;
  
  -- 6. Delete leave requests where this user was the reviewer
  UPDATE leave_requests SET reviewed_by = NULL WHERE reviewed_by = user_id_to_delete;
  
  -- 7. Delete leave balances
  DELETE FROM leave_balances WHERE user_id = user_id_to_delete;
  
  -- 8. Update departments if this user was head of department
  UPDATE departments SET head_of_department_id = NULL WHERE head_of_department_id = user_id_to_delete;
  
  -- 9. Finally, delete the user profile
  DELETE FROM users_profile WHERE id = user_id_to_delete;

  -- Return success (audit logging removed to avoid FK constraint issues)
  result := jsonb_build_object(
    'success', true,
    'message', 'User deleted successfully',
    'deleted_email', user_email
  );

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    result := jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_user_admin(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION delete_user_admin IS 'Allows HR Admin and Super Admin to delete users with proper authorization checks';
