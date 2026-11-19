-- Migration 042: Employment Contracts & Onboarding Checklists

CREATE TABLE IF NOT EXISTS public.employee_contracts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id           TEXT NOT NULL,

  contract_type         TEXT NOT NULL
                          CHECK (contract_type IN (
                            'permanent', 'fixed_term', 'probation',
                            'contract', 'internship', 'casual'
                          )),
  start_date            DATE NOT NULL,
  end_date              DATE,           -- NULL for permanent
  probation_end_date    DATE,

  job_title             TEXT,
  department_id         UUID REFERENCES public.departments(id),
  gross_salary          NUMERIC(12,2),

  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'expired', 'terminated', 'renewed', 'draft')),

  -- Renewal
  renewal_reminder_sent BOOLEAN NOT NULL DEFAULT false,
  renewed_to_id         UUID REFERENCES public.employee_contracts(id),

  -- Document storage
  document_url          TEXT,
  notes                 TEXT,

  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_user      ON public.employee_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status    ON public.employee_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date  ON public.employee_contracts(end_date)
  WHERE end_date IS NOT NULL AND status = 'active';

-- Onboarding checklist per employee (created when new contract is active)
CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id  TEXT NOT NULL,
  contract_id  UUID REFERENCES public.employee_contracts(id) ON DELETE SET NULL,

  -- JSONB array of tasks: { key, label, done, done_at, done_by_name, due_days, notes }
  tasks        JSONB NOT NULL DEFAULT '[
    {"key": "id_documents",      "label": "Submit ID / Passport Copy",          "done": false, "due_days": 1},
    {"key": "kra_pin",           "label": "Submit KRA PIN Certificate",          "done": false, "due_days": 3},
    {"key": "nssf_form",         "label": "Complete NSSF Registration",          "done": false, "due_days": 3},
    {"key": "sha_form",          "label": "Complete SHA Registration",           "done": false, "due_days": 3},
    {"key": "bank_details",      "label": "Submit Bank Account Details",         "done": false, "due_days": 5},
    {"key": "it_setup",          "label": "IT Equipment Setup Completed",        "done": false, "due_days": 5},
    {"key": "access_issued",     "label": "Access Card / Keys Issued",           "done": false, "due_days": 1},
    {"key": "emergency_contact", "label": "Emergency Contact Details Submitted", "done": false, "due_days": 7},
    {"key": "induction",         "label": "Induction / Orientation Completed",   "done": false, "due_days": 14}
  ]'::jsonb,

  status       TEXT NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'completed')),
  completed_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_user ON public.onboarding_checklists(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.employee_contracts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_checklists ENABLE ROW LEVEL SECURITY;

-- HR full access
CREATE POLICY "hr_manage_contracts" ON public.employee_contracts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

CREATE POLICY "hr_manage_onboarding" ON public.onboarding_checklists
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- HOD read access to their department contracts
CREATE POLICY "hod_read_contracts" ON public.employee_contracts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile ep
      JOIN public.users_profile hod
        ON hod.department_id = ep.department_id
      WHERE ep.id = employee_contracts.user_id
        AND hod.id = auth.uid()
        AND hod.role = 'hod'
    )
  );

-- Staff see their own contract and onboarding
CREATE POLICY "staff_own_contract" ON public.employee_contracts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff_own_onboarding" ON public.onboarding_checklists
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
