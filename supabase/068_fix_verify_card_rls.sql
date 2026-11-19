-- 068: Fix verify_staff_card so it reliably bypasses RLS for unauthenticated QR scans.
--
-- Root cause: SECURITY DEFINER only bypasses RLS when the function owner is a
-- superuser (postgres). If it was created under a different role the users_profile
-- and staff_card_settings queries silently return 0 rows → "found: false" on every scan.
--
-- Fix: recreate, force owner = postgres, use SET LOCAL row_security = off inside
-- the body as belt-and-suspenders, and fire NOTIFY to reload PostgREST schema cache.

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
  v_row       record;
  v_override  jsonb;
  v_card_gen  int;
  v_is_valid  boolean;
BEGIN
  -- Explicitly disable RLS for this call (postgres superuser can always do this)
  SET LOCAL row_security = off;

  -- Fetch employee — bypasses users_profile RLS via the above
  SELECT up.employee_id, up.first_name, up.last_name,
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

  -- Card override settings (staff_card_settings also has RLS — bypassed above)
  SELECT settings->'card_overrides'->p_employee_id
  INTO   v_override
  FROM   staff_card_settings
  LIMIT  1;

  v_card_gen := COALESCE((v_override->>'card_generation')::int, 1);
  v_is_valid := COALESCE((v_override->>'is_valid')::boolean,    true);

  RETURN jsonb_build_object(
    'found',               true,
    'first_name',          v_row.first_name,
    'last_name',           v_row.last_name,
    'employee_id',         v_row.employee_id,
    'role',                v_row.role,
    'job_title',           v_row.job_title,
    'is_active',           v_row.is_active,
    'profile_photo_url',   v_row.profile_photo_url,
    'department',          v_row.department_name,
    'card_valid',          v_is_valid AND (p_generation = v_card_gen),
    'generation_mismatch', p_generation <> v_card_gen,
    'invalidated',         NOT v_is_valid
  );
END;
$$;

-- Ensure function is owned by postgres (superuser) so SECURITY DEFINER bypasses RLS
ALTER FUNCTION public.verify_staff_card(text, int) OWNER TO postgres;

-- Public access — no auth required for QR scanning
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO authenticated;

-- Force PostgREST to pick up the function immediately (no dashboard reload needed)
NOTIFY pgrst, 'reload schema';
