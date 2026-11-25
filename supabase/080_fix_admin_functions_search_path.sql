-- Migration 080: Fix "function gen_salt(unknown) does not exist" when creating
-- users or resetting passwords
-- ─────────────────────────────────────────────────────────────────────────────
-- 074 put each admin function behind a guard wrapper with
-- SET search_path = public, then calls the original <name>_unguarded. The
-- originals have no search_path of their own, so they ran with the wrapper's
-- (public only) and could no longer find pgcrypto's gen_salt()/crypt(), which
-- Supabase installs in the "extensions" schema. Affected: create_user_admin,
-- admin_reset_user_password, reset_employee_password (and any other wrapped
-- function using extension functions).
--
-- Fix: give every *_unguarded function its own search_path that includes
-- extensions. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

DO $do$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE '%\_unguarded'
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
                   v_fn.proname, v_fn.ident);
  END LOOP;
END
$do$;
