-- Delete user oliverktoo@gmail.com

-- Get the user ID first
DO $$
DECLARE
  user_id_to_delete UUID;
BEGIN
  -- Get user ID
  SELECT id INTO user_id_to_delete
  FROM auth.users
  WHERE email = 'oliverktoo@gmail.com';
  
  IF user_id_to_delete IS NOT NULL THEN
    -- Delete from leave requests
    DELETE FROM leave_requests WHERE user_id = user_id_to_delete;
    
    -- Delete from leave balances
    DELETE FROM leave_balances WHERE user_id = user_id_to_delete;
    
    -- Update audit logs to NULL (preserve history)
    UPDATE audit_logs SET user_id = NULL WHERE user_id = user_id_to_delete;
    
    -- Delete from users_profile
    DELETE FROM users_profile WHERE id = user_id_to_delete;
    
    -- Delete from auth.users
    DELETE FROM auth.users WHERE id = user_id_to_delete;
    
    RAISE NOTICE 'User oliverktoo@gmail.com deleted successfully';
  ELSE
    RAISE NOTICE 'User oliverktoo@gmail.com not found';
  END IF;
END $$;
