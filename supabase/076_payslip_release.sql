-- Migration 076: Payslip release
-- ─────────────────────────────────────────────────────────────────────────────
-- Before: staff could not see payslips at all (My Payslips loads payroll_runs,
-- which only HR/finance/CEO/auditor may read), yet payroll_lines_self let any
-- employee read their own line through the API while a run was still a draft.
-- payroll_runs.payslips_distributed_at (057) existed but nothing used it.
--
-- After:
--   • HR admin / super admin release (or withdraw) a run's payslips once the run
--     is approved or paid: set_payslips_released(run_id, true|false).
--   • Staff see their own payslip only for released runs — enforced here, not
--     just in the app. They never get read access to payroll_runs (which holds
--     company-wide totals); my_payslip_runs() returns just their own periods.
--   • First release notifies each employee on the run ("Your payslip is ready").
--   • Release/withdraw is recorded in payroll_audit_log.
-- Existing runs (incl. Jul–Sep 2026) start UNRELEASED.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS payslips_released_by uuid REFERENCES public.users_profile(id);

-- ─── Helpers (SECURITY DEFINER: avoid policy recursion runs ↔ lines) ──────────

CREATE OR REPLACE FUNCTION public.payroll_run_is_released(p_run_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payroll_runs
    WHERE id = p_run_id AND payslips_distributed_at IS NOT NULL AND status IN ('approved', 'paid')
  );
$$;
REVOKE ALL ON FUNCTION public.payroll_run_is_released(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payroll_run_is_released(uuid) TO authenticated;

-- ─── Staff: own lines only once released ──────────────────────────────────────

DROP POLICY IF EXISTS payroll_lines_self ON public.payroll_lines;
CREATE POLICY payroll_lines_self ON public.payroll_lines FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.payroll_run_is_released(run_id));

-- ─── Staff: list of their released payslip periods (no company totals) ───────

CREATE OR REPLACE FUNCTION public.my_payslip_runs()
RETURNS TABLE (id uuid, pay_period_year int, pay_period_month int, status text,
               working_days_in_period int, payslips_distributed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id, r.pay_period_year, r.pay_period_month, r.status,
         r.working_days_in_period, r.payslips_distributed_at
  FROM payroll_runs r
  WHERE r.payslips_distributed_at IS NOT NULL
    AND r.status IN ('approved', 'paid')
    AND EXISTS (SELECT 1 FROM payroll_lines l WHERE l.run_id = r.id AND l.user_id = auth.uid())
  ORDER BY r.pay_period_year DESC, r.pay_period_month DESC;
$$;
REVOKE ALL ON FUNCTION public.my_payslip_runs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_payslip_runs() TO authenticated;

-- ─── HR: release / withdraw ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_payslips_released(p_run_id uuid, p_release boolean)
RETURNS public.payroll_runs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run     payroll_runs%ROWTYPE;
  v_period  text;
BEGIN
  IF NOT public.auth_has_role(ARRAY['hr_admin', 'super_admin']) THEN
    RAISE EXCEPTION 'Only HR admin or super admin can release payslips' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_run FROM payroll_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll run not found';
  END IF;

  IF p_release THEN
    IF v_run.status NOT IN ('approved', 'paid') THEN
      RAISE EXCEPTION 'Payslips can only be released once the run is approved or paid (current status: %)', v_run.status;
    END IF;
    IF v_run.payslips_distributed_at IS NOT NULL THEN
      RETURN v_run;   -- already released
    END IF;

    UPDATE payroll_runs
    SET payslips_distributed_at = now(), payslips_released_by = auth.uid(), updated_at = now()
    WHERE id = p_run_id RETURNING * INTO v_run;

    -- Notify staff the first time this run is released
    IF NOT EXISTS (SELECT 1 FROM payroll_audit_log WHERE run_id = p_run_id AND action = 'payslips_released') THEN
      v_period := trim(to_char(make_date(v_run.pay_period_year, v_run.pay_period_month, 1), 'FMMonth YYYY'));
      INSERT INTO notifications (user_id, title, message, type, is_read)
      SELECT DISTINCT l.user_id, 'Payslip ready',
             'Your payslip for ' || v_period || ' is ready to view under My Payslips.', 'payslip', false
      FROM payroll_lines l WHERE l.run_id = p_run_id;
    END IF;

    INSERT INTO payroll_audit_log (run_id, actor_id, action, new_values)
    VALUES (p_run_id, auth.uid(), 'payslips_released', jsonb_build_object('released_at', v_run.payslips_distributed_at));
  ELSE
    IF v_run.payslips_distributed_at IS NULL THEN
      RETURN v_run;   -- not released
    END IF;

    UPDATE payroll_runs
    SET payslips_distributed_at = NULL, payslips_released_by = NULL, updated_at = now()
    WHERE id = p_run_id RETURNING * INTO v_run;

    INSERT INTO payroll_audit_log (run_id, actor_id, action)
    VALUES (p_run_id, auth.uid(), 'payslips_withdrawn');
  END IF;

  RETURN v_run;
END;
$$;
REVOKE ALL ON FUNCTION public.set_payslips_released(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_payslips_released(uuid, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
