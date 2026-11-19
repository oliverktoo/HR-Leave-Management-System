-- Migration 024: Remove annual_leave and sick_leave from OOO absence types
-- These are already captured in the Leave Request module.
-- OOO is for: training, official_travel, official_assignment, emergency, other.

-- Remap any existing rows that used the old leave types
UPDATE public.ooo_requests SET absence_type = 'other' WHERE absence_type IN ('annual_leave', 'sick_leave');

-- Drop and recreate the absence_type CHECK constraint
ALTER TABLE public.ooo_requests
    DROP CONSTRAINT IF EXISTS ooo_requests_absence_type_check;

ALTER TABLE public.ooo_requests
    ADD CONSTRAINT ooo_requests_absence_type_check
        CHECK (absence_type IN (
            'training',
            'official_travel',
            'official_assignment',
            'emergency',
            'other'
        ));

-- Also tighten the blackout_type to match
ALTER TABLE public.ooo_blackout_periods
    DROP CONSTRAINT IF EXISTS ooo_blackout_periods_blackout_type_check;

ALTER TABLE public.ooo_blackout_periods
    ADD CONSTRAINT ooo_blackout_periods_blackout_type_check
        CHECK (blackout_type IN (
            'all',
            'training',
            'official_travel',
            'official_assignment'
        ));
