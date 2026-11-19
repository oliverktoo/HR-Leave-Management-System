-- Migration 027: Re-point field table FKs from auth.users → public.users_profile
-- PostgREST embedded joins only work when the FK is within the public schema.
-- auth.users is in the auth schema, so supervisor:supervisor_id(...) and
-- profile:user_id(...) joins all fail with "relationship not found in schema cache".
--
-- All IDs are the same values (users_profile.id = auth.users.id), so this is
-- purely a constraint pointer change — no data migration needed.

-- ============================================================
-- field_assignments
-- ============================================================
ALTER TABLE public.field_assignments
    DROP CONSTRAINT IF EXISTS field_assignments_supervisor_id_fkey,
    DROP CONSTRAINT IF EXISTS field_assignments_created_by_fkey,
    DROP CONSTRAINT IF EXISTS field_assignments_hr_closed_by_fkey;

ALTER TABLE public.field_assignments
    ADD CONSTRAINT field_assignments_supervisor_id_fkey
        FOREIGN KEY (supervisor_id) REFERENCES public.users_profile(id) ON DELETE RESTRICT,
    ADD CONSTRAINT field_assignments_created_by_fkey
        FOREIGN KEY (created_by) REFERENCES public.users_profile(id) ON DELETE RESTRICT,
    ADD CONSTRAINT field_assignments_hr_closed_by_fkey
        FOREIGN KEY (hr_closed_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

-- ============================================================
-- field_assignment_employees
-- ============================================================
ALTER TABLE public.field_assignment_employees
    DROP CONSTRAINT IF EXISTS field_assignment_employees_user_id_fkey,
    DROP CONSTRAINT IF EXISTS field_assignment_employees_added_by_fkey;

ALTER TABLE public.field_assignment_employees
    ADD CONSTRAINT field_assignment_employees_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE,
    ADD CONSTRAINT field_assignment_employees_added_by_fkey
        FOREIGN KEY (added_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

-- ============================================================
-- field_clock_logs
-- ============================================================
ALTER TABLE public.field_clock_logs
    DROP CONSTRAINT IF EXISTS field_clock_logs_user_id_fkey,
    DROP CONSTRAINT IF EXISTS field_clock_logs_verified_by_fkey;

ALTER TABLE public.field_clock_logs
    ADD CONSTRAINT field_clock_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE,
    ADD CONSTRAINT field_clock_logs_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

-- ============================================================
-- field_activity_logs
-- ============================================================
ALTER TABLE public.field_activity_logs
    DROP CONSTRAINT IF EXISTS field_activity_logs_user_id_fkey,
    DROP CONSTRAINT IF EXISTS field_activity_logs_acknowledged_by_fkey;

ALTER TABLE public.field_activity_logs
    ADD CONSTRAINT field_activity_logs_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE,
    ADD CONSTRAINT field_activity_logs_acknowledged_by_fkey
        FOREIGN KEY (acknowledged_by) REFERENCES public.users_profile(id) ON DELETE SET NULL;

-- Tell PostgREST to reload its schema cache so the new FK relationships are visible
NOTIFY pgrst, 'reload schema';
