-- Migration 052: Fix missing GRANTs on OOO tables + ensure all policies are correct
-- ─────────────────────────────────────────────────────────────────────────────
-- Root cause: PostgreSQL checks object-level permissions BEFORE RLS policies.
-- Without GRANT SELECT/INSERT/UPDATE TO authenticated, the authenticated role is
-- blocked silently — queries return empty arrays with no error, so the UI shows
-- "No Open Assignments" even though rows exist and RLS would allow access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── ooo_assignments ─────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.ooo_assignments TO authenticated;

-- Ensure the open-pool SELECT policy exists (idempotent)
DROP POLICY IF EXISTS "ooo_asgn_select_open" ON public.ooo_assignments;
CREATE POLICY "ooo_asgn_select_open" ON public.ooo_assignments
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Ensure INSERT policy exists (idempotent)
DROP POLICY IF EXISTS "ooo_asgn_insert" ON public.ooo_assignments;
CREATE POLICY "ooo_asgn_insert" ON public.ooo_assignments
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hod', 'hr_admin', 'super_admin')
        )
    );

-- Ensure UPDATE policy exists (idempotent)
DROP POLICY IF EXISTS "ooo_asgn_update" ON public.ooo_assignments;
CREATE POLICY "ooo_asgn_update" ON public.ooo_assignments
    FOR UPDATE USING (
        created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.users_profile up
            WHERE up.id = auth.uid()
              AND up.role IN ('hr_admin', 'super_admin')
        )
    );

-- ─── ooo_requests ────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON TABLE public.ooo_requests TO authenticated;

-- Employee cancel policy (idempotent — replaces the weaker one from migration 021)
DROP POLICY IF EXISTS "ooo_update_own_cancel" ON public.ooo_requests;
DROP POLICY IF EXISTS "ooo_employee_cancel"   ON public.ooo_requests;
CREATE POLICY "ooo_employee_cancel" ON public.ooo_requests
    FOR UPDATE
    USING  (user_id = auth.uid() AND status = 'pending')
    WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

-- ─── ooo_blackout_periods ────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ooo_blackout_periods TO authenticated;

-- ─── Sequence grants ─────────────────────────────────────────────────────────

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ─── Reload PostgREST schema cache ───────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
