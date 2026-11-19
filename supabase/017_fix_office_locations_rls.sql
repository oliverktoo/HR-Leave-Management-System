-- Migration 017: Fix office_locations RLS policies
-- The table has GRANT permissions but no RLS policies, blocking all writes.
-- This adds policies so hr_admin/super_admin can manage office locations,
-- and all authenticated users can read active locations.

-- Enable RLS (safe to run if already enabled)
ALTER TABLE office_locations ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "office_locations_select_all" ON office_locations;
DROP POLICY IF EXISTS "office_locations_insert_admins" ON office_locations;
DROP POLICY IF EXISTS "office_locations_update_admins" ON office_locations;
DROP POLICY IF EXISTS "office_locations_delete_admins" ON office_locations;

-- ── SELECT: all authenticated users can read office locations ────────────
CREATE POLICY "office_locations_select_all"
ON office_locations
FOR SELECT
TO authenticated
USING (true);

-- ── INSERT: only hr_admin and super_admin can add locations ─────────────
CREATE POLICY "office_locations_insert_admins"
ON office_locations
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role IN ('hr_admin', 'super_admin')
  )
);

-- ── UPDATE: only hr_admin and super_admin can edit locations ────────────
CREATE POLICY "office_locations_update_admins"
ON office_locations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role IN ('hr_admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role IN ('hr_admin', 'super_admin')
  )
);

-- ── DELETE: only hr_admin and super_admin can delete locations ──────────
CREATE POLICY "office_locations_delete_admins"
ON office_locations
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
      AND role IN ('hr_admin', 'super_admin')
  )
);

-- Ensure sequence grant is in place (needed for SERIAL id inserts)
GRANT USAGE, SELECT ON SEQUENCE office_locations_id_seq TO authenticated;

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'office_locations';
