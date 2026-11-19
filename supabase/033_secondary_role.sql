-- Migration 033: Add secondary_role to users_profile
-- Allows a user to hold two roles (e.g. Finance Officer who is also HOD Finance).
-- Primary role drives the main sidebar; secondary role merges extra menu groups
-- and grants access to routes restricted to that role.

ALTER TABLE public.users_profile
  ADD COLUMN IF NOT EXISTS secondary_role text
  CHECK (secondary_role IS NULL OR secondary_role IN (
    'employee','hod','hr_admin','super_admin',
    'finance','ceo','fleet_manager','driver'
  ));

COMMENT ON COLUMN public.users_profile.secondary_role IS
  'Optional second role. Both primary role and secondary_role are checked for route access and sidebar menus.';

-- Index for role-based queries
CREATE INDEX IF NOT EXISTS idx_users_profile_secondary_role
  ON public.users_profile(secondary_role)
  WHERE secondary_role IS NOT NULL;

NOTIFY pgrst, 'reload schema';
