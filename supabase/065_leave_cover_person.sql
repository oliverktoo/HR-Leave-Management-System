-- Migration 065: Add cover_person to leave_requests
-- Who will cover the employee's duties during their absence. Mandatory at submission.

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS cover_person TEXT;

COMMENT ON COLUMN public.leave_requests.cover_person IS
  'Name of the colleague covering the employee during their leave absence.';

NOTIFY pgrst, 'reload schema';
