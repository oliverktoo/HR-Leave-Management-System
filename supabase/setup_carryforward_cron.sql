-- Setup Cron Job for Year-End Carryforward
-- This script configures pg_cron to run the process-carryforward Edge Function annually

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;

-- Schedule year-end carryforward to run on January 1st at 2:00 AM every year
-- Format: '0 2 1 1 *' = minute hour day month day_of_week
-- This runs at 2:00 AM on January 1st

-- First, remove any existing job with the same name to avoid duplicates
SELECT cron.unschedule('year-end-carryforward');

-- Create the scheduled job
SELECT cron.schedule(
    'year-end-carryforward',           -- Job name
    '0 2 1 1 *',                       -- Cron schedule (2:00 AM on Jan 1st)
    $$
    SELECT
      net.http_post(
        url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := '{}'::jsonb
      ) as request_id;
    $$
);

-- Query to check scheduled jobs
SELECT * FROM cron.job WHERE jobname = 'year-end-carryforward';

-- NOTE: The service_role_key needs to be set as a custom setting
-- Run this command in Supabase SQL Editor (replace YOUR_SERVICE_ROLE_KEY):
-- ALTER DATABASE postgres SET app.settings.service_role_key TO 'YOUR_SERVICE_ROLE_KEY';

-- To manually test the carryforward process before January 1st, run:
-- SELECT net.http_post(
--   url := 'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/process-carryforward',
--   headers := '{"Content-Type": "application/json"}'::jsonb,
--   body := '{}'::jsonb
-- );
