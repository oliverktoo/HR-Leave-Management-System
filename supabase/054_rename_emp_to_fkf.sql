-- Migration 054: Rename employee_id prefix from EMP → FKF
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces all auto-generated employee IDs that start with 'EMP' with 'FKF'.
-- The trigger in migration 003 and the create_user_admin RPC have both been
-- updated to generate FKF going forward; this back-fills existing records.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.users_profile
SET employee_id = 'FKF' || SUBSTRING(employee_id FROM 4)
WHERE employee_id LIKE 'EMP%';

-- ─── Also fix the trigger function in-place so it survives a schema reload ───

CREATE OR REPLACE FUNCTION public.update_full_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
    NEW.full_name = NEW.first_name || ' ' || NEW.last_name;
  END IF;

  -- Auto-generate employee_id if not provided
  IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
    NEW.employee_id = 'FKF' || TO_CHAR(COALESCE(NEW.created_at, NOW()), 'YYYYMMDD') || '-' ||
                     LPAD(EXTRACT(EPOCH FROM COALESCE(NEW.created_at, NOW()))::INTEGER % 10000, 4, '0');
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
