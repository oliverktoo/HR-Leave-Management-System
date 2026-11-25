-- Migration 082: Remove an employee from a draft payroll run
-- ─────────────────────────────────────────────────────────────────────────────
-- remove_payroll_line(line, reason, take_off_payroll)
--   • HR admin / super admin only; the run must still be a draft.
--   • Deletes the line (its arrears / final-dues records go with it) and
--     records an exclusion so Recompute does not add the employee back.
--   • take_off_payroll = true also switches payroll off for the employee, so
--     later months leave them out too.
--   • Audited in payroll_audit_log, with the removed line's figures.
-- restore_payroll_employee(run, user) undoes the exclusion; the employee comes
-- back on the next Recompute (payroll must be on for them).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payroll_run_exclusions (
  run_id       uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  excluded_by  uuid REFERENCES public.users_profile(id),
  excluded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, user_id)
);

ALTER TABLE public.payroll_run_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_run_exclusions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.payroll_run_exclusions FROM authenticated;  -- functions only
GRANT SELECT ON public.payroll_run_exclusions TO authenticated;

DROP POLICY IF EXISTS payroll_run_exclusions_read ON public.payroll_run_exclusions;
CREATE POLICY payroll_run_exclusions_read ON public.payroll_run_exclusions FOR SELECT TO authenticated
  USING (public.auth_has_role(ARRAY['hr_admin','super_admin','finance','ceo']));

-- ─── remove ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_payroll_line(
  p_line_id uuid, p_reason text, p_take_off_payroll boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line payroll_lines%ROWTYPE;
  v_status text;
BEGIN
  IF NOT public.auth_has_role(ARRAY['hr_admin','super_admin']) THEN
    RAISE EXCEPTION 'Only HR admin or super admin can remove an employee from a payroll run';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for removing the employee from this run';
  END IF;

  SELECT * INTO v_line FROM payroll_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll line not found'; END IF;

  SELECT status INTO v_status FROM payroll_runs WHERE id = v_line.run_id FOR UPDATE;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Employees can only be removed while the run is a draft (this run is %)', v_status;
  END IF;

  INSERT INTO payroll_run_exclusions (run_id, user_id, reason, excluded_by)
  VALUES (v_line.run_id, v_line.user_id, trim(p_reason), auth.uid())
  ON CONFLICT (run_id, user_id) DO UPDATE
    SET reason = EXCLUDED.reason, excluded_by = EXCLUDED.excluded_by, excluded_at = now();

  -- line_id left empty: the line is about to be deleted
  INSERT INTO payroll_audit_log (run_id, actor_id, action, old_values, new_values, notes)
  VALUES (v_line.run_id, auth.uid(), 'line_removed', to_jsonb(v_line),
          jsonb_build_object('user_id', v_line.user_id, 'take_off_payroll', p_take_off_payroll),
          trim(p_reason));

  DELETE FROM payroll_lines WHERE id = p_line_id;

  IF p_take_off_payroll THEN
    UPDATE users_profile SET payroll_active = false WHERE id = v_line.user_id;
  END IF;
END;
$$;

-- ─── restore ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_payroll_employee(p_run_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.auth_has_role(ARRAY['hr_admin','super_admin']) THEN
    RAISE EXCEPTION 'Only HR admin or super admin can add an employee back to a payroll run';
  END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Employees can only be added back while the run is a draft';
  END IF;

  DELETE FROM payroll_run_exclusions WHERE run_id = p_run_id AND user_id = p_user_id;
  IF FOUND THEN
    INSERT INTO payroll_audit_log (run_id, actor_id, action, new_values)
    VALUES (p_run_id, auth.uid(), 'line_restored', jsonb_build_object('user_id', p_user_id));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_payroll_line(uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_payroll_employee(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_payroll_line(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_payroll_employee(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
