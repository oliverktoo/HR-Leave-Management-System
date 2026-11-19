-- Migration 062: Overtime Requests & Approval
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.overtime_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL,

  date            DATE NOT NULL,
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  hours           NUMERIC(4,2) GENERATED ALWAYS AS (
                    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
                  ) STORED,

  reason          TEXT NOT NULL,
  work_done       TEXT,                 -- description of work performed

  -- Overtime type affects pay multiplier
  overtime_type   TEXT NOT NULL DEFAULT 'weekday'
                    CHECK (overtime_type IN ('weekday','weekend','public_holiday','night')),

  -- Approval flow: HOD → HR
  hod_status      TEXT NOT NULL DEFAULT 'pending'
                    CHECK (hod_status IN ('pending','approved','rejected')),
  hod_approved_by UUID REFERENCES auth.users(id),
  hod_approved_at TIMESTAMPTZ,
  hod_comment     TEXT,

  hr_status       TEXT NOT NULL DEFAULT 'pending'
                    CHECK (hr_status IN ('pending','approved','rejected')),
  hr_approved_by  UUID REFERENCES auth.users(id),
  hr_approved_at  TIMESTAMPTZ,
  hr_comment      TEXT,

  -- Final computed status
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','hod_approved','approved','rejected','cancelled')),

  -- Payroll link
  included_in_payroll_run UUID REFERENCES public.payroll_runs(id) ON DELETE SET NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_overtime_user   ON public.overtime_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_overtime_date   ON public.overtime_requests(date);
CREATE INDEX IF NOT EXISTS idx_overtime_status ON public.overtime_requests(status);

-- ─── Trigger: keep status in sync with approval stages ───────────────────────
CREATE OR REPLACE FUNCTION public.sync_overtime_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hod_status = 'rejected' OR NEW.hr_status = 'rejected' THEN
    NEW.status := 'rejected';
  ELSIF NEW.hod_status = 'approved' AND NEW.hr_status = 'approved' THEN
    NEW.status := 'approved';
  ELSIF NEW.hod_status = 'approved' AND NEW.hr_status = 'pending' THEN
    NEW.status := 'hod_approved';
  ELSE
    NEW.status := 'pending';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_overtime_status ON public.overtime_requests;
CREATE TRIGGER trg_sync_overtime_status
  BEFORE INSERT OR UPDATE ON public.overtime_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_overtime_status();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

-- Employee: view & manage own requests
DROP POLICY IF EXISTS "overtime_own"     ON public.overtime_requests;
DROP POLICY IF EXISTS "overtime_hod"     ON public.overtime_requests;
DROP POLICY IF EXISTS "overtime_hr_all"  ON public.overtime_requests;

CREATE POLICY "overtime_own" ON public.overtime_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- HOD: view & approve requests in their department
CREATE POLICY "overtime_hod" ON public.overtime_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users_profile requester
      JOIN public.users_profile approver ON approver.id = auth.uid()
      WHERE requester.id = overtime_requests.user_id
        AND requester.department_id = approver.department_id
        AND approver.role = 'hod'
    )
  );

-- HR/admin: see everything
CREATE POLICY "overtime_hr_all" ON public.overtime_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users_profile
            WHERE id = auth.uid()
              AND role IN ('super_admin','hr_admin','ceo','finance'))
  );

-- ─── View for HR reporting ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_overtime_summary AS
SELECT
  ot.id,
  ot.date,
  up.employee_id,
  up.first_name || ' ' || up.last_name AS staff_name,
  d.name                               AS department_name,
  ot.start_time,
  ot.end_time,
  ot.hours,
  ot.overtime_type,
  ot.reason,
  ot.status,
  ot.hod_status,
  ot.hr_status,
  ot.created_at
FROM public.overtime_requests ot
JOIN public.users_profile up ON up.id = ot.user_id
LEFT JOIN public.departments d ON d.id = up.department_id
ORDER BY ot.date DESC, ot.created_at DESC;

GRANT SELECT ON public.v_overtime_summary TO authenticated;

NOTIFY pgrst, 'reload schema';
