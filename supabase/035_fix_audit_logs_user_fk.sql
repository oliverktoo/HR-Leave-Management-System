-- Migration 035: Fix audit_logs user_id FK to allow user deletion
-- Problem: when a user is deleted, audit triggers fire and try to INSERT
-- a new audit_logs row with the deleted user's ID. Because the user row
-- is already gone the FK check fails, blocking the deletion entirely.
--
-- Fix: drop the FK constraint. Audit logs are append-only historical
-- records — they do not need live referential integrity to users_profile.
-- The user_id column is kept as a plain nullable UUID reference.

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
