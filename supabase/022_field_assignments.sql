-- Migration 022: Field Assignment & Clock-In System
-- Attendance Module: Assignment-based field attendance tracking
-- Date: March 2026

-- ============================================================
-- TABLE: field_assignments
-- Created by HR/HOD before any field clock-in is valid
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    assignment_number       TEXT UNIQUE,
    title                   TEXT NOT NULL,
    description             TEXT,

    -- Location
    location_name           TEXT NOT NULL,
    location_county         TEXT,
    location_lat            NUMERIC(10, 7),
    location_lng            NUMERIC(10, 7),
    location_radius_m       INTEGER NOT NULL DEFAULT 500,

    -- Schedule
    planned_start           TIMESTAMPTZ NOT NULL,
    planned_end             TIMESTAMPTZ NOT NULL,

    -- Ownership
    created_by              UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    supervisor_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    department_id           UUID REFERENCES public.departments(id) ON DELETE SET NULL,

    -- Deliverables (JSONB array of { item: string, completed: boolean })
    expected_deliverables   JSONB NOT NULL DEFAULT '[]',

    -- Status
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                                'draft', 'active', 'in_progress', 'completed', 'cancelled'
                            )),

    -- Closure
    hr_closed               BOOLEAN NOT NULL DEFAULT FALSE,
    hr_closed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hr_closed_at            TIMESTAMPTZ,
    hr_notes                TEXT,

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fa_end_after_start CHECK (planned_end > planned_start)
);

CREATE INDEX IF NOT EXISTS idx_fa_supervisor  ON public.field_assignments(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_fa_dept        ON public.field_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_fa_status      ON public.field_assignments(status);
CREATE INDEX IF NOT EXISTS idx_fa_dates       ON public.field_assignments(planned_start, planned_end);

-- Auto-generate assignment number: FA-YYYY-NNNN
CREATE OR REPLACE FUNCTION generate_assignment_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_year  TEXT := TO_CHAR(NOW(), 'YYYY');
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) + 1 INTO v_count
    FROM public.field_assignments
    WHERE TO_CHAR(created_at, 'YYYY') = v_year;
    NEW.assignment_number := 'FA-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_fa_assignment_number
    BEFORE INSERT ON public.field_assignments
    FOR EACH ROW WHEN (NEW.assignment_number IS NULL)
    EXECUTE FUNCTION generate_assignment_number();

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_fa_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_fa_updated_at
    BEFORE UPDATE ON public.field_assignments
    FOR EACH ROW EXECUTE FUNCTION set_fa_updated_at();

-- ============================================================
-- TABLE: field_assignment_employees
-- Many-to-many: which employees are on each assignment
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_assignment_employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES public.field_assignments(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    added_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fae_assignment ON public.field_assignment_employees(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fae_user       ON public.field_assignment_employees(user_id);

-- ============================================================
-- TABLE: field_clock_logs
-- One record per employee per clock-in/out event
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_clock_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID NOT NULL REFERENCES public.field_assignments(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Clock-in
    clock_in_time       TIMESTAMPTZ NOT NULL,
    clock_in_lat        NUMERIC(10, 7),
    clock_in_lng        NUMERIC(10, 7),
    clock_in_accuracy   NUMERIC(8, 2),
    clock_in_note       TEXT,
    clock_in_photo_url  TEXT,
    clock_in_offline    BOOLEAN NOT NULL DEFAULT FALSE,

    -- Clock-out
    clock_out_time      TIMESTAMPTZ,
    clock_out_lat       NUMERIC(10, 7),
    clock_out_lng       NUMERIC(10, 7),
    clock_out_accuracy  NUMERIC(8, 2),
    clock_out_note      TEXT,
    clock_out_offline   BOOLEAN NOT NULL DEFAULT FALSE,

    -- End-of-assignment report
    end_report          TEXT,
    deliverables_status JSONB DEFAULT '[]',  -- [{ item, completed, notes }]
    mileage_km          NUMERIC(8, 2),
    expenses_submitted  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Supervisor verification
    verified_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    verified_at         TIMESTAMPTZ,
    verification_status TEXT CHECK (verification_status IN ('verified', 'flagged')),
    supervisor_notes    TEXT,

    -- Work duration (computed on clock-out)
    work_hours          NUMERIC(5, 2),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fcl_assignment ON public.field_clock_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fcl_user       ON public.field_clock_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_fcl_time       ON public.field_clock_logs(clock_in_time);

CREATE TRIGGER trg_fcl_updated_at
    BEFORE UPDATE ON public.field_clock_logs
    FOR EACH ROW EXECUTE FUNCTION set_fa_updated_at();

-- ============================================================
-- TABLE: field_activity_logs
-- Daily activity entries submitted during multi-day assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES public.field_assignments(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date        DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Content
    activities_done     TEXT NOT NULL,
    people_engaged      TEXT,
    issues_blockers     TEXT,
    resources_used      TEXT,

    -- Acknowledgement
    acknowledged_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    acknowledged_at     TIMESTAMPTZ,

    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (assignment_id, user_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_fal_assignment ON public.field_activity_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fal_user       ON public.field_activity_logs(user_id);

-- ============================================================
-- RLS: field_assignments
-- ============================================================
ALTER TABLE public.field_assignments ENABLE ROW LEVEL SECURITY;

-- Assigned employees can see their assignments
CREATE POLICY "fa_select_assigned" ON public.field_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.field_assignment_employees fae
            WHERE fae.assignment_id = field_assignments.id
              AND fae.user_id = auth.uid()
        )
    );

-- Supervisors see their assignments
CREATE POLICY "fa_select_supervisor" ON public.field_assignments
    FOR SELECT USING (supervisor_id = auth.uid());

-- HR/HOD/Admin see all
CREATE POLICY "fa_select_admin" ON public.field_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

-- HR/HOD create and manage
CREATE POLICY "fa_insert_admin" ON public.field_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

CREATE POLICY "fa_update_admin" ON public.field_assignments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
        OR created_by = auth.uid()
    );

-- ============================================================
-- RLS: field_assignment_employees
-- ============================================================
ALTER TABLE public.field_assignment_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fae_select_own" ON public.field_assignment_employees
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "fae_select_admin" ON public.field_assignment_employees
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

CREATE POLICY "fae_manage_admin" ON public.field_assignment_employees
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

-- ============================================================
-- RLS: field_clock_logs
-- ============================================================
ALTER TABLE public.field_clock_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fcl_select_own" ON public.field_clock_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "fcl_select_supervisor" ON public.field_clock_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.field_assignments fa
            WHERE fa.id = field_clock_logs.assignment_id
              AND fa.supervisor_id = auth.uid()
        )
    );

CREATE POLICY "fcl_select_admin" ON public.field_clock_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

CREATE POLICY "fcl_insert_own" ON public.field_clock_logs
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.field_assignment_employees fae
            WHERE fae.assignment_id = field_clock_logs.assignment_id
              AND fae.user_id = auth.uid()
        )
    );

CREATE POLICY "fcl_update_own" ON public.field_clock_logs
    FOR UPDATE USING (user_id = auth.uid() AND clock_out_time IS NULL);

CREATE POLICY "fcl_update_supervisor" ON public.field_clock_logs
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.field_assignments fa
            WHERE fa.id = field_clock_logs.assignment_id
              AND fa.supervisor_id = auth.uid()
        )
    );

-- ============================================================
-- RLS: field_activity_logs
-- ============================================================
ALTER TABLE public.field_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fal_select_own" ON public.field_activity_logs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "fal_select_supervisor" ON public.field_activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.field_assignments fa
            WHERE fa.id = field_activity_logs.assignment_id
              AND fa.supervisor_id = auth.uid()
        )
    );

CREATE POLICY "fal_select_admin" ON public.field_activity_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

CREATE POLICY "fal_insert_own" ON public.field_activity_logs
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.field_assignment_employees fae
            WHERE fae.assignment_id = field_activity_logs.assignment_id
              AND fae.user_id = auth.uid()
        )
    );

CREATE POLICY "fal_update_own_same_day" ON public.field_activity_logs
    FOR UPDATE USING (
        user_id = auth.uid()
        AND log_date = CURRENT_DATE
    );

COMMENT ON TABLE public.field_assignments IS 'Field deployment assignments created by HR/HOD before field staff can clock in';
COMMENT ON TABLE public.field_assignment_employees IS 'Employees assigned to a specific field assignment';
COMMENT ON TABLE public.field_clock_logs IS 'GPS-stamped clock-in/out records for field assignments';
COMMENT ON TABLE public.field_activity_logs IS 'Daily activity logs submitted by employees during field assignments';
