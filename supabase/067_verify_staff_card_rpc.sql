-- Public card verification function — bypasses RLS so unauthenticated scans work.
-- Returns basic employee info + card validity (generation check + is_valid flag).

CREATE OR REPLACE FUNCTION public.verify_staff_card(
  p_employee_id text,
  p_generation  int DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row          record;
  v_dept_name    text;
  v_override     jsonb;
  v_card_gen     int;
  v_is_valid     boolean;
BEGIN
  -- Basic employee info (bypasses RLS via SECURITY DEFINER)
  SELECT up.id, up.employee_id, up.first_name, up.last_name,
         up.role, up.job_title, up.is_active, up.profile_photo_url,
         d.name AS department_name
  INTO   v_row
  FROM   users_profile up
  LEFT JOIN departments d ON d.id = up.department_id
  WHERE  up.employee_id = p_employee_id
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Card override settings
  SELECT settings->'card_overrides'->p_employee_id
  INTO   v_override
  FROM   staff_card_settings
  LIMIT  1;

  v_card_gen := COALESCE((v_override->>'card_generation')::int, 1);
  v_is_valid := COALESCE((v_override->>'is_valid')::boolean, true);

  RETURN jsonb_build_object(
    'found',              true,
    'first_name',         v_row.first_name,
    'last_name',          v_row.last_name,
    'employee_id',        v_row.employee_id,
    'role',               v_row.role,
    'job_title',          v_row.job_title,
    'is_active',          v_row.is_active,
    'profile_photo_url',  v_row.profile_photo_url,
    'department',         v_row.department_name,
    'card_valid',         v_is_valid AND (p_generation = v_card_gen),
    'generation_mismatch',p_generation <> v_card_gen,
    'invalidated',        NOT v_is_valid
  );
END;
$$;

-- Allow public (unauthenticated) calls
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO authenticated;
