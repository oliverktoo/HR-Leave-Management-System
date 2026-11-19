-- Migration 025: OOO Assignment Pool
-- HOD creates assignments; employees apply by selecting from the open pool.
-- Approval routes to the HOD who CREATED the assignment, not the employee's HOD.

-- ============================================================
-- HELPER: generic updated_at function (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ============================================================
-- TABLE: ooo_assignments
-- Created by HOD/Admin before any employee can apply for OOO
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ooo_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                   TEXT NOT NULL,
    description             TEXT,

    -- Type matches ooo_requests.absence_type valid values
    assignment_type         TEXT NOT NULL CHECK (assignment_type IN (
                                'training', 'official_travel', 'official_assignment', 'emergency', 'other'
                            )),

    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL,
    location                TEXT,

    -- Special flags for non-standard working periods
    includes_weekend        BOOLEAN NOT NULL DEFAULT FALSE,
    includes_public_holiday BOOLEAN NOT NULL DEFAULT FALSE,

    -- Optional cap on how many employees can apply
    max_participants        INTEGER CHECK (max_participants > 0),

    -- The HOD who owns this assignment (and will approve requests)
    created_by              UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE RESTRICT,

    status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ooo_asgn_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_ooo_asgn_created_by ON public.ooo_assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_ooo_asgn_status     ON public.ooo_assignments(status);
CREATE INDEX IF NOT EXISTS idx_ooo_asgn_dates      ON public.ooo_assignments(start_date, end_date);

CREATE TRIGGER trg_ooo_asgn_updated_at
    BEFORE UPDATE ON public.ooo_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- ============================================================
-- Link ooo_requests → ooo_assignments
-- ============================================================
ALTER TABLE public.ooo_requests
    ADD COLUMN IF NOT EXISTS assignment_id UUID
        REFERENCES public.ooo_assignments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ooo_req_assignment ON public.ooo_requests(assignment_id);

-- ============================================================
-- RLS: ooo_assignments
-- ============================================================
ALTER TABLE public.ooo_assignments ENABLE ROW LEVEL SECURITY;

-- Every authenticated user can browse the open assignment pool
CREATE POLICY "ooo_asgn_select_open" ON public.ooo_assignments
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- HOD / HR / Admin can create assignments
CREATE POLICY "ooo_asgn_insert" ON public.ooo_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

-- The creator or HR/Admin can update (close, cancel, edit)
CREATE POLICY "ooo_asgn_update" ON public.ooo_assignments
    FOR UPDATE USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hr_admin', 'super_admin')
        )
    );

-- ============================================================
-- RLS: ooo_requests — add assignment-creator HOD visibility
-- The assignment-creating HOD must be able to see & update
-- requests that reference their assignments.
-- ============================================================
CREATE POLICY "ooo_hod_assignment_creator_select" ON public.ooo_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ooo_assignments oa
            WHERE oa.id = ooo_requests.assignment_id
              AND oa.created_by = auth.uid()
        )
    );

CREATE POLICY "ooo_hod_assignment_creator_update" ON public.ooo_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.ooo_assignments oa
            WHERE oa.id = ooo_requests.assignment_id
              AND oa.created_by = auth.uid()
        )
    );
