-- Simple test to see actual HTTP response
-- This will return a table with results we can see

WITH test_request AS (
  SELECT id FROM leave_requests WHERE status = 'pending' LIMIT 1
),
http_call AS (
  SELECT 
    (http((
      'POST',
      'https://nmvdagfduojwbsxgqkjw.supabase.co/functions/v1/send-email',
      ARRAY[http_header('Content-Type', 'application/json')],
      'application/json',
      json_build_object(
        'type', 'request_approved',
        'requestId', (SELECT id FROM test_request)
      )::text
    )::http_request)).*
)
SELECT 
  status as http_status,
  content as response_body,
  content_type
FROM http_call;
