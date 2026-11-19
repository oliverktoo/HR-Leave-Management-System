-- 069: Public staff card lookup table — eliminates RLS dependency for card verification.
--
-- Root cause: verify_staff_card queries users_profile which has RLS. Even with
-- SECURITY DEFINER + OWNER TO postgres, Supabase's managed postgres may not
-- bypass RLS reliably for anon callers.
--
-- Solution: maintain a separate staff_card_lookup table that holds only the
-- card-safe public fields, with no RLS. A trigger keeps it in sync automatically.

-- ── 1. Lookup table (no RLS — only public card data stored here) ───────────────
CREATE TABLE IF NOT EXISTS public.staff_card_lookup (
  employee_id       TEXT PRIMARY KEY,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  role              TEXT,
  job_title         TEXT,
  profile_photo_url TEXT,
  department_name   TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Allow anyone to read (this table holds nothing sensitive — same data on the physical card)
GRANT SELECT ON public.staff_card_lookup TO anon, authenticated;

-- ── 2. Sync trigger function ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_staff_card_lookup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM staff_card_lookup WHERE employee_id = OLD.employee_id;
    RETURN OLD;
  END IF;

  INSERT INTO staff_card_lookup (
    employee_id, first_name, last_name, role, job_title,
    profile_photo_url, is_active, updated_at
  )
  SELECT
    NEW.employee_id, NEW.first_name, NEW.last_name, NEW.role, NEW.job_title,
    NEW.profile_photo_url, NEW.is_active, NOW()
  ON CONFLICT (employee_id) DO UPDATE SET
    first_name        = EXCLUDED.first_name,
    last_name         = EXCLUDED.last_name,
    role              = EXCLUDED.role,
    job_title         = EXCLUDED.job_title,
    profile_photo_url = EXCLUDED.profile_photo_url,
    is_active         = EXCLUDED.is_active,
    updated_at        = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_card_lookup ON public.users_profile;
CREATE TRIGGER trg_sync_card_lookup
AFTER INSERT OR UPDATE OR DELETE ON public.users_profile
FOR EACH ROW EXECUTE FUNCTION public.sync_staff_card_lookup();

-- ── 3. Populate lookup from existing staff (run once) ─────────────────────────
INSERT INTO public.staff_card_lookup (
  employee_id, first_name, last_name, role, job_title,
  profile_photo_url, is_active
)
SELECT
  up.employee_id, up.first_name, up.last_name, up.role, up.job_title,
  up.profile_photo_url, up.is_active
FROM public.users_profile up
WHERE up.employee_id IS NOT NULL
ON CONFLICT (employee_id) DO UPDATE SET
  first_name        = EXCLUDED.first_name,
  last_name         = EXCLUDED.last_name,
  role              = EXCLUDED.role,
  job_title         = EXCLUDED.job_title,
  profile_photo_url = EXCLUDED.profile_photo_url,
  is_active         = EXCLUDED.is_active,
  updated_at        = NOW();

-- Also update department_name for existing rows
UPDATE public.staff_card_lookup scl
SET department_name = d.name
FROM public.users_profile up
JOIN public.departments d ON d.id = up.department_id
WHERE up.employee_id = scl.employee_id;

-- ── 4. Rewrite verify_staff_card to use the lookup table ──────────────────────
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
  -- Query the public lookup table — no RLS, no bypass needed
  SELECT employee_id, first_name, last_name, role, job_title,
         profile_photo_url, department_name, is_active
  INTO   v_row
  FROM   staff_card_lookup
  WHERE  employee_id = p_employee_id
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Card overrides still come from staff_card_settings (SECURITY DEFINER bypasses its RLS)
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

ALTER FUNCTION public.verify_staff_card(text, int) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_staff_card(text, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
