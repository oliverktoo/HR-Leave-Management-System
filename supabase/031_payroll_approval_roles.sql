-- Migration 031: Add finance and ceo roles for payroll approval chain
-- The chk_role constraint was already expanded beyond its original definition
-- by fleet migrations; this migration drops it and recreates it with all current roles.

-- ─── 1. Update the role check constraint ─────────────────────────────────────
ALTER TABLE public.users_profile
  DROP CONSTRAINT IF EXISTS chk_role;

ALTER TABLE public.users_profile
  ADD CONSTRAINT chk_role CHECK (role IN (
    'employee',
    'hod',
    'hr_admin',
    'super_admin',
    'fleet_manager',
    'driver',
    'finance',
    'ceo'
  ));

-- ─── 2. Update payroll_runs RLS so finance and ceo can read their queues ──────

-- Finance: can see runs that are pending_finance or later
DROP POLICY IF EXISTS payroll_runs_finance_read ON public.payroll_runs;
CREATE POLICY payroll_runs_finance_read ON public.payroll_runs FOR SELECT TO authenticated
  USING (
    status IN ('pending_finance','pending_ceo','approved','paid')
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('finance','hr_admin','super_admin')
    )
  );

-- Finance: can update runs that are pending_finance (to approve/reject)
DROP POLICY IF EXISTS payroll_runs_finance_update ON public.payroll_runs;
CREATE POLICY payroll_runs_finance_update ON public.payroll_runs FOR UPDATE TO authenticated
  USING (
    status = 'pending_finance'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('finance','hr_admin','super_admin')
    )
  );

-- CEO: can see runs that are pending_ceo or later
DROP POLICY IF EXISTS payroll_runs_ceo_read ON public.payroll_runs;
CREATE POLICY payroll_runs_ceo_read ON public.payroll_runs FOR SELECT TO authenticated
  USING (
    status IN ('pending_ceo','approved','paid')
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('ceo','super_admin')
    )
  );

-- CEO: can update runs that are pending_ceo (to approve/reject)
DROP POLICY IF EXISTS payroll_runs_ceo_update ON public.payroll_runs;
CREATE POLICY payroll_runs_ceo_update ON public.payroll_runs FOR UPDATE TO authenticated
  USING (
    status = 'pending_ceo'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('ceo','super_admin')
    )
  );

-- Finance and CEO can read payroll_lines for runs they can see
DROP POLICY IF EXISTS payroll_lines_finance_ceo_read ON public.payroll_lines;
CREATE POLICY payroll_lines_finance_ceo_read ON public.payroll_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.payroll_runs pr
      WHERE pr.id = run_id
        AND pr.status IN ('pending_finance','pending_ceo','approved','paid')
    )
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('finance','ceo','super_admin')
    )
  );

-- ─── 3. RLS: finance/ceo can see their own payroll lines as employees ─────────
-- (already covered by payroll_lines_self policy from migration 030)

NOTIFY pgrst, 'reload schema';
