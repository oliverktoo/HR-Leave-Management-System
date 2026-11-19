-- Migration 057: Payroll SOP Compliance — FKF/HR/POL/2026/004
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds: variable pay, expanded non-statutory deductions, salary change log,
--       statutory remittance tracking, rejected→revise flow, pro-rated joiners,
--       payroll cycle status, ghost worker cross-check view.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Variable pay columns on payroll_lines ────────────────────────────────
-- SOP 6.2: overtime, bonuses, acting allowance, per diems, commissions

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS overtime_amount      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours       numeric(6,2)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_amount         numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acting_allowance     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_diem_amount      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_variable_pay   jsonb NOT NULL DEFAULT '[]'::jsonb;
  -- e.g. [{"name":"Match Fee","amount":5000},{"name":"Commission","amount":12000}]

COMMENT ON COLUMN public.payroll_lines.other_variable_pay IS
  'Array of {name, amount} for any other variable pay items (commissions, match fees, etc.)';

-- ─── 2. Expanded non-statutory deductions on users_profile ──────────────────
-- SOP 6.4: SACCO, supplementary pension, medical premium, salary advance

ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS sacco_contribution    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sacco_loan_repayment  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_premium       numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplementary_pension numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_advance_balance numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_advance_monthly_recovery numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.users_profile.salary_advance_balance IS
  'Outstanding salary advance balance (KES). Reduced each month by salary_advance_monthly_recovery.';

-- ─── 3. payroll_lines: court-ordered deductions ──────────────────────────────
ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS court_deduction_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS court_deduction_ref    text;

-- ─── 4. payroll_runs: cycle phase tracking ───────────────────────────────────
-- SOP 5: Day 1-20 attendance, 21-23 data collection, 24 input, 25 validation,
--         26-27 management approval, 28-30 payment, 9th remittance

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS cycle_phase           text DEFAULT 'data_collection'
    CHECK (cycle_phase IN (
      'data_collection',  -- Day 21-23: HR collecting data
      'input',            -- Day 24: Payroll Officer inputting
      'validation',       -- Day 25: HR + Finance joint validation
      'management_approval', -- Day 26-27: 3-tier approval
      'payment',          -- Day 28-30: bank file + payslips
      'remittance',       -- By 9th: statutory remittances
      'complete'          -- Archived
    )),
  ADD COLUMN IF NOT EXISTS data_submitted_at     timestamptz,  -- HR submits to Finance
  ADD COLUMN IF NOT EXISTS data_submitted_by     uuid REFERENCES public.users_profile(id),
  ADD COLUMN IF NOT EXISTS validated_at          timestamptz,  -- Validation sign-off
  ADD COLUMN IF NOT EXISTS validated_by          uuid REFERENCES public.users_profile(id),
  ADD COLUMN IF NOT EXISTS paid_at               timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by               uuid REFERENCES public.users_profile(id),
  ADD COLUMN IF NOT EXISTS bank_file_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS payslips_distributed_at timestamptz;

-- ─── 5. Statutory remittance tracking ───────────────────────────────────────
-- SOP Step 6: PAYE/NSSF/SHIF/Housing Levy must be remitted by 9th of next month

CREATE TABLE IF NOT EXISTS public.payroll_remittances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  remittance_type   text NOT NULL CHECK (remittance_type IN ('paye','nssf','shif','housing_levy')),
  amount            numeric(12,2) NOT NULL,
  due_date          date NOT NULL,          -- 9th of following month
  remitted_at       timestamptz,
  remitted_by       uuid REFERENCES public.users_profile(id),
  reference_number  text,                   -- iTax/portal confirmation number
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','remitted','late','cancelled')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_remittances_run ON public.payroll_remittances(run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_remittances_due ON public.payroll_remittances(due_date, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_remittances_unique ON public.payroll_remittances(run_id, remittance_type);

-- ─── 6. Salary change / review log ──────────────────────────────────────────
-- SOP 7 Step 1: salary changes must be captured with effective date and approver

CREATE TABLE IF NOT EXISTS public.salary_changes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
  change_type       text NOT NULL CHECK (change_type IN (
    'increment','decrement','promotion','grade_change','acting','correction','joining','termination'
  )),
  old_basic_salary  numeric(12,2),
  new_basic_salary  numeric(12,2),
  old_allowances    jsonb,
  new_allowances    jsonb,
  old_grade         text,
  new_grade         text,
  effective_date    date NOT NULL,
  reason            text NOT NULL,
  approved_by       uuid REFERENCES public.users_profile(id),
  approved_at       timestamptz,
  created_by        uuid REFERENCES public.users_profile(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salary_changes_user ON public.salary_changes(user_id);
CREATE INDEX IF NOT EXISTS idx_salary_changes_effective ON public.salary_changes(effective_date DESC);

-- ─── 7. payroll_runs: rejected → revise flow ────────────────────────────────
-- SOP implies HR can fix and resubmit. Add revision_of to chain amended runs.

ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS revision_of      uuid REFERENCES public.payroll_runs(id),
  ADD COLUMN IF NOT EXISTS revision_notes   text,
  ADD COLUMN IF NOT EXISTS revision_number  integer NOT NULL DEFAULT 1;

-- Update status check to allow 'revised' as a terminal state for the old run
ALTER TABLE public.payroll_runs
  DROP CONSTRAINT IF EXISTS payroll_runs_status_check;

ALTER TABLE public.payroll_runs
  ADD CONSTRAINT payroll_runs_status_check
  CHECK (status IN ('draft','pending_hr','pending_finance','pending_ceo','approved','rejected','paid','superseded'));

-- ─── 8. Pro-rated joiner support ────────────────────────────────────────────
-- SOP Step 3 HR validation: new joiners must be pro-rated

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS is_new_joiner       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS joining_date        date,
  ADD COLUMN IF NOT EXISTS proration_days      integer;  -- actual days in period for new joiner

-- ─── 9. Ghost worker cross-check view ───────────────────────────────────────
-- SOP 9.5: Monthly cross-check payroll vs HR active records

CREATE OR REPLACE VIEW public.v_ghost_worker_check AS
SELECT
  up.id,
  up.employee_id,
  (up.first_name || ' ' || up.last_name) AS full_name,
  up.department_id,
  up.is_active          AS hr_active,
  up.payroll_active     AS payroll_active,
  up.basic_salary,
  CASE
    WHEN up.is_active = true  AND up.payroll_active = true  THEN 'ok'
    WHEN up.is_active = false AND up.payroll_active = true  THEN 'ghost_risk'   -- inactive in HR, still on payroll
    WHEN up.is_active = true  AND up.payroll_active = false THEN 'excluded'     -- active but excluded from payroll
    ELSE 'inactive'
  END AS payroll_status
FROM public.users_profile up
WHERE up.is_active = true OR up.payroll_active = true
ORDER BY payroll_status DESC, up.first_name, up.last_name;

COMMENT ON VIEW public.v_ghost_worker_check IS
  'Ghost worker detection: cross-checks HR active status vs payroll_active flag. '
  'ghost_risk = inactive in HR but still drawing salary.';

-- ─── 10. Payroll headcount vs establishment view ─────────────────────────────

CREATE OR REPLACE VIEW public.v_payroll_headcount AS
SELECT
  d.id   AS department_id,
  d.name AS department_name,
  COUNT(up.id) FILTER (WHERE up.is_active = true)         AS hr_headcount,
  COUNT(up.id) FILTER (WHERE up.payroll_active = true
                        AND up.is_active = true)           AS payroll_headcount,
  SUM(up.basic_salary) FILTER (WHERE up.payroll_active = true
                               AND up.is_active = true)   AS total_basic_cost
FROM public.departments d
LEFT JOIN public.users_profile up ON up.department_id = d.id
GROUP BY d.id, d.name
ORDER BY d.name;

-- ─── 11. Helper: auto-create remittance rows when run is approved ────────────

CREATE OR REPLACE FUNCTION public.create_remittance_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_due_date date;
BEGIN
  -- Only fire when transitioning to 'approved'
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Due date = 9th of the NEXT month after the pay period
    v_due_date := make_date(
      CASE WHEN NEW.pay_period_month = 12 THEN NEW.pay_period_year + 1
           ELSE NEW.pay_period_year END,
      CASE WHEN NEW.pay_period_month = 12 THEN 1
           ELSE NEW.pay_period_month + 1 END,
      9
    );

    INSERT INTO public.payroll_remittances (run_id, remittance_type, amount, due_date)
    VALUES
      (NEW.id, 'paye',        COALESCE(NEW.total_paye, 0),                                       v_due_date),
      (NEW.id, 'nssf',        COALESCE(NEW.total_nssf_employee, 0) + COALESCE(NEW.total_nssf_employer, 0), v_due_date),
      (NEW.id, 'shif',        COALESCE(NEW.total_sha, 0),                                        v_due_date),
      (NEW.id, 'housing_levy',COALESCE(NEW.total_housing_levy_employee, 0) + COALESCE(NEW.total_housing_levy_employer, 0), v_due_date)
    ON CONFLICT (run_id, remittance_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_remittance_schedule ON public.payroll_runs;
CREATE TRIGGER trg_create_remittance_schedule
  AFTER UPDATE OF status ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.create_remittance_schedule();

-- ─── 12. RLS for new tables ──────────────────────────────────────────────────

ALTER TABLE public.payroll_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_changes      ENABLE ROW LEVEL SECURITY;

-- Remittances: Finance + HR Admin + super_admin only
DROP POLICY IF EXISTS payroll_remittances_rw ON public.payroll_remittances;
CREATE POLICY payroll_remittances_rw ON public.payroll_remittances
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role IN ('finance','hr_admin','super_admin')
  ));

-- Salary changes: HR Admin + super_admin (write); Finance + CEO (read)
DROP POLICY IF EXISTS salary_changes_write ON public.salary_changes;
CREATE POLICY salary_changes_write ON public.salary_changes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role IN ('hr_admin','super_admin')
  ));

DROP POLICY IF EXISTS salary_changes_read_finance ON public.salary_changes;
CREATE POLICY salary_changes_read_finance ON public.salary_changes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users_profile
    WHERE id = auth.uid() AND role IN ('finance','ceo','hr_admin','super_admin')
  ));

-- Grant table access
GRANT SELECT, INSERT, UPDATE ON TABLE public.payroll_remittances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.salary_changes TO authenticated;
GRANT SELECT ON public.v_ghost_worker_check TO authenticated;
GRANT SELECT ON public.v_payroll_headcount TO authenticated;

NOTIFY pgrst, 'reload schema';
