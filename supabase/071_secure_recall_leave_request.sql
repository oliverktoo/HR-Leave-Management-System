-- Migration 071: Secure recall_leave_request
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 070's recall_leave_request is SECURITY DEFINER but authorised the
-- caller using the client-supplied p_admin_id. Any authenticated user could pass
-- an HR admin's UUID and recall anyone's approved leave. A non-existent UUID also
-- slipped through, because `NULL NOT IN (...)` evaluates to NULL (not TRUE).
--
-- Fix: the actor is always auth.uid(). p_admin_id is kept in the signature so
-- the existing frontend call keeps working, but it is ignored.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recall_leave_request(
  p_request_id      UUID,
  p_admin_id        UUID,   -- deprecated / ignored: the actor is auth.uid()
  p_reason          TEXT,
  p_effective_date  DATE DEFAULT CURRENT_DATE
)
RETURNS public.leave_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor        UUID := auth.uid();
  v_request      leave_requests%ROWTYPE;
  v_admin_role   TEXT;
  v_effective    DATE;
  v_elapsed      DECIMAL;
  v_restored     DECIMAL;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_admin_role FROM users_profile WHERE id = v_actor;
  IF v_admin_role IS NULL OR v_admin_role NOT IN ('hr_admin', 'super_admin') THEN
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
      recalled_by = v_actor,
      recalled_at = NOW(),
      recall_reason = p_reason,
      recall_effective_date = v_effective,
      days_restored = v_restored,
      reviewed_by = v_actor,
      reviewed_at = NOW(),
      reviewer_comments = p_reason,
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- Functions are executable by PUBLIC by default; restrict to signed-in users.
REVOKE ALL ON FUNCTION public.recall_leave_request(UUID, UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recall_leave_request(UUID, UUID, TEXT, DATE) TO authenticated;
