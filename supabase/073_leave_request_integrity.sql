-- Migration 073: Leave request integrity
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Self-approval hole. 002 created policy "users_update_own_pending_requests"
--    (USING own pending row, WITH CHECK only auth.uid() = user_id). 003 added a
--    stricter policy under a DIFFERENT name and never dropped 002's. Policies are
--    OR'ed, so an employee could set their own request to 'approved' via the API.
--
-- 2. total_days came from the browser. The server now computes it from the
--    dates (weekdays minus public holidays, same rule as calculate_working_days),
--    so the balance charged always matches the dates requested. This also fixes
--    the form counting calendar days when no public holidays are configured.
--
-- 3. Editing the dates of a pending / HOD-approved request now re-charges the
--    pending balance (previously only status changes touched balances).
--
-- Existing rows are not recomputed. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Employee update policy ────────────────────────────────────────────────

DROP POLICY IF EXISTS "users_update_own_pending_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "users_update_own_pending" ON public.leave_requests;

CREATE POLICY "users_update_own_pending" ON public.leave_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('pending', 'cancelled'));

-- ─── 2. Server-computed total_days ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_leave_total_days()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.total_days := calculate_working_days(NEW.start_date, NEW.end_date);
  IF NEW.total_days <= 0 THEN
    RAISE EXCEPTION 'The selected dates (% to %) contain no working days', NEW.start_date, NEW.end_date
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_leave_total_days ON public.leave_requests;
CREATE TRIGGER trg_set_leave_total_days
  BEFORE INSERT OR UPDATE OF start_date, end_date, total_days ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_leave_total_days();

-- ─── 3. Re-charge pending balance when an open request's days change ─────────
-- Named trg_r… so it fires before trg_update_leave_balance (AFTER triggers run
-- alphabetically): if one UPDATE both edits dates and approves, pending is
-- corrected to the new day count first, then moved to used.

CREATE OR REPLACE FUNCTION public.rebalance_pending_on_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('pending', 'hod_approved')
     AND (NEW.total_days IS DISTINCT FROM OLD.total_days
          OR EXTRACT(YEAR FROM NEW.start_date) <> EXTRACT(YEAR FROM OLD.start_date))
  THEN
    UPDATE leave_balances
    SET pending_days = GREATEST(pending_days - OLD.total_days, 0), updated_at = NOW()
    WHERE user_id = OLD.user_id AND leave_type_id = OLD.leave_type_id
      AND year = EXTRACT(YEAR FROM OLD.start_date);

    UPDATE leave_balances
    SET pending_days = pending_days + NEW.total_days, updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rebalance_pending_on_edit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rebalance_pending_on_edit ON public.leave_requests;
CREATE TRIGGER trg_rebalance_pending_on_edit
  AFTER UPDATE OF start_date, end_date, total_days ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.rebalance_pending_on_edit();

COMMIT;
