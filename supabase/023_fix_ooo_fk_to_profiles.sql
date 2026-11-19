-- Migration 023: Fix ooo_requests FK references to point to users_profile
-- Problem: user_id / hod_id / hr_reviewer_id reference auth.users, so PostgREST
--          cannot follow them to users_profile for embedded joins.
-- Fix:     Re-point the FKs to public.users_profile(id) which holds first_name etc.
--          users_profile.id = auth.users.id, so no data changes are required.

-- user_id
ALTER TABLE public.ooo_requests
    DROP CONSTRAINT IF EXISTS ooo_requests_user_id_fkey;
ALTER TABLE public.ooo_requests
    ADD CONSTRAINT ooo_requests_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users_profile(id) ON DELETE CASCADE;

-- hod_id
ALTER TABLE public.ooo_requests
    DROP CONSTRAINT IF EXISTS ooo_requests_hod_id_fkey;
ALTER TABLE public.ooo_requests
    ADD CONSTRAINT ooo_requests_hod_id_fkey
        FOREIGN KEY (hod_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;

-- hr_reviewer_id
ALTER TABLE public.ooo_requests
    DROP CONSTRAINT IF EXISTS ooo_requests_hr_reviewer_id_fkey;
ALTER TABLE public.ooo_requests
    ADD CONSTRAINT ooo_requests_hr_reviewer_id_fkey
        FOREIGN KEY (hr_reviewer_id) REFERENCES public.users_profile(id) ON DELETE SET NULL;
