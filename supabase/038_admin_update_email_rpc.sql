-- Migration 038: RPC for HR admins to change a staff member's login email
-- Uses SECURITY DEFINER so it can write to auth.users without exposing the service key.

CREATE OR REPLACE FUNCTION admin_update_user_email(
  p_user_id  UUID,
  p_new_email TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_email_exists BOOLEAN;
BEGIN
  -- Only hr_admin / super_admin may call this
  SELECT role INTO v_caller_role
  FROM users_profile
  WHERE id = auth.uid();

  IF v_caller_role NOT IN ('hr_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Unauthorized: only hr_admin or super_admin can change user emails';
  END IF;

  -- Normalise
  p_new_email := lower(trim(p_new_email));

  -- Basic format check
  IF p_new_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid email address format';
  END IF;

  -- Ensure the new address is not already in use by another account
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE email = p_new_email
      AND id   <> p_user_id
  ) INTO v_email_exists;

  IF v_email_exists THEN
    RAISE EXCEPTION 'Email address is already in use by another account';
  END IF;

  -- Update auth.users (auto-confirm so they can log in immediately)
  UPDATE auth.users
  SET
    email               = p_new_email,
    email_confirmed_at  = NOW(),
    updated_at          = NOW()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found in auth.users';
  END IF;

  -- Keep users_profile in sync
  UPDATE users_profile
  SET email = p_new_email
  WHERE id = p_user_id;

END;
$$;

-- Lock down execution — only authenticated users (checked inside the function)
REVOKE EXECUTE ON FUNCTION admin_update_user_email(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_update_user_email(UUID, TEXT) TO authenticated;
