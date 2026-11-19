-- Fix: add hod_approved to leave_request_history chk_action constraint
-- The trigger inserts NEW.status as the action, so hod_approved must be allowed.

ALTER TABLE public.leave_request_history
  DROP CONSTRAINT IF EXISTS chk_action;

ALTER TABLE public.leave_request_history
  ADD CONSTRAINT chk_action
  CHECK (action IN ('submitted', 'pending', 'hod_approved', 'approved', 'rejected', 'cancelled'));
