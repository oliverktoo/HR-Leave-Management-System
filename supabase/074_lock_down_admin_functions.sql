-- Migration 074: CRITICAL — lock down admin RPCs and anonymous function access
-- ─────────────────────────────────────────────────────────────────────────────
-- Found 2026-11-19 (live probe): these SECURITY DEFINER functions are callable
-- by anyone holding the public anon key, and authorise with
--     SELECT role INTO v_role FROM users_profile WHERE id = auth.uid();
--     IF v_role NOT IN ('hr_admin','super_admin') THEN <deny> END IF;
-- For a caller with no profile (anonymous, or a self-signed-up account) v_role
-- is NULL, `NULL NOT IN (...)` is NULL, the IF is skipped and the action runs:
--     admin_reset_user_password   → set any user's password  (account takeover)
--     reset_employee_password     → same, by email
--     admin_update_user_email     → change any user's login email
--     create_user_admin           → create an account with any role
--     delete_user_admin           → delete any user and their records
--
-- Fix without depending on the function bodies (create_user_admin's live body
-- is not in the repo): rename each original to <name>_unguarded, make it
-- uncallable from the API, and put a wrapper with the original name and
-- signature in front of it that requires HR admin / super admin
-- (public.auth_has_role, from 072) before delegating. The original still sees
-- the caller's auth.uid(), so its own logic is unchanged.
--
-- Also:
--   • Revokes anonymous EXECUTE on every other public function except the
--     public staff-card check (verify_staff_card). They are all used only by
--     signed-in screens, cron, edge functions or triggers.
--   • Makes cron/edge-only functions (auto-checkout, email senders) server-only.
--   • New functions no longer become anon-callable by default.
--   • Turns on RLS for compliance_alerts and vehicle_documents (they already
--     had fleet/admin policies, but RLS was off) and lets CEO/auditor read them.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Guard wrappers for the admin RPCs ─────────────────────────────────────

DO $do$
DECLARE
  v_name     text;
  v_fn       record;
  v_inner    text;
  v_args     text;
  v_body     text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'admin_reset_user_password', 'reset_employee_password', 'admin_update_user_email',
    'create_user_admin', 'delete_user_admin'
  ] LOOP
    v_inner := v_name || '_unguarded';

    FOR v_fn IN
      SELECT p.oid,
             pg_get_function_identity_arguments(p.oid) AS ident,
             pg_get_function_arguments(p.oid)          AS args_def,
             pg_get_function_result(p.oid)             AS result,
             coalesce(p.proargnames, ARRAY[]::text[])  AS argnames,
             p.pronargs                                AS nargs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      -- Already wrapped on a previous run?
      IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = v_inner
                   AND pg_get_function_identity_arguments(p.oid) = v_fn.ident) THEN
        CONTINUE;
      END IF;

      EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', v_name, v_fn.ident, v_inner);
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', v_inner, v_fn.ident);

      SELECT string_agg(quote_ident(a), ', ' ORDER BY i) INTO v_args
      FROM unnest(v_fn.argnames[1:v_fn.nargs]) WITH ORDINALITY AS t(a, i);
      v_args := coalesce(v_args, '');

      v_body := CASE
        WHEN v_fn.result = 'void' THEN
          format('PERFORM public.%I(%s); RETURN;', v_inner, v_args)
        WHEN v_fn.result LIKE 'SETOF %' OR v_fn.result LIKE 'TABLE(%' THEN
          format('RETURN QUERY SELECT * FROM public.%I(%s);', v_inner, v_args)
        ELSE
          format('RETURN public.%I(%s);', v_inner, v_args)
      END;

      EXECUTE format($f$
        CREATE FUNCTION public.%I(%s) RETURNS %s
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $w$
        BEGIN
          IF NOT public.auth_has_role(ARRAY['hr_admin', 'super_admin']) THEN
            RAISE EXCEPTION 'Only HR admin or super admin can do this' USING ERRCODE = '42501';
          END IF;
          %s
        END
        $w$ $f$, v_name, v_fn.args_def, v_fn.result, v_body);

      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_name, v_fn.ident);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', v_name, v_fn.ident);
    END LOOP;
  END LOOP;
END
$do$;

-- ─── 2. Server-only functions (cron, edge functions, triggers) ───────────────

DO $do$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('auto_checkout_absent_staff', 'auto_checkout_stale_presence',
                        'call_send_email_function', 'queue_email',
                        'send_leave_notification', 'send_leave_notification_v2')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', v_fn.proname, v_fn.ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', v_fn.proname, v_fn.ident);
  END LOOP;
END
$do$;

-- ─── 3. No anonymous access to any other function ────────────────────────────
-- verify_staff_card stays public: it powers the QR card check page.

DO $do$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'   -- skip extension-owned
    WHERE n.nspname = 'public'
      AND d.objid IS NULL
      AND p.prokind = 'f'
      AND p.proname <> 'verify_staff_card'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', v_fn.proname, v_fn.ident);
    -- Keep signed-in access unless section 2 made it server-only
    IF v_fn.proname NOT IN ('auto_checkout_absent_staff', 'auto_checkout_stale_presence',
                            'call_send_email_function', 'queue_email',
                            'send_leave_notification', 'send_leave_notification_v2')
       AND v_fn.proname NOT LIKE '%\_unguarded' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role', v_fn.proname, v_fn.ident);
    END IF;
  END LOOP;
END
$do$;

-- Future functions: not callable anonymously unless a migration grants it.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
  END IF;
END
$do$;

-- ─── 4. Compliance tables: RLS was off ────────────────────────────────────────

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_alerts', 'vehicle_documents'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_oversight', t);
      EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                       USING (public.auth_has_role(ARRAY['ceo', 'auditor', 'fleet_manager', 'hr_admin', 'super_admin']))$p$,
                     t || '_read_oversight', t);
    END IF;
  END LOOP;
END
$do$;

COMMIT;
