-- Migration 043: Disciplinary Cases & Grievances

-- Auto-generate case numbers
CREATE SEQUENCE IF NOT EXISTS disciplinary_case_seq START 1001;
CREATE SEQUENCE IF NOT EXISTS grievance_case_seq    START 2001;

CREATE TABLE IF NOT EXISTS public.disciplinary_cases (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number          TEXT UNIQUE NOT NULL
                         DEFAULT 'DC-' || LPAD(NEXTVAL('disciplinary_case_seq')::TEXT, 4, '0'),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id          TEXT NOT NULL,

  -- Incident
  incident_date        DATE NOT NULL,
  incident_description TEXT NOT NULL,
  category             TEXT NOT NULL
                         CHECK (category IN (
                           'misconduct', 'poor_performance', 'attendance',
                           'policy_violation', 'insubordination', 'fraud', 'other'
                         )),

  -- Action
  action_type          TEXT NOT NULL
                         CHECK (action_type IN (
                           'verbal_warning', 'written_warning', 'final_warning',
                           'suspension', 'demotion', 'dismissal', 'no_action'
                         )),
  action_date          DATE,
  outcome              TEXT,

  -- Workflow
  status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN (
                           'open', 'investigation', 'hearing_scheduled',
                           'hearing_done', 'closed', 'appealed'
                         )),

  -- Hearing
  hearing_date         TIMESTAMPTZ,
  hearing_notes        TEXT,
  employee_response    TEXT,

  -- Documents (array of URLs)
  document_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- HR tracking
  raised_by            UUID NOT NULL REFERENCES auth.users(id),
  assigned_to          UUID REFERENCES auth.users(id),
  closed_at            TIMESTAMPTZ,
  hr_notes             TEXT,
  is_confidential      BOOLEAN NOT NULL DEFAULT true,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disc_user   ON public.disciplinary_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_disc_status ON public.disciplinary_cases(status);

CREATE TABLE IF NOT EXISTS public.grievance_cases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number     TEXT UNIQUE NOT NULL
                    DEFAULT 'GR-' || LPAD(NEXTVAL('grievance_case_seq')::TEXT, 4, '0'),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id     TEXT NOT NULL,

  -- Details
  filed_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  grievance_type  TEXT NOT NULL
                    CHECK (grievance_type IN (
                      'harassment', 'discrimination', 'unfair_treatment',
                      'workplace_safety', 'pay_dispute', 'working_conditions',
                      'bullying', 'other'
                    )),
  description     TEXT NOT NULL,
  against_user_id UUID REFERENCES auth.users(id),   -- who the grievance is against

  -- Workflow
  status          TEXT NOT NULL DEFAULT 'submitted'
                    CHECK (status IN (
                      'submitted', 'acknowledged', 'investigation',
                      'mediation', 'resolved', 'closed', 'escalated'
                    )),
  resolution      TEXT,

  -- HR tracking
  assigned_to     UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  hr_notes        TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grievance_user   ON public.grievance_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_grievance_status ON public.grievance_cases(status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.disciplinary_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grievance_cases    ENABLE ROW LEVEL SECURITY;

-- HR full access on disciplinary
CREATE POLICY "hr_manage_disciplinary" ON public.disciplinary_cases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Employee can read their own disciplinary case (but not confidential notes)
CREATE POLICY "staff_own_disciplinary" ON public.disciplinary_cases
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- HR full access on grievances
CREATE POLICY "hr_manage_grievances" ON public.grievance_cases
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Employee can see and submit their own grievance
CREATE POLICY "staff_own_grievance" ON public.grievance_cases
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
