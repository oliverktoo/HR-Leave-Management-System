-- =====================================================
-- Migration 037: Attendance Rota & Work Schedules
-- =====================================================

-- work_schedules table: defines shift types / named schedules
CREATE TABLE IF NOT EXISTS public.work_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  schedule_type text NOT NULL DEFAULT 'office'
    CHECK (schedule_type IN ('office', 'field', 'remote', 'off', 'flexible')),
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '17:00',
  expected_hours numeric(4,2) NOT NULL DEFAULT 8.0,
  break_minutes integer NOT NULL DEFAULT 60,
  grace_period_minutes integer NOT NULL DEFAULT 15,
  color text NOT NULL DEFAULT '#3b82f6',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- staff_rota table: assigns a schedule (or day-off) to a specific employee on a specific date
CREATE TABLE IF NOT EXISTS public.staff_rota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES public.work_schedules(id) ON DELETE SET NULL,
  rota_date date NOT NULL,
  is_day_off boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES public.users_profile(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, rota_date)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_staff_rota_user_date   ON public.staff_rota(user_id, rota_date);
CREATE INDEX IF NOT EXISTS idx_staff_rota_date        ON public.staff_rota(rota_date);
CREATE INDEX IF NOT EXISTS idx_work_schedules_active  ON public.work_schedules(is_active) WHERE is_active = true;

-- updated_at auto-update triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_schedules_updated_at ON public.work_schedules;
CREATE TRIGGER trg_work_schedules_updated_at
  BEFORE UPDATE ON public.work_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_staff_rota_updated_at ON public.staff_rota;
CREATE TRIGGER trg_staff_rota_updated_at
  BEFORE UPDATE ON public.staff_rota
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- Row Level Security
-- =====================================================

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_rota     ENABLE ROW LEVEL SECURITY;

-- ---------- work_schedules ----------
DROP POLICY IF EXISTS "work_schedules_select_authenticated" ON public.work_schedules;
CREATE POLICY "work_schedules_select_authenticated"
  ON public.work_schedules FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "work_schedules_insert_admin" ON public.work_schedules;
CREATE POLICY "work_schedules_insert_admin"
  ON public.work_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "work_schedules_update_admin" ON public.work_schedules;
CREATE POLICY "work_schedules_update_admin"
  ON public.work_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

DROP POLICY IF EXISTS "work_schedules_delete_admin" ON public.work_schedules;
CREATE POLICY "work_schedules_delete_admin"
  ON public.work_schedules FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- ---------- staff_rota ----------
-- Employees can see their own rota entries
DROP POLICY IF EXISTS "staff_rota_select_own" ON public.staff_rota;
CREATE POLICY "staff_rota_select_own"
  ON public.staff_rota FOR SELECT
  USING (auth.uid() = user_id);

-- hr_admin / super_admin can do everything
DROP POLICY IF EXISTS "staff_rota_all_admin" ON public.staff_rota;
CREATE POLICY "staff_rota_all_admin"
  ON public.staff_rota FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- HODs can select/insert/update/delete for their department
DROP POLICY IF EXISTS "staff_rota_select_hod" ON public.staff_rota;
CREATE POLICY "staff_rota_select_hod"
  ON public.staff_rota FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users_profile AS hod
      JOIN public.users_profile AS staff ON hod.department_id = staff.department_id
      WHERE hod.id   = auth.uid()
        AND hod.role = 'hod'
        AND staff.id = staff_rota.user_id
    )
  );

DROP POLICY IF EXISTS "staff_rota_insert_hod" ON public.staff_rota;
CREATE POLICY "staff_rota_insert_hod"
  ON public.staff_rota FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users_profile AS hod
      JOIN public.users_profile AS staff ON hod.department_id = staff.department_id
      WHERE hod.id   = auth.uid()
        AND hod.role = 'hod'
        AND staff.id = staff_rota.user_id
    )
  );

DROP POLICY IF EXISTS "staff_rota_update_hod" ON public.staff_rota;
CREATE POLICY "staff_rota_update_hod"
  ON public.staff_rota FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users_profile AS hod
      JOIN public.users_profile AS staff ON hod.department_id = staff.department_id
      WHERE hod.id   = auth.uid()
        AND hod.role = 'hod'
        AND staff.id = staff_rota.user_id
    )
  );

DROP POLICY IF EXISTS "staff_rota_delete_hod" ON public.staff_rota;
CREATE POLICY "staff_rota_delete_hod"
  ON public.staff_rota FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.users_profile AS hod
      JOIN public.users_profile AS staff ON hod.department_id = staff.department_id
      WHERE hod.id   = auth.uid()
        AND hod.role = 'hod'
        AND staff.id = staff_rota.user_id
    )
  );

-- =====================================================
-- Seed default work schedules
-- =====================================================

INSERT INTO public.work_schedules (name, description, schedule_type, start_time, end_time, expected_hours, break_minutes, grace_period_minutes, color)
VALUES
  (
    'Standard Office',
    'Regular office hours Monday to Friday',
    'office',
    '08:00', '17:00',
    8.0, 60, 15, '#3b82f6'
  ),
  (
    'Early Shift',
    'Morning shift starting at 7 AM',
    'office',
    '07:00', '15:00',
    7.5, 30, 10, '#8b5cf6'
  ),
  (
    'Afternoon Shift',
    'Afternoon shift starting at 1 PM',
    'office',
    '13:00', '21:00',
    7.5, 30, 10, '#f59e0b'
  ),
  (
    'Field Day',
    'Off-site field assignment — extended grace period',
    'field',
    '08:00', '17:00',
    8.0, 0, 30, '#22c55e'
  ),
  (
    'Remote Work',
    'Working from home — extended grace period',
    'remote',
    '08:00', '17:00',
    8.0, 60, 30, '#06b6d4'
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- Notify PostgREST to reload schema cache
-- =====================================================
NOTIFY pgrst, 'reload schema';
