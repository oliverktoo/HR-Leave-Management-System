-- Migration 053: Auto-create field_assignment when OOO request is hr_approved
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: The OOO system (ooo_requests / ooo_assignments) and the Field
-- Clock-In system (field_assignments / field_assignment_employees) are
-- completely independent.  After HR approves an OOO request the employee
-- sees status "Approved" in My OOO Requests but Field Clock-In shows
-- "No active assignments" because no record exists in field_assignments.
--
-- Fix: AFTER UPDATE trigger on ooo_requests.  When status transitions to
-- 'hr_approved', automatically insert a field_assignment and add the
-- employee to field_assignment_employees so they can immediately clock in.
--
-- Idempotency: we add an ooo_request_id column to field_assignments so we
-- can guard against duplicate creation on any subsequent status re-writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add ooo_request_id column to field_assignments ───────────────────────

ALTER TABLE public.field_assignments
  ADD COLUMN IF NOT EXISTS ooo_request_id UUID REFERENCES public.ooo_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fa_ooo_request ON public.field_assignments(ooo_request_id);

-- ─── 2. Trigger function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auto_field_assignment_on_ooo_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment   public.ooo_assignments%ROWTYPE;
  v_location     TEXT;
  v_title        TEXT;
  v_description  TEXT;
  v_start        TIMESTAMPTZ;
  v_end          TIMESTAMPTZ;
  v_supervisor   UUID;
  v_fa_id        UUID;
BEGIN
  -- ── Guard: only fire when transitioning INTO hr_approved ──────────────────
  IF NEW.status IS DISTINCT FROM 'hr_approved' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'hr_approved' THEN
    RETURN NEW;  -- already approved; no duplicate
  END IF;

  -- ── Guard: skip if a field assignment already exists for this OOO request ─
  IF EXISTS (
    SELECT 1 FROM public.field_assignments
    WHERE ooo_request_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  -- ── Fetch the OOO assignment for title / location info ───────────────────
  IF NEW.assignment_id IS NOT NULL THEN
    SELECT * INTO v_assignment
    FROM public.ooo_assignments
    WHERE id = NEW.assignment_id;
  END IF;

  -- ── Derive field values from OOO data ────────────────────────────────────

  v_title := COALESCE(
    v_assignment.title,
    'OOO – ' || NEW.absence_type || ' (' || NEW.start_date::TEXT || ')'
  );

  v_description := COALESCE(v_assignment.description, NULL);

  v_location := COALESCE(
    NULLIF(TRIM(v_assignment.location), ''),
    'Field / Location TBD'
  );

  -- Map OOO date (DATE) to timestamptz using Africa/Nairobi business hours.
  -- Employees can clock in from 07:00 and must clock out by 20:00.
  v_start := (NEW.start_date || ' 07:00:00')::TIMESTAMP AT TIME ZONE 'Africa/Nairobi';
  v_end   := (NEW.end_date   || ' 20:00:00')::TIMESTAMP AT TIME ZONE 'Africa/Nairobi';

  -- Supervisor: prefer the HOD who approved, fall back to HR reviewer
  v_supervisor := COALESCE(NEW.hod_id, NEW.hr_reviewer_id);

  -- Safety net — if somehow both are null, bail out gracefully
  IF v_supervisor IS NULL THEN
    RAISE WARNING 'auto_field_assignment_on_ooo_approval: no supervisor resolved for ooo_request %, skipping field_assignment creation', NEW.id;
    RETURN NEW;
  END IF;

  -- ── Insert field_assignment ───────────────────────────────────────────────
  INSERT INTO public.field_assignments (
    title,
    description,
    location_name,
    location_radius_m,
    planned_start,
    planned_end,
    created_by,
    supervisor_id,
    department_id,
    expected_deliverables,
    status,
    ooo_request_id
  ) VALUES (
    v_title,
    v_description,
    v_location,
    2000,                  -- 2 km radius — generous for field/travel assignments
    v_start,
    v_end,
    NEW.hr_reviewer_id,   -- created by the HR approver
    v_supervisor,
    NEW.department_id,
    '[]'::JSONB,
    'active',
    NEW.id
  )
  RETURNING id INTO v_fa_id;

  -- ── Add the employee to the new field assignment ──────────────────────────
  INSERT INTO public.field_assignment_employees (
    assignment_id,
    user_id,
    added_by
  ) VALUES (
    v_fa_id,
    NEW.user_id,
    NEW.hr_reviewer_id
  );

  RETURN NEW;
END;
$$;

-- ─── 3. Attach trigger to ooo_requests ───────────────────────────────────────

DROP TRIGGER IF EXISTS trg_ooo_auto_field_assignment ON public.ooo_requests;

CREATE TRIGGER trg_ooo_auto_field_assignment
  AFTER UPDATE OF status
  ON public.ooo_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_field_assignment_on_ooo_approval();

-- ─── 4. Back-fill: create field assignments for already-approved OOO requests
--        that do not yet have one ────────────────────────────────────────────

DO $$
DECLARE
  r              public.ooo_requests%ROWTYPE;
  v_assignment   public.ooo_assignments%ROWTYPE;
  v_location     TEXT;
  v_title        TEXT;
  v_start        TIMESTAMPTZ;
  v_end          TIMESTAMPTZ;
  v_supervisor   UUID;
  v_fa_id        UUID;
BEGIN
  FOR r IN
    SELECT oq.*
    FROM public.ooo_requests oq
    WHERE oq.status = 'hr_approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.field_assignments fa
        WHERE fa.ooo_request_id = oq.id
      )
  LOOP
    -- Fetch OOO assignment
    IF r.assignment_id IS NOT NULL THEN
      SELECT * INTO v_assignment
      FROM public.ooo_assignments
      WHERE id = r.assignment_id;
    ELSE
      v_assignment := NULL;
    END IF;

    v_title := COALESCE(
      v_assignment.title,
      'OOO – ' || r.absence_type || ' (' || r.start_date::TEXT || ')'
    );

    v_location := COALESCE(
      NULLIF(TRIM(v_assignment.location), ''),
      'Field / Location TBD'
    );

    v_start := (r.start_date || ' 07:00:00')::TIMESTAMP AT TIME ZONE 'Africa/Nairobi';
    v_end   := (r.end_date   || ' 20:00:00')::TIMESTAMP AT TIME ZONE 'Africa/Nairobi';
    v_supervisor := COALESCE(r.hod_id, r.hr_reviewer_id);

    CONTINUE WHEN v_supervisor IS NULL;

    INSERT INTO public.field_assignments (
      title,
      description,
      location_name,
      location_radius_m,
      planned_start,
      planned_end,
      created_by,
      supervisor_id,
      department_id,
      expected_deliverables,
      status,
      ooo_request_id
    ) VALUES (
      v_title,
      v_assignment.description,
      v_location,
      2000,
      v_start,
      v_end,
      COALESCE(r.hr_reviewer_id, r.hod_id),
      v_supervisor,
      r.department_id,
      '[]'::JSONB,
      'active',
      r.id
    )
    RETURNING id INTO v_fa_id;

    INSERT INTO public.field_assignment_employees (assignment_id, user_id, added_by)
    VALUES (v_fa_id, r.user_id, COALESCE(r.hr_reviewer_id, r.hod_id));
  END LOOP;
END;
$$;

-- ─── 5. Grant SELECT on field_assignments / field_assignment_employees ───────
-- (These tables already have SELECT grants from migration 022, but ensure
--  the new column is visible and the trigger function has access.)

GRANT SELECT, INSERT, UPDATE ON TABLE public.field_assignments         TO authenticated;
GRANT SELECT, INSERT         ON TABLE public.field_assignment_employees TO authenticated;

-- ─── Reload PostgREST schema cache ───────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
