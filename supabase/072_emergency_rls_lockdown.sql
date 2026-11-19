-- Migration 072: EMERGENCY — lock down tables exposed to the public internet
-- ─────────────────────────────────────────────────────────────────────────────
-- Found 2026-11-19: with only the public anon key (shipped in the web app),
-- anyone could read — and update — these tables:
--   users_profile   (salaries, bank accounts, KRA/NSSF/SHA numbers, face data, roles)
--   audit_logs      (full before/after copies of changed rows)
--   email_queue, email_templates
-- Cause: the one-off script FINAL_RLS_FIX.sql ran
--   ALTER TABLE users_profile DISABLE ROW LEVEL SECURITY;
-- and audit_logs / email_* never had RLS enabled.
--
-- After this migration:
--   • anon (not signed in) has no access to any of these tables.
--   • users_profile: signed-in staff can read profiles (unchanged for logged-in
--     users — see FOLLOW-UP below). Staff can update only their own photo /
--     face registration / push token. HR admin + super admin can change
--     anything. Fleet managers can change driver/licence fields only.
--     Nobody else can change roles, salaries, bank or statutory details.
--   • audit_logs: readable by HR admin, super admin and auditor only;
--     rows can no longer be edited or deleted through the API.
--   • email_queue / email_templates: server-side only.
--
-- FOLLOW-UP (not done here, needs app changes): every signed-in employee can
-- still READ colleagues' salary, bank and statutory fields, because ~40 screens
-- select from users_profile directly. Fix by moving those columns behind an
-- HR-only table/view.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Role helper (SECURITY DEFINER so policies don't recurse) ──────────────

CREATE OR REPLACE FUNCTION public.auth_has_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid()
      AND (role = ANY (p_roles) OR secondary_role = ANY (p_roles))
  );
$$;

REVOKE ALL ON FUNCTION public.auth_has_role(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_has_role(text[]) TO authenticated;

-- ─── 2. users_profile ─────────────────────────────────────────────────────────

-- Start from a known state: remove every existing policy on the table.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'users_profile'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.users_profile', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users_profile FROM anon;

CREATE POLICY profile_read_signed_in ON public.users_profile
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY profile_update_self ON public.users_profile
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profile_update_staff_admins ON public.users_profile
  FOR UPDATE TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin', 'super_admin', 'fleet_manager']))
  WITH CHECK (public.auth_has_role(ARRAY['hr_admin', 'super_admin', 'fleet_manager']));

CREATE POLICY profile_insert_hr ON public.users_profile
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_has_role(ARRAY['hr_admin', 'super_admin']));

CREATE POLICY profile_delete_hr ON public.users_profile
  FOR DELETE TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin', 'super_admin']));

-- Column guard: RLS decides which ROWS a user may update; this decides which
-- COLUMNS. Only applies to direct API calls (current_user = authenticated);
-- SECURITY DEFINER functions run as their owner and do their own checks.
CREATE OR REPLACE FUNCTION public.guard_users_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed  text[] := ARRAY['updated_at'];
  v_changed  text[];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF public.auth_has_role(ARRAY['hr_admin', 'super_admin']) THEN
    RETURN NEW;
  END IF;

  IF NEW.id = auth.uid() THEN
    -- What staff legitimately change on their own record in the app
    v_allowed := v_allowed || ARRAY['profile_photo_url', 'face_descriptor', 'push_token', 'avatar_url'];
  END IF;

  IF public.auth_has_role(ARRAY['fleet_manager']) THEN
    v_allowed := v_allowed || ARRAY[
      'is_driver', 'driver_license_number', 'driver_license_class', 'driver_license_expiry',
      'license_number', 'license_type', 'license_issue_date', 'license_expiry_date',
      'license_issuing_authority', 'license_status', 'license_document_url',
      'license_last_verified', 'license_notes'];
  END IF;

  SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
  FROM jsonb_each(to_jsonb(NEW)) n
  JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
  WHERE n.value IS DISTINCT FROM o.value
    AND NOT (n.key = ANY (v_allowed));

  IF v_changed IS NOT NULL THEN
    RAISE EXCEPTION 'Not allowed to change: %', array_to_string(v_changed, ', ')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_guard_users_profile_columns ON public.users_profile;
-- "zz_" so it runs after other BEFORE UPDATE triggers (e.g. updated_at)
CREATE TRIGGER zz_guard_users_profile_columns
  BEFORE UPDATE ON public.users_profile
  FOR EACH ROW EXECUTE FUNCTION public.guard_users_profile_columns();

-- ─── 3. audit_logs ────────────────────────────────────────────────────────────

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'audit_logs'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.audit_logs', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM authenticated;

CREATE POLICY audit_read_oversight ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin', 'super_admin', 'auditor']));

-- Rows are written by the log_audit() trigger. Allow the insert so leave /
-- profile saves can never fail on it, whether or not the trigger bypasses RLS.
CREATE POLICY audit_insert_trigger ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ─── 4. email_queue / email_templates (server-side only) ──────────────────────

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_queue', 'email_templates'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
