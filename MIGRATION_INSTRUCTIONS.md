# Apply Delete User Function Migration

## Run this SQL in Supabase Dashboard

1. Go to: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw/sql/new

2. Copy and paste the contents of: `supabase/migrations/005_admin_delete_user_function.sql`

3. Click "Run" to execute

## What This Does

- Creates a secure database function `delete_user_admin()`
- Only HR Admin and Super Admin can execute it
- Prevents self-deletion
- Properly handles cascading deletes
- Logs all deletions in audit_logs

## After Running Migration

The delete user functionality will work properly for HR Admin and Super Admin users!

**Note**: This deletes the user profile and all related data (leave requests, balances, etc.) but does NOT delete the auth.users record. This is intentional as only Supabase service role can delete auth users, and exposing that key in the frontend would be a security risk.

If you need to also delete the auth.users record, you'll need to:
1. Use Supabase Edge Functions with service role key (more complex)
2. Or manually delete from Supabase Dashboard → Authentication → Users
