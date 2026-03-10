# Fix Leave Balances RLS Policy Error

## Problem
When HR admins try to update employee leave balances, they get:
```
Error: new row violates row-level security policy for table "leave_balances"
```

## Root Cause
The RLS policy `hr_manage_balances` was missing the `WITH CHECK` clause, which is required for INSERT and UPDATE operations in PostgreSQL RLS.

## Solution
Run the SQL script: `fix_leave_balances_rls.sql`

This script:
1. Drops the incomplete RLS policy
2. Recreates it with both `USING` and `WITH CHECK` clauses
3. Adds support for `super_admin` role
4. Verifies the policy is correctly applied

## How to Apply

### In Supabase SQL Editor:
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `fix_leave_balances_rls.sql`
3. Click "Run"
4. Verify you see 3 policies for `leave_balances` table

### Expected Result:
After running the script, you should see these policies:
- `users_view_own_balances` (SELECT)
- `hod_view_department_balances` (SELECT)
- `hr_manage_balances` (ALL with both USING and WITH CHECK)

## Testing
After applying the fix, try these actions as HR admin:
- ✅ View all employee leave balances
- ✅ Update employee leave allocations
- ✅ Apply default allocations to employees
- ✅ Bulk apply defaults to all employees

## What This Fixes
The `WITH CHECK` clause ensures that:
- HR admins can INSERT new leave balance records
- HR admins can UPDATE existing leave balance records
- Super admins also have full access
- Regular employees still can only view their own balances

## Additional Notes
- The trigger function `update_leave_balance()` uses `SECURITY DEFINER`, which bypasses RLS when updating balances automatically
- This fix maintains security while giving admins the necessary permissions
