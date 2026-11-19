-- Migration 032: Payroll ↔ Leave / OOO Integration
-- Adds is_paid flag to leave_types, unpaid_ooo flag to ooo_requests,
-- and a SECURITY DEFINER RPC that the payroll engine calls to get
-- unpaid absence days per employee for a given pay period.

-- ─── 1. Add is_paid to leave_types ───────────────────────────────────────────
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.leave_types.is_paid IS
  'True = paid leave (no salary deduction). False = unpaid leave (prorated deduction).';

-- ─── 2. Add unpaid_ooo flag to ooo_requests ───────────────────────────────────
-- Some OOO assignment types (e.g. unpaid secondment) should trigger deduction
ALTER TABLE public.ooo_requests
  ADD COLUMN IF NOT EXISTS is_paid boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ooo_requests.is_paid IS
  'True = no salary deduction (official assignment, paid leave). False = unpaid OOO.';

-- ─── 3. Add working_days column to payroll_runs for proration base ────────────
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS working_days_in_period integer;

-- ─── 4. RPC: get unpaid absence days per employee for a pay period ────────────
-- Returns one row per active employee with their unpaid_days for the month.
-- Uses SECURITY DEFINER so the payroll engine can read leave/ooo data regardless of RLS.

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

  -- Approved unpaid leave requests overlapping the period
  unpaid_leave AS (
    SELECT
      lr.user_id,
      -- Clamp dates to the period, count working days in overlap
      GREATEST(lr.start_date, p.period_start)                         AS eff_start,
      LEAST(lr.end_date,   p.period_end)                              AS eff_end
    FROM public.leave_requests lr
    JOIN public.leave_types lt ON lt.id = lr.leave_type_id
    CROSS JOIN period p
    WHERE lr.status = 'approved'
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

-- ─── 5. Helper: count working days in a month ─────────────────────────────────
-- Used by the payroll engine to set the proration denominator.
CREATE OR REPLACE FUNCTION public.count_working_days_in_month(p_year integer, p_month integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COUNT(*)::integer
  FROM generate_series(
    make_date(p_year, p_month, 1),
    (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date,
    '1 day'::interval
  ) AS gs(d)
  WHERE EXTRACT(DOW FROM gs) NOT IN (0, 6);
$$;

GRANT EXECUTE ON FUNCTION public.count_working_days_in_month(integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
