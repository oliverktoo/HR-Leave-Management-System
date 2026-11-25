-- Migration 084: Attendance on payroll — days present, hours clocked, joiners,
-- public holidays
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Working days in a payroll month now leave out public holidays (from
--    Holiday Management), and unpaid leave/OOO days no longer count holidays.
--    get_payroll_absence_days is now limited to HR / super admin / finance.
-- 2. users_profile.attendance_tracked: false for staff who do not clock in
--    (their payslip shows paid days only; they are never flagged).
-- 3. get_payroll_attendance(year, month): per employee on payroll —
--      pre_hire_days      working days before hire_date (unpaid: joined mid-month)
--      scheduled_days     days due to work (rota if set, else Mon–Fri), less holidays
--      present_days       days with an office check-in or field clock-in
--      hours_clocked      office + field hours
--      expected_hours     rota schedule hours, else 8 per scheduled day
--      unexplained_days   scheduled days up to today with no clock-in, leave,
--                         OOO or holiday (only for attendance-tracked staff)
-- 4. Attendance snapshot columns on payroll_lines, and
--    set_attendance_unpaid_days(line, days, reason): HR decides how many of the
--    unexplained days are unpaid. Nothing is deducted automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Helpers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_public_holiday(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.public_holidays h
    WHERE h.date = p_date
       OR (h.is_recurring AND extract(month FROM h.date) = extract(month FROM p_date)
                          AND extract(day   FROM h.date) = extract(day   FROM p_date))
  );
$$;

-- Mon–Fri, not a public holiday
CREATE OR REPLACE FUNCTION public.is_payroll_working_day(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT extract(dow FROM p_date) NOT IN (0, 6) AND NOT public.is_public_holiday(p_date);
$$;

CREATE OR REPLACE FUNCTION public.count_working_days_in_month(p_year integer, p_month integer)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COUNT(*)::integer
  FROM generate_series(make_date(p_year, p_month, 1),
                       (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
                       interval '1 day') AS gs(d)
  WHERE public.is_payroll_working_day(gs.d::date);
$$;

-- ─── Unpaid leave / OOO days: same as 070, but holidays are not counted ─────

CREATE OR REPLACE FUNCTION public.get_payroll_absence_days(p_year integer, p_month integer)
RETURNS TABLE (user_id uuid, leave_days numeric, ooo_days numeric, unpaid_days numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH period AS (
    SELECT make_date(p_year, p_month, 1) AS period_start,
           (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date AS period_end
  ),
  unpaid_leave AS (
    SELECT lr.user_id,
           GREATEST(lr.start_date, p.period_start) AS eff_start,
           LEAST(lr.end_date, p.period_end, COALESCE(lr.recall_effective_date - 1, lr.end_date)) AS eff_end
    FROM public.leave_requests lr
    JOIN public.leave_types lt ON lt.id = lr.leave_type_id
    CROSS JOIN period p
    WHERE lr.status IN ('approved', 'recalled') AND lt.is_paid = false
      AND lr.start_date <= p.period_end AND lr.end_date >= p.period_start
  ),
  unpaid_ooo AS (
    SELECT r.user_id,
           GREATEST(r.start_date, p.period_start) AS eff_start,
           LEAST(r.end_date, p.period_end) AS eff_end
    FROM public.ooo_requests r CROSS JOIN period p
    WHERE r.status = 'hr_approved' AND r.is_paid = false
      AND r.start_date <= p.period_end AND r.end_date >= p.period_start
  ),
  leave_counts AS (
    SELECT ul.user_id, COUNT(*) FILTER (WHERE public.is_payroll_working_day(gs.d::date))::numeric AS leave_days
    FROM unpaid_leave ul CROSS JOIN LATERAL generate_series(ul.eff_start, ul.eff_end, interval '1 day') gs(d)
    GROUP BY ul.user_id
  ),
  ooo_counts AS (
    SELECT uo.user_id, COUNT(*) FILTER (WHERE public.is_payroll_working_day(gs.d::date))::numeric AS ooo_days
    FROM unpaid_ooo uo CROSS JOIN LATERAL generate_series(uo.eff_start, uo.eff_end, interval '1 day') gs(d)
    GROUP BY uo.user_id
  )
  SELECT up.id,
         COALESCE(lc.leave_days, 0),
         COALESCE(oc.ooo_days, 0),
         COALESCE(lc.leave_days, 0) + COALESCE(oc.ooo_days, 0)
  FROM public.users_profile up
  LEFT JOIN leave_counts lc ON lc.user_id = up.id
  LEFT JOIN ooo_counts   oc ON oc.user_id = up.id
  WHERE up.is_active = true AND up.payroll_active = true
    -- payroll roles only (before 084 any signed-in user could list everyone's unpaid days)
    AND public.auth_has_role(ARRAY['hr_admin','super_admin','finance']);
$$;

-- ─── Columns ─────────────────────────────────────────────────────────────────

ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS attendance_tracked boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users_profile.attendance_tracked IS
  'false = this employee does not clock in; payroll shows paid days only and never flags absences.';

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS pre_hire_days         numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS att_tracked           boolean,
  ADD COLUMN IF NOT EXISTS att_scheduled_days    numeric(5,1),
  ADD COLUMN IF NOT EXISTS att_present_days      numeric(5,1),
  ADD COLUMN IF NOT EXISTS att_hours_clocked     numeric(7,2),
  ADD COLUMN IF NOT EXISTS att_hours_expected    numeric(7,2),
  ADD COLUMN IF NOT EXISTS att_unexplained_days  numeric(5,1),
  ADD COLUMN IF NOT EXISTS att_unexplained_dates date[],
  ADD COLUMN IF NOT EXISTS att_unpaid_days       numeric(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS att_unpaid_reason     text;

COMMENT ON COLUMN public.payroll_lines.att_unpaid_days IS
  'Unexplained absence days HR decided are unpaid (set_attendance_unpaid_days). Never set automatically.';

-- ─── Attendance summary for a payroll month ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_payroll_attendance(p_year integer, p_month integer)
RETURNS TABLE (
  user_id            uuid,
  tracked            boolean,
  pre_hire_days      numeric,
  scheduled_days     numeric,
  present_days       numeric,
  hours_clocked      numeric,
  expected_hours     numeric,
  unexplained_days   numeric,
  unexplained_dates  date[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_start date := make_date(p_year, p_month, 1);
  v_end   date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_today date := (now() AT TIME ZONE 'Africa/Nairobi')::date;
BEGIN
  IF NOT public.auth_has_role(ARRAY['hr_admin','super_admin','finance']) THEN
    RAISE EXCEPTION 'Only HR admin, super admin or finance can read payroll attendance';
  END IF;

  RETURN QUERY
  WITH emp AS (
    SELECT up.id, up.hire_date, up.attendance_tracked AS tracked
    FROM users_profile up
    WHERE up.is_active = true AND up.payroll_active = true
  ),
  cal AS (
    SELECT gs.d::date AS d, public.is_public_holiday(gs.d::date) AS hol
    FROM generate_series(v_start, v_end, interval '1 day') gs(d)
  ),
  days AS (
    SELECT e.id AS uid, e.tracked, c.d,
           (e.hire_date IS NOT NULL AND c.d < e.hire_date) AS before_hire,
           (extract(dow FROM c.d) NOT IN (0, 6) AND NOT c.hol) AS payroll_day,
           CASE WHEN r.id IS NOT NULL THEN NOT r.is_day_off AND NOT c.hol
                ELSE extract(dow FROM c.d) NOT IN (0, 6) AND NOT c.hol END AS scheduled,
           COALESCE(ws.expected_hours, 8) AS exp_hours
    FROM emp e
    CROSS JOIN cal c
    LEFT JOIN staff_rota r      ON r.user_id = e.id AND r.rota_date = c.d
    LEFT JOIN work_schedules ws ON ws.id = r.schedule_id
  ),
  present AS (
    SELECT ar.user_id AS uid, ar.date AS d
    FROM attendance_records ar
    WHERE ar.date BETWEEN v_start AND v_end
      AND ar.check_in_time IS NOT NULL
      AND COALESCE(ar.status, 'present') <> 'absent'
    UNION
    SELECT fl.user_id, (fl.clock_in_time AT TIME ZONE 'Africa/Nairobi')::date
    FROM field_clock_logs fl
    WHERE (fl.clock_in_time AT TIME ZONE 'Africa/Nairobi')::date BETWEEN v_start AND v_end
  ),
  hours AS (
    SELECT h.uid, SUM(h.hrs) AS hrs FROM (
      SELECT ar.user_id AS uid, COALESCE(ar.work_hours, 0) AS hrs
      FROM attendance_records ar WHERE ar.date BETWEEN v_start AND v_end
      UNION ALL
      SELECT fl.user_id, COALESCE(fl.work_hours, 0)
      FROM field_clock_logs fl
      WHERE (fl.clock_in_time AT TIME ZONE 'Africa/Nairobi')::date BETWEEN v_start AND v_end
    ) h GROUP BY h.uid
  ),
  -- Any approved leave (paid or unpaid; recalled leave stops at the recall date)
  -- or HR-approved OOO explains an absence
  excused AS (
    SELECT lr.user_id AS uid, gs.d::date AS d
    FROM leave_requests lr
    CROSS JOIN LATERAL generate_series(
      GREATEST(lr.start_date, v_start),
      LEAST(lr.end_date, v_end, COALESCE(lr.recall_effective_date - 1, lr.end_date)),
      interval '1 day') gs(d)
    WHERE lr.status IN ('approved', 'recalled') AND lr.start_date <= v_end AND lr.end_date >= v_start
    UNION
    SELECT o.user_id, gs.d::date
    FROM ooo_requests o
    CROSS JOIN LATERAL generate_series(GREATEST(o.start_date, v_start), LEAST(o.end_date, v_end), interval '1 day') gs(d)
    WHERE o.status = 'hr_approved' AND o.start_date <= v_end AND o.end_date >= v_start
  ),
  flagged AS (
    SELECT dy.uid, dy.d
    FROM days dy
    WHERE dy.tracked AND dy.scheduled AND NOT dy.before_hire AND dy.d <= v_today
      AND NOT EXISTS (SELECT 1 FROM present p WHERE p.uid = dy.uid AND p.d = dy.d)
      AND NOT EXISTS (SELECT 1 FROM excused x WHERE x.uid = dy.uid AND x.d = dy.d)
  )
  SELECT
    e.id,
    e.tracked,
    (SELECT COUNT(*) FROM days dy WHERE dy.uid = e.id AND dy.payroll_day AND dy.before_hire)::numeric,
    (SELECT COUNT(*) FROM days dy WHERE dy.uid = e.id AND dy.scheduled AND NOT dy.before_hire)::numeric,
    (SELECT COUNT(*) FROM present p WHERE p.uid = e.id)::numeric,
    COALESCE((SELECT h.hrs FROM hours h WHERE h.uid = e.id), 0)::numeric,
    COALESCE((SELECT SUM(dy.exp_hours) FROM days dy WHERE dy.uid = e.id AND dy.scheduled AND NOT dy.before_hire), 0)::numeric,
    (SELECT COUNT(*) FROM flagged f WHERE f.uid = e.id)::numeric,
    COALESCE((SELECT array_agg(f.d ORDER BY f.d) FROM flagged f WHERE f.uid = e.id), '{}'::date[])
  FROM emp e;
END;
$$;

-- ─── HR: mark unexplained absence days as unpaid ─────────────────────────────

CREATE OR REPLACE FUNCTION public.set_attendance_unpaid_days(p_line_id uuid, p_days numeric, p_reason text)
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
    RAISE EXCEPTION 'Only HR admin or super admin can mark absence days as unpaid';
  END IF;

  SELECT * INTO v_line FROM payroll_lines WHERE id = p_line_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payroll line not found'; END IF;
  SELECT status INTO v_status FROM payroll_runs WHERE id = v_line.run_id FOR UPDATE;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Pay can only be changed while the run is a draft (this run is %)', v_status;
  END IF;

  IF p_days IS NULL OR p_days < 0 OR p_days > COALESCE(v_line.att_unexplained_days, 0) THEN
    RAISE EXCEPTION 'Unpaid days must be between 0 and the % unexplained absence day(s)',
      COALESCE(v_line.att_unexplained_days, 0);
  END IF;
  IF p_days <> trunc(p_days) THEN
    RAISE EXCEPTION 'Unpaid days must be whole days';  -- days_worked is a whole number
  END IF;
  IF p_days > 0 AND coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Give a reason for marking absence days as unpaid';
  END IF;

  UPDATE payroll_lines
  SET att_unpaid_days   = p_days,
      att_unpaid_reason = CASE WHEN p_days > 0 THEN trim(p_reason) END,
      days_worked       = GREATEST(0, COALESCE(days_worked, 0) + v_line.att_unpaid_days - p_days)
  WHERE id = p_line_id;

  INSERT INTO payroll_audit_log (run_id, line_id, actor_id, action, old_values, new_values, notes)
  VALUES (v_line.run_id, p_line_id, auth.uid(), 'attendance_unpaid_days',
          jsonb_build_object('att_unpaid_days', v_line.att_unpaid_days, 'days_worked', v_line.days_worked),
          jsonb_build_object('att_unpaid_days', p_days,
                             'days_worked', GREATEST(0, COALESCE(v_line.days_worked, 0) + v_line.att_unpaid_days - p_days)),
          NULLIF(trim(p_reason), ''));
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.is_public_holiday(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_payroll_working_day(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_working_days_in_month(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payroll_absence_days(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_payroll_attendance(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_attendance_unpaid_days(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_public_holiday(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_payroll_working_day(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_working_days_in_month(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_absence_days(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payroll_attendance(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_attendance_unpaid_days(uuid, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
