-- Migration 028: Ensure HOD can see OOO requests for assignments they created
-- This migration is fully idempotent: it drops the policies first so it can be
-- re-run safely if the earlier migration 025 had any issue.

-- ============================================================
-- Ensure assignment_id column exists (in case 025 was never run)
-- ============================================================
ALTER TABLE public.ooo_requests
    ADD COLUMN IF NOT EXISTS assignment_id UUID
        REFERENCES public.ooo_assignments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ooo_req_assignment ON public.ooo_requests(assignment_id);

-- ============================================================
-- Recreate HOD assignment-creator policies (idempotent)
-- ============================================================
DROP POLICY IF EXISTS "ooo_hod_assignment_creator_select" ON public.ooo_requests;
DROP POLICY IF EXISTS "ooo_hod_assignment_creator_update" ON public.ooo_requests;

-- HOD can SELECT any request that links to an assignment they created
CREATE POLICY "ooo_hod_assignment_creator_select" ON public.ooo_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.ooo_assignments oa
            WHERE oa.id = ooo_requests.assignment_id
              AND oa.created_by = auth.uid()
        )
    );

-- HOD can UPDATE (approve/reject) those same requests
CREATE POLICY "ooo_hod_assignment_creator_update" ON public.ooo_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.ooo_assignments oa
            WHERE oa.id = ooo_requests.assignment_id
              AND oa.created_by = auth.uid()
        )
    );

-- ============================================================
-- Notify PostgREST to reload schema
-- ============================================================
NOTIFY pgrst, 'reload schema';
