-- Migration 044: Performance Appraisals
-- Appraisal cycles, KPI-based employee reviews, probation reviews

CREATE TABLE IF NOT EXISTS public.appraisal_cycles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  cycle_type            TEXT NOT NULL
                          CHECK (cycle_type IN ('annual', 'mid_year', 'quarterly', 'probation')),
  year                  INTEGER NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  self_assessment_due   DATE,
  manager_review_due    DATE,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appraisal_cycles_status ON public.appraisal_cycles(status);

-- Per-employee appraisal record within a cycle
CREATE TABLE IF NOT EXISTS public.employee_appraisals (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id                  UUID NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id               TEXT NOT NULL,
  reviewer_id               UUID REFERENCES auth.users(id),  -- HOD / line manager

  -- KPIs: array of { title, description, weight_pct, target, actual, self_score, manager_score }
  kpis                      JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Scores (out of 5)
  self_overall_score        NUMERIC(3,1),
  manager_overall_score     NUMERIC(3,1),
  final_score               NUMERIC(3,1),

  -- Comments
  self_assessment_comments  TEXT,
  manager_comments          TEXT,
  hr_comments               TEXT,

  -- Workflow
  status                    TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN (
                                'pending', 'self_assessment', 'manager_review',
                                'hr_review', 'completed'
                              )),
  self_submitted_at         TIMESTAMPTZ,
  manager_submitted_at      TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,

  -- Outcome
  rating                    TEXT CHECK (rating IN (
                              'exceptional', 'exceeds_expectations',
                              'meets_expectations', 'needs_improvement', 'unsatisfactory'
                            )),
  recommended_action        TEXT,  -- 'salary_review', 'promotion', 'pip', 'termination', 'none'

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(cycle_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_appraisal_cycle    ON public.employee_appraisals(cycle_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_user     ON public.employee_appraisals(user_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_reviewer ON public.employee_appraisals(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_appraisal_status   ON public.employee_appraisals(status);

-- Lightweight probation review (linked to a contract)
CREATE TABLE IF NOT EXISTS public.probation_reviews (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_id  UUID REFERENCES public.employee_contracts(id) ON DELETE SET NULL,
  review_date  DATE NOT NULL,
  outcome      TEXT NOT NULL
                 CHECK (outcome IN ('pass', 'extend', 'fail')),
  extension_weeks INTEGER,
  comments     TEXT,
  reviewed_by  UUID NOT NULL REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_probation_user ON public.probation_reviews(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.appraisal_cycles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_appraisals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probation_reviews   ENABLE ROW LEVEL SECURITY;

-- HR full access on cycles
CREATE POLICY "hr_manage_cycles" ON public.appraisal_cycles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- All authenticated users can read active cycles
CREATE POLICY "staff_read_cycles" ON public.appraisal_cycles
  FOR SELECT TO authenticated
  USING (status IN ('active', 'completed'));

-- HR full access on appraisals
CREATE POLICY "hr_manage_appraisals" ON public.employee_appraisals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Employee can see and update their own appraisal (for self-assessment)
CREATE POLICY "staff_own_appraisal" ON public.employee_appraisals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reviewer (HOD) can see appraisals they are assigned to review
CREATE POLICY "reviewer_appraisals" ON public.employee_appraisals
  FOR ALL TO authenticated
  USING (reviewer_id = auth.uid());

-- HR full access on probation reviews
CREATE POLICY "hr_manage_probation" ON public.probation_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Employee reads their own probation review
CREATE POLICY "staff_own_probation" ON public.probation_reviews
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
