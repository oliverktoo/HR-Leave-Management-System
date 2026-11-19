-- Migration 048: Add 'auditor' to role check constraint
-- Auditor has read-only access to all HR data — same views as hr_admin, no write actions.

ALTER TABLE public.users_profile
  DROP CONSTRAINT IF EXISTS chk_role;

ALTER TABLE public.users_profile
  ADD CONSTRAINT chk_role CHECK (role IN (
    'employee',
    'hod',
    'hr_admin',
    'super_admin',
    'fleet_manager',
    'driver',
    'finance',
    'ceo',
    'auditor'
  ));

-- Also update secondary_role constraint if it exists
ALTER TABLE public.users_profile
  DROP CONSTRAINT IF EXISTS chk_secondary_role;

ALTER TABLE public.users_profile
  ADD CONSTRAINT chk_secondary_role CHECK (
    secondary_role IS NULL OR secondary_role IN (
      'employee',
      'hod',
      'hr_admin',
      'super_admin',
      'fleet_manager',
      'driver',
      'finance',
      'ceo',
      'auditor'
    )
  );

NOTIFY pgrst, 'reload schema';
