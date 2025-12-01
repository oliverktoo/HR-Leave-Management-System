-- Manual SQL to delete user oliverktoo@gmail.com
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  user_id_to_delete UUID;
BEGIN
  -- Get the user ID
  SELECT id INTO user_id_to_delete
  FROM users_profile
  WHERE email = 'oliverktoo@gmail.com';

  IF user_id_to_delete IS NULL THEN
    RAISE NOTICE 'User not found';
    RETURN;
  END IF;

  RAISE NOTICE 'Deleting user: %', user_id_to_delete;

  -- Disable only the audit trigger on users_profile
  ALTER TABLE users_profile DISABLE TRIGGER audit_users_profile;
  RAISE NOTICE 'Disabled audit trigger';

  -- 1. Delete audit logs where this user is referenced
  DELETE FROM audit_logs WHERE user_id = user_id_to_delete;
  RAISE NOTICE 'Deleted audit logs';
  
  -- 2. Delete notifications for this user
  DELETE FROM notifications WHERE user_id = user_id_to_delete;
  RAISE NOTICE 'Deleted notifications';
  
  -- 3. Delete leave request history where user performed actions
  DELETE FROM leave_request_history WHERE performed_by = user_id_to_delete;
  RAISE NOTICE 'Deleted leave request history (performed by)';
  
  -- 4. Delete leave request history for this user's requests
  DELETE FROM leave_request_history 
  WHERE leave_request_id IN (
    SELECT id FROM leave_requests WHERE user_id = user_id_to_delete
  );
  RAISE NOTICE 'Deleted leave request history (user requests)';
  
  -- 5. Delete leave requests
  DELETE FROM leave_requests WHERE user_id = user_id_to_delete;
  RAISE NOTICE 'Deleted leave requests';
  
  -- 6. Update leave requests where this user was the reviewer
  UPDATE leave_requests SET reviewed_by = NULL WHERE reviewed_by = user_id_to_delete;
  RAISE NOTICE 'Updated leave requests (reviewer)';
  
  -- 7. Delete leave balances
  DELETE FROM leave_balances WHERE user_id = user_id_to_delete;
  RAISE NOTICE 'Deleted leave balances';
  
  -- 8. Update departments if this user was head of department
  UPDATE departments SET head_of_department_id = NULL WHERE head_of_department_id = user_id_to_delete;
  RAISE NOTICE 'Updated departments';
  
  -- 9. Finally, delete the user profile
  DELETE FROM users_profile WHERE id = user_id_to_delete;
  RAISE NOTICE 'Deleted user profile';

  -- Re-enable the audit trigger
  ALTER TABLE users_profile ENABLE TRIGGER audit_users_profile;
  RAISE NOTICE 'Re-enabled audit trigger';

  RAISE NOTICE 'User deleted successfully!';
END $$;
