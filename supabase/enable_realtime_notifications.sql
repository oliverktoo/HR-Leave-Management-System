-- Enable Realtime for notifications table
-- This allows frontend to subscribe to real-time changes

-- Enable realtime replication for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Verify it's enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'notifications';
