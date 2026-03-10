# Fix for Leave Types Color Column Error

## Problem
The `leave_types` table has a `color_code` column, but the frontend code expects a `color` column.

## Solution
Run the SQL migration script to rename the column for consistency.

## Steps to Fix

### 1. Run the SQL Migration

In your Supabase SQL Editor, run the following file:
```
supabase/fix_leave_types_color_column.sql
```

This script will:
- Rename `color_code` to `color` if needed
- Add default colors for existing leave types based on their names
- Handle edge cases (duplicate columns, missing columns)

### 2. Verify the Fix

After running the migration, verify with:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'leave_types' 
AND column_name IN ('color', 'color_code');
```

You should see only the `color` column.

### 3. Restart Your Frontend

The frontend code has been updated to handle both scenarios gracefully, but the migration ensures consistency.

## What Was Fixed

### Frontend Changes
- Updated `LeaveBalanceManagement.tsx` to query both `color_code` and `color`
- Added normalization logic to use whichever column exists
- Default color fallback: `#4F46E5`

### Database Migration
- Renames `color_code` → `color`
- Sets smart defaults based on leave type names:
  - Annual Leave: Blue (#3b82f6)
  - Sick Leave: Red (#ef4444)
  - Maternity: Pink (#ec4899)
  - Paternity: Purple (#8b5cf6)
  - Compassionate: Gray (#6b7280)
  - Study: Green (#10b981)
  - Unpaid: Orange (#f59e0b)
  - Default: Indigo (#4F46E5)

## Affected Components
- LeaveBalanceManagement
- LeaveTypeManagement
- ReportsAnalytics
- Dashboard (leave type displays)

## Alternative Quick Fix

If you can't run migrations immediately, the frontend will now work with either column name, but you'll see warnings in console logs.
