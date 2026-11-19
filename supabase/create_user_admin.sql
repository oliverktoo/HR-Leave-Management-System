-- Function to create a new user (admin only)
-- This function handles both auth.users and users_profile creation

DROP FUNCTION IF EXISTS create_user_admin(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION create_user_admin(
  p_email TEXT,
  p_password TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_role TEXT DEFAULT 'employee',
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_role TEXT;
  new_user_id UUID;
  employee_id TEXT;
  email_exists BOOLEAN;
BEGIN
  -- Check if current user is HR admin or super admin
  SELECT role INTO current_user_role
  FROM users_profile
  WHERE id = auth.uid();
  
  IF current_user_role NOT IN ('hr_admin', 'super_admin') THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Permission denied: Only HR admins can create users'
    );
  END IF;
  
  -- Check if email already exists
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = p_email
  ) INTO email_exists;
  
  IF email_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'A user with this email already exists'
    );
  END IF;
  
  -- Generate employee ID
  employee_id := 'FKF' || LPAD((EXTRACT(EPOCH FROM NOW())::BIGINT % 1000000)::TEXT, 6, '0');
  
  -- Create user in auth.users
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
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    json_build_object('provider', 'email', 'providers', array['email'])::jsonb,
    json_build_object('first_name', p_first_name, 'last_name', p_last_name)::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  )
  RETURNING id INTO new_user_id;
  
  -- Create user profile
  INSERT INTO users_profile (
    id,
    employee_id,
    email,
    first_name,
    last_name,
    phone,
    department_id,
    role,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    employee_id,
    p_email,
    p_first_name,
    p_last_name,
    p_phone,
    p_department_id,
    p_role,
    p_is_active,
    NOW(),
    NOW()
  );
  
  RETURN json_build_object(
    'success', true,
    'user_id', new_user_id,
    'message', 'User created successfully'
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
GRANT EXECUTE ON FUNCTION create_user_admin(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION create_user_admin IS 'Creates a new user in both auth.users and users_profile. Only HR admins can execute this function.';
