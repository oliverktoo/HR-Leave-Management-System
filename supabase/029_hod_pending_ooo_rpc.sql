-- Migration 029: SECURITY DEFINER RPCs for OOO approval queues
-- Direct SELECT is blocked by RLS even with explicit filters because ooo_requests
-- RLS only grants visibility by user_id or same-department.  SECURITY DEFINER
-- functions run as the DB owner and bypass RLS; the correct business logic is
-- enforced inside the function via auth.uid() checks.

-- ── HOD queue: pending requests for assignments the HOD created ───────────────
CREATE OR REPLACE FUNCTION get_hod_pending_ooo_requests()
RETURNS SETOF public.ooo_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT r.*
    FROM public.ooo_requests r
    JOIN public.ooo_assignments oa ON oa.id = r.assignment_id
    WHERE r.status = 'pending'
      AND oa.created_by = auth.uid()
    ORDER BY r.submitted_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_hod_pending_ooo_requests() TO authenticated;

-- ── HR Admin queue: hod_approved requests PLUS pending requests for assignments
--    the HR Admin themselves created (they are both creator and final approver) ─
CREATE OR REPLACE FUNCTION get_hr_pending_ooo_requests()
RETURNS SETOF public.ooo_requests
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    -- Standard HR review queue: requests that passed HOD step
    SELECT r.*
    FROM public.ooo_requests r
    WHERE r.status = 'hod_approved'

    UNION

    -- Requests for assignments the HR Admin created (they skip the HOD step)
    SELECT r.*
    FROM public.ooo_requests r
    JOIN public.ooo_assignments oa ON oa.id = r.assignment_id
    WHERE r.status = 'pending'
      AND oa.created_by = auth.uid()

    ORDER BY submitted_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_hr_pending_ooo_requests() TO authenticated;
