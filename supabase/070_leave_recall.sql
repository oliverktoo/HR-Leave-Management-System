-- Migration 070: Recall / cancel an already-approved leave request
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a 'recalled' status distinct from self-service 'cancelled'. HR/super_admin
-- can call staff back from approved leave (before it starts, or mid-leave — in
-- which case already-elapsed working days stay counted as used and only the
-- remaining days are restored to the balance).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. New columns on leave_requests ─────────────────────────────────────────

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS recalled_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recall_reason TEXT,
  ADD COLUMN IF NOT EXISTS recall_effective_date DATE,
  ADD COLUMN IF NOT EXISTS days_restored DECIMAL(5,1);

-- ─── 2. Extend status enum ─────────────────────────────────────────────────────

ALTER TABLE public.leave_requests DROP CONSTRAINT IF EXISTS chk_status;
ALTER TABLE public.leave_requests
  ADD CONSTRAINT chk_status
  CHECK (status IN ('pending', 'hod_approved', 'approved', 'rejected', 'cancelled', 'recalled'));

ALTER TABLE public.leave_request_history DROP CONSTRAINT IF EXISTS chk_action;
ALTER TABLE public.leave_request_history
  ADD CONSTRAINT chk_action
  CHECK (action IN ('submitted', 'pending', 'hod_approved', 'approved', 'rejected', 'cancelled', 'recalled'));

-- ─── 3. RPC: recall_leave_request ─────────────────────────────────────────────
-- SECURITY DEFINER — self-enforces the HR/super_admin check since it bypasses RLS.
-- p_effective_date is admin-selected (via a date picker in the UI) rather than
-- hardcoded to today, since a recall is often filed after the fact (e.g. HR
-- recording today that someone was actually called back to work 3 days ago) or
-- scheduled to take effect on a specific future day within the leave period.

DROP FUNCTION IF EXISTS public.recall_leave_request(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.recall_leave_request(
  p_request_id      UUID,
  p_admin_id        UUID,
  p_reason          TEXT,
  p_effective_date  DATE DEFAULT CURRENT_DATE
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request      leave_requests%ROWTYPE;
  v_admin_role   TEXT;
  v_effective    DATE;
  v_elapsed      DECIMAL;
  v_restored     DECIMAL;
BEGIN
  SELECT role INTO v_admin_role FROM users_profile WHERE id = p_admin_id;
  IF v_admin_role NOT IN ('hr_admin', 'super_admin') THEN
    RAISE EXCEPTION 'Only HR admin or super admin can recall approved leave';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to recall approved leave';
  END IF;

  IF p_effective_date IS NULL THEN
    RAISE EXCEPTION 'An effective date is required to recall approved leave';
  END IF;

  SELECT * INTO v_request FROM leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request not found';
  END IF;

  IF v_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved leave requests can be recalled (current status: %)', v_request.status;
  END IF;

  IF p_effective_date > v_request.end_date THEN
    RAISE EXCEPTION 'Effective date must be on or before the leave end date (%)', v_request.end_date;
  END IF;

  IF p_effective_date <= v_request.start_date THEN
    -- Recall takes effect on/before the leave start: full reversal
    v_effective := v_request.start_date;
    v_restored  := v_request.total_days;
  ELSE
    -- Recall takes effect mid-leave: days up to the day before stay used,
    -- the rest (from the effective date onward) is restored
    v_elapsed   := calculate_working_days(v_request.start_date, p_effective_date - 1);
    v_effective := p_effective_date;
    v_restored  := GREATEST(v_request.total_days - v_elapsed, 0);
  END IF;

  UPDATE leave_requests
  SET status = 'recalled',
      recalled_by = p_admin_id,
      recalled_at = NOW(),
      recall_reason = p_reason,
      recall_effective_date = v_effective,
      days_restored = v_restored,
      reviewed_by = p_admin_id,
      reviewed_at = NOW(),
      reviewer_comments = p_reason,
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recall_leave_request(UUID, UUID, TEXT, DATE) TO authenticated;

-- ─── 4. Balance trigger: restore days on recall ───────────────────────────────

CREATE OR REPLACE FUNCTION update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'pending') THEN
    UPDATE leave_balances
    SET pending_days = pending_days + NEW.total_days, updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);

  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'hod_approved' AND OLD.status = 'pending') THEN
    NULL; -- no balance change, days stay "pending"

  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET used_days = used_days + NEW.total_days,
        pending_days = pending_days - NEW.total_days, updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);

  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'rejected' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET pending_days = pending_days - NEW.total_days, updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);

  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status IN ('pending', 'hod_approved')) THEN
    UPDATE leave_balances
    SET pending_days = pending_days - NEW.total_days, updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);

  ELSIF (TG_OP = 'UPDATE' AND NEW.status = 'recalled' AND OLD.status = 'approved') THEN
    UPDATE leave_balances
    SET used_days = GREATEST(used_days - NEW.days_restored, 0), updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id
      AND year = EXTRACT(YEAR FROM NEW.start_date);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 5. Notification trigger: notify employee on recall ──────────────────────

CREATE OR REPLACE FUNCTION notify_leave_request_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hod_id     UUID;
  v_hr_id      UUID;
  v_event_type TEXT;
BEGIN

  -- ── INSERT: new request submitted ────────────────────────────────────────
  IF TG_OP = 'INSERT' THEN
    SELECT d.head_of_department_id INTO v_hod_id
    FROM users_profile up
    JOIN departments d ON d.id = up.department_id
    WHERE up.id = NEW.user_id;

    IF v_hod_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
      SELECT
        v_hod_id,
        'New Leave Request',
        up.first_name || ' ' || up.last_name || ' has submitted a leave request for ' || NEW.total_days || ' days',
        'leave_request',
        NEW.id,
        false
      FROM users_profile up WHERE up.id = NEW.user_id;
    END IF;

    PERFORM call_send_email_function('leave_submitted', 'leave', NEW.id);
    RETURN NEW;
  END IF;

  -- ── UPDATE: status changed ────────────────────────────────────────────────
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'hod_approved' THEN
    SELECT id INTO v_hr_id FROM users_profile
    WHERE role IN ('hr_admin', 'super_admin') LIMIT 1;

    IF v_hr_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
      SELECT
        v_hr_id,
        'Leave Request Awaiting HR Approval',
        up.first_name || ' ' || up.last_name || '''s leave request has been approved by HOD and needs HR final approval',
        'leave_request',
        NEW.id,
        false
      FROM users_profile up WHERE up.id = NEW.user_id;
    END IF;

    PERFORM call_send_email_function('leave_hod_approved', 'leave', NEW.id);

  ELSIF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.user_id,
      'Leave Request Approved',
      'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' has been fully approved',
      'approval',
      NEW.id,
      false
    );

    PERFORM call_send_email_function('leave_approved', 'leave', NEW.id);

  ELSIF NEW.status IN ('rejected', 'hod_rejected', 'hr_rejected') THEN
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.user_id,
      'Leave Request Not Approved',
      'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') || ' was not approved',
      'rejection',
      NEW.id,
      false
    );

    PERFORM call_send_email_function('leave_rejected', 'leave', NEW.id);

  ELSIF NEW.status = 'recalled' THEN
    INSERT INTO notifications (user_id, title, message, type, related_request_id, is_read)
    VALUES (
      NEW.user_id,
      'Leave Recalled',
      'Your leave request from ' || to_char(NEW.start_date, 'Mon DD, YYYY') || ' to ' || to_char(NEW.end_date, 'Mon DD, YYYY') ||
        ' has been recalled effective ' || to_char(NEW.recall_effective_date, 'Mon DD, YYYY') ||
        COALESCE('. Reason: ' || NEW.recall_reason, ''),
      'recall',
      NEW.id,
      false
    );

    PERFORM call_send_email_function('leave_recalled', 'leave', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leave_request_notification_trigger ON leave_requests;
CREATE TRIGGER leave_request_notification_trigger
  AFTER INSERT OR UPDATE OF status ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION notify_leave_request_event();

-- ─── 6. Payroll consistency: don't count recalled days as absence past recall ──
-- Same as the 032_payroll_leave_integration.sql definition, except unpaid_leave
-- now also includes 'recalled' requests, with eff_end capped at the day before
-- recall_effective_date so days the employee actually worked post-recall aren't
-- counted as unpaid absence.

CREATE OR REPLACE FUNCTION public.get_payroll_absence_days(
  p_year    integer,
  p_month   integer
)
RETURNS TABLE (
  user_id       uuid,
  leave_days    numeric,
  ooo_days      numeric,
  unpaid_days   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH period AS (
    SELECT
      date_trunc('month', make_date(p_year, p_month, 1))::date        AS period_start,
      (date_trunc('month', make_date(p_year, p_month, 1))
        + interval '1 month - 1 day')::date                           AS period_end
  ),

  -- Approved (or recalled, capped at the recall's effective date) unpaid leave
  -- requests overlapping the period
  unpaid_leave AS (
    SELECT
      lr.user_id,
      GREATEST(lr.start_date, p.period_start)                         AS eff_start,
      LEAST(
        lr.end_date,
        p.period_end,
        COALESCE(lr.recall_effective_date - 1, lr.end_date)
      )                                                                AS eff_end
    FROM public.leave_requests lr
    JOIN public.leave_types lt ON lt.id = lr.leave_type_id
    CROSS JOIN period p
    WHERE lr.status IN ('approved', 'recalled')
      AND lt.is_paid = false
      AND lr.start_date <= p.period_end
      AND lr.end_date   >= p.period_start
  ),

  -- Approved unpaid OOO requests overlapping the period
  unpaid_ooo AS (
    SELECT
      r.user_id,
      GREATEST(r.start_date, p.period_start)                         AS eff_start,
      LEAST(r.end_date,   p.period_end)                              AS eff_end
    FROM public.ooo_requests r
    CROSS JOIN period p
    WHERE r.status = 'hr_approved'
      AND r.is_paid = false
      AND r.start_date <= p.period_end
      AND r.end_date   >= p.period_start
  ),

  -- Count working days (Mon-Fri) in a date range using generate_series
  leave_counts AS (
    SELECT
      ul.user_id,
      COUNT(*) FILTER (
        WHERE EXTRACT(DOW FROM gs.d) NOT IN (0, 6)  -- exclude Sun(0) and Sat(6)
      )::numeric AS leave_days
    FROM unpaid_leave ul
    CROSS JOIN LATERAL generate_series(ul.eff_start, ul.eff_end, '1 day'::interval) gs(d)
    GROUP BY ul.user_id
  ),

  ooo_counts AS (
    SELECT
      uo.user_id,
      COUNT(*) FILTER (
        WHERE EXTRACT(DOW FROM gs.d) NOT IN (0, 6)
      )::numeric AS ooo_days
    FROM unpaid_ooo uo
    CROSS JOIN LATERAL generate_series(uo.eff_start, uo.eff_end, '1 day'::interval) gs(d)
    GROUP BY uo.user_id
  )

  SELECT
    up.id                                            AS user_id,
    COALESCE(lc.leave_days, 0)                       AS leave_days,
    COALESCE(oc.ooo_days,   0)                       AS ooo_days,
    COALESCE(lc.leave_days, 0) + COALESCE(oc.ooo_days, 0) AS unpaid_days
  FROM public.users_profile up
  LEFT JOIN leave_counts lc ON lc.user_id = up.id
  LEFT JOIN ooo_counts   oc ON oc.user_id = up.id
  WHERE up.is_active = true
    AND up.payroll_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_payroll_absence_days(integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
