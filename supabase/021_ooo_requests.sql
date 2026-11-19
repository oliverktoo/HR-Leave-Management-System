-- Migration 021: Out of Office (OOO) Request System
-- Attendance Module: OOO requests, approvals, and blackout periods
-- Date: March 2026

-- ============================================================
-- TABLE: ooo_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ooo_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Submitter
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id         TEXT NOT NULL,
    department_id       UUID REFERENCES public.departments(id) ON DELETE SET NULL,

    -- Absence details
    absence_type        TEXT NOT NULL CHECK (absence_type IN (
                            'annual_leave', 'sick_leave', 'training',
                            'official_travel', 'official_assignment',
                            'emergency', 'other'
                        )),
    start_date          DATE NOT NULL,
    end_date            DATE NOT NULL,
    total_days          NUMERIC(4,1) NOT NULL,
    is_urgent           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Content
    reason              TEXT NOT NULL,
    handover_notes      TEXT,
    emergency_contact   TEXT,

    -- Workflow status
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending', 'hod_approved', 'hod_rejected',
                            'hr_approved', 'hr_rejected', 'cancelled'
                        )),
    payroll_flagged     BOOLEAN NOT NULL DEFAULT FALSE,

    -- HOD step
    hod_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hod_decision        TEXT CHECK (hod_decision IN ('approved', 'rejected', 'modification_requested')),
    hod_decision_at     TIMESTAMPTZ,
    hod_comments        TEXT,

    -- HR step
    hr_reviewer_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hr_decision         TEXT CHECK (hr_decision IN ('approved', 'rejected')),
    hr_decision_at      TIMESTAMPTZ,
    hr_comments         TEXT,

    -- Timestamps
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_ooo_user       ON public.ooo_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ooo_dept       ON public.ooo_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_ooo_status     ON public.ooo_requests(status);
CREATE INDEX IF NOT EXISTS idx_ooo_dates      ON public.ooo_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ooo_hod        ON public.ooo_requests(hod_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_ooo_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ooo_updated_at
    BEFORE UPDATE ON public.ooo_requests
    FOR EACH ROW EXECUTE FUNCTION set_ooo_updated_at();

-- ============================================================
-- TABLE: ooo_blackout_periods
-- Dates when leave/OOO is restricted (match days, AGM, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ooo_blackout_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    description     TEXT,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    blackout_type   TEXT NOT NULL DEFAULT 'all' CHECK (blackout_type IN (
                        'all', 'annual_leave', 'sick_leave', 'training',
                        'official_travel', 'official_assignment'
                    )),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT blackout_end_after_start CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_blackout_dates ON public.ooo_blackout_periods(start_date, end_date);

-- ============================================================
-- RLS: ooo_requests
-- ============================================================
ALTER TABLE public.ooo_requests ENABLE ROW LEVEL SECURITY;

-- Employees see their own requests
CREATE POLICY "ooo_select_own" ON public.ooo_requests
    FOR SELECT USING (auth.uid() = user_id);

-- HOD sees requests from their department
CREATE POLICY "ooo_select_hod" ON public.ooo_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'hod'
              AND up.department_id = ooo_requests.department_id
        )
    );

-- HR/Admin see all
CREATE POLICY "ooo_select_admin" ON public.ooo_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hr_admin', 'super_admin')
        )
    );

-- Employees create their own
CREATE POLICY "ooo_insert_own" ON public.ooo_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Employees can cancel their own pending requests
CREATE POLICY "ooo_update_own_cancel" ON public.ooo_requests
    FOR UPDATE USING (
        auth.uid() = user_id AND status = 'pending'
    );

-- HOD can update requests in their department (approve/reject)
CREATE POLICY "ooo_update_hod" ON public.ooo_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role = 'hod'
              AND up.department_id = ooo_requests.department_id
        )
        AND status = 'pending'
    );

-- HR/Admin can update any
CREATE POLICY "ooo_update_admin" ON public.ooo_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hr_admin', 'super_admin')
        )
    );

-- ============================================================
-- RLS: ooo_blackout_periods
-- ============================================================
ALTER TABLE public.ooo_blackout_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blackout_select_all_auth" ON public.ooo_blackout_periods
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "blackout_manage_admin" ON public.ooo_blackout_periods
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hr_admin', 'super_admin')
        )
    );

-- ============================================================
-- RPC: get_ooo_summary — per-employee OOO day counts by type
-- ============================================================
CREATE OR REPLACE FUNCTION get_ooo_summary(
    p_user_id   UUID DEFAULT NULL,
    p_year      SMALLINT DEFAULT EXTRACT(YEAR FROM NOW())::SMALLINT
)
RETURNS TABLE (
    user_id         UUID,
    absence_type    TEXT,
    approved_days   NUMERIC,
    pending_days    NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT
        r.user_id,
        r.absence_type,
        COALESCE(SUM(CASE WHEN r.status = 'hr_approved' THEN r.total_days ELSE 0 END), 0) AS approved_days,
        COALESCE(SUM(CASE WHEN r.status IN ('pending', 'hod_approved') THEN r.total_days ELSE 0 END), 0) AS pending_days
    FROM public.ooo_requests r
    WHERE (p_user_id IS NULL OR r.user_id = p_user_id)
      AND EXTRACT(YEAR FROM r.start_date) = p_year
    GROUP BY r.user_id, r.absence_type;
$$;

GRANT EXECUTE ON FUNCTION get_ooo_summary(UUID, SMALLINT) TO authenticated;

-- ============================================================
-- RPC: check_blackout_conflict — returns conflicting blackouts
-- ============================================================
CREATE OR REPLACE FUNCTION check_blackout_conflict(
    p_start_date    DATE,
    p_end_date      DATE,
    p_absence_type  TEXT DEFAULT 'all'
)
RETURNS TABLE (
    blackout_id     UUID,
    title           TEXT,
    start_date      DATE,
    end_date        DATE
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT b.id, b.title, b.start_date, b.end_date
    FROM public.ooo_blackout_periods b
    WHERE b.is_active = TRUE
      AND b.start_date <= p_end_date
      AND b.end_date   >= p_start_date
      AND (b.blackout_type = 'all' OR b.blackout_type = p_absence_type)
    ORDER BY b.start_date;
$$;

GRANT EXECUTE ON FUNCTION check_blackout_conflict(DATE, DATE, TEXT) TO authenticated;

COMMENT ON TABLE public.ooo_requests IS 'Out of Office requests submitted by employees, approved by HOD then HR';
COMMENT ON TABLE public.ooo_blackout_periods IS 'Restricted dates when OOO requests of certain types cannot be approved';
