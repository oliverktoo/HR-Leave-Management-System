-- Migration 041: Exit Management / Offboarding
-- Resignation, retirement, termination workflow with clearance checklist

CREATE TABLE IF NOT EXISTS public.exit_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id           TEXT NOT NULL,

  exit_type             TEXT NOT NULL
                          CHECK (exit_type IN (
                            'resignation', 'retirement', 'termination',
                            'contract_end', 'mutual_agreement'
                          )),
  notice_date           DATE NOT NULL,
  last_working_date     DATE NOT NULL,
  reason                TEXT,

  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN (
                            'pending', 'acknowledged', 'in_progress',
                            'clearance', 'completed', 'cancelled'
                          )),

  -- Clearance checklist stored as JSONB array
  -- Each item: { key, label, cleared, cleared_by_name, cleared_at, notes }
  clearance_items       JSONB NOT NULL DEFAULT '[
    {"key": "it_equipment",   "label": "IT Equipment Returned",         "cleared": false},
    {"key": "access_cards",   "label": "Access Cards / Keys Returned",  "cleared": false},
    {"key": "company_assets", "label": "Company Assets Returned",       "cleared": false},
    {"key": "handover",       "label": "Work Handover Completed",       "cleared": false},
    {"key": "finance",        "label": "Finance Clearance",             "cleared": false},
    {"key": "hr_clearance",   "label": "HR Clearance",                  "cleared": false},
    {"key": "final_payroll",  "label": "Final Payroll Processed",       "cleared": false}
  ]'::jsonb,

  -- Exit interview
  exit_interview_done   BOOLEAN NOT NULL DEFAULT false,
  exit_interview_date   DATE,
  exit_interview_notes  TEXT,

  -- HR tracking
  acknowledged_by       UUID REFERENCES auth.users(id),
  acknowledged_at       TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  hr_notes              TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exit_user   ON public.exit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_exit_status ON public.exit_requests(status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.exit_requests ENABLE ROW LEVEL SECURITY;

-- HR full access
CREATE POLICY "hr_manage_exits" ON public.exit_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- HOD can see their department's exits
CREATE POLICY "hod_view_exits" ON public.exit_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile ep
      JOIN public.users_profile hod ON hod.department_id = ep.department_id
      WHERE ep.id = exit_requests.user_id
        AND hod.id = auth.uid()
        AND hod.role = 'hod'
    )
  );

-- Employee can see and create their own exit request
CREATE POLICY "staff_own_exit" ON public.exit_requests
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
