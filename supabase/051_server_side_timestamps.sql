-- Migration 051: Server-side timestamps for clock-in/out
-- Prevents time cheating by computing all timestamps on the DB server (now())
-- Client sends only payload data — never a time value.

-- ─── 1. Office attendance clock-in ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_clock_in(
  p_employee_id    text,
  p_employee_name  text,
  p_date           date,
  p_status         text,
  p_location       text       DEFAULT NULL,
  p_ip_address     text       DEFAULT NULL,
  p_coords         text       DEFAULT NULL,  -- '(lng,lat)' point format
  p_notes          text       DEFAULT NULL,
  p_selfie_url     text       DEFAULT NULL,
  p_face_match_score float    DEFAULT NULL,
  p_face_verified_auto boolean DEFAULT NULL
)
RETURNS SETOF attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  INSERT INTO public.attendance_records (
    user_id,
    employee_id,
    employee_name,
    check_in_time,          -- always server now()
    date,
    status,
    location,
    ip_address,
    notes,
    selfie_url,
    face_match_score,
    face_verified_auto
  ) VALUES (
    v_user_id,
    p_employee_id,
    p_employee_name,
    now(),                  -- server timestamp, cannot be spoofed
    p_date,
    p_status,
    p_location,
    NULLIF(p_ip_address, '')::inet,
    p_notes,
    p_selfie_url,
    p_face_match_score,
    p_face_verified_auto
  )
  RETURNING *;
END;
$$;

-- ─── 2. Office attendance clock-out ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_clock_out(
  p_record_id   uuid,
  p_notes       text DEFAULT NULL
)
RETURNS SETOF attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_check_in  timestamptz;
  v_work_hours numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Fetch check_in_time to compute work hours server-side
  SELECT check_in_time INTO v_check_in
  FROM public.attendance_records
  WHERE id = p_record_id AND user_id = v_user_id;

  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'Record not found or access denied';
  END IF;

  v_work_hours := ROUND(
    EXTRACT(EPOCH FROM (now() - v_check_in)) / 3600.0, 2
  );

  RETURN QUERY
  UPDATE public.attendance_records
  SET
    check_out_time = now(),           -- server timestamp
    work_hours     = v_work_hours,
    notes          = COALESCE(p_notes, notes),
    updated_at     = now()
  WHERE id = p_record_id
    AND user_id = v_user_id
  RETURNING *;
END;
$$;

-- ─── 3. Field clock-in ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_field_clock_in(
  p_assignment_id    uuid,
  p_clock_in_lat     numeric  DEFAULT NULL,
  p_clock_in_lng     numeric  DEFAULT NULL,
  p_clock_in_accuracy numeric DEFAULT NULL,
  p_clock_in_note    text     DEFAULT NULL,
  p_clock_in_photo_url text   DEFAULT NULL,
  p_clock_in_offline boolean  DEFAULT false,
  p_selfie_url       text     DEFAULT NULL,
  p_face_match_score float    DEFAULT NULL,
  p_face_verified_auto boolean DEFAULT NULL
)
RETURNS SETOF field_clock_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_existing uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Guard: no duplicate open clock-in
  SELECT id INTO v_existing
  FROM public.field_clock_logs
  WHERE assignment_id = p_assignment_id
    AND user_id       = v_user_id
    AND clock_out_time IS NULL;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'You already have an open clock-in for this assignment. Please clock out first.';
  END IF;

  -- Update assignment to in_progress
  UPDATE public.field_assignments
  SET status = 'in_progress'
  WHERE id = p_assignment_id AND status = 'active';

  RETURN QUERY
  INSERT INTO public.field_clock_logs (
    assignment_id,
    user_id,
    clock_in_time,          -- server now()
    clock_in_lat,
    clock_in_lng,
    clock_in_accuracy,
    clock_in_note,
    clock_in_photo_url,
    clock_in_offline,
    face_match_score,
    face_verified_auto
  ) VALUES (
    p_assignment_id,
    v_user_id,
    now(),                  -- server timestamp
    p_clock_in_lat,
    p_clock_in_lng,
    p_clock_in_accuracy,
    p_clock_in_note,
    COALESCE(p_selfie_url, p_clock_in_photo_url),
    p_clock_in_offline,
    p_face_match_score,
    p_face_verified_auto
  )
  RETURNING *;
END;
$$;

-- ─── 4. Field clock-out ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_field_clock_out(
  p_log_id              uuid,
  p_clock_out_lat       numeric  DEFAULT NULL,
  p_clock_out_lng       numeric  DEFAULT NULL,
  p_clock_out_accuracy  numeric  DEFAULT NULL,
  p_clock_out_note      text     DEFAULT NULL,
  p_clock_out_offline   boolean  DEFAULT false,
  p_end_report          text     DEFAULT NULL,
  p_deliverables_status jsonb    DEFAULT '[]',
  p_mileage_km          numeric  DEFAULT NULL,
  p_expenses_submitted  boolean  DEFAULT false
)
RETURNS SETOF field_clock_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_check_in   timestamptz;
  v_work_hours numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT clock_in_time INTO v_check_in
  FROM public.field_clock_logs
  WHERE id = p_log_id AND user_id = v_user_id;

  IF v_check_in IS NULL THEN
    RAISE EXCEPTION 'Log not found or access denied';
  END IF;

  v_work_hours := ROUND(
    EXTRACT(EPOCH FROM (now() - v_check_in)) / 3600.0, 2
  );

  RETURN QUERY
  UPDATE public.field_clock_logs
  SET
    clock_out_time      = now(),          -- server timestamp
    clock_out_lat       = p_clock_out_lat,
    clock_out_lng       = p_clock_out_lng,
    clock_out_accuracy  = p_clock_out_accuracy,
    clock_out_note      = p_clock_out_note,
    clock_out_offline   = p_clock_out_offline,
    end_report          = p_end_report,
    deliverables_status = p_deliverables_status,
    mileage_km          = p_mileage_km,
    expenses_submitted  = p_expenses_submitted,
    work_hours          = v_work_hours,
    updated_at          = now()
  WHERE id = p_log_id
    AND user_id = v_user_id
  RETURNING *;
END;
$$;

-- ─── Grant execute to authenticated users ─────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.server_clock_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_clock_out TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_field_clock_in TO authenticated;
GRANT EXECUTE ON FUNCTION public.server_field_clock_out TO authenticated;

NOTIFY pgrst, 'reload schema';
