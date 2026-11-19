-- Migration 026: Allow employees to cancel their own pending OOO requests
-- The USING clause restricts to rows they own and that are still pending.
-- The WITH CHECK clause ensures they can only set status = 'cancelled'.

CREATE POLICY "ooo_employee_cancel" ON public.ooo_requests
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND status = 'pending'
    )
    WITH CHECK (
        user_id = auth.uid()
        AND status = 'cancelled'
    );
