# Super Admin Setup Guide
## Fixing "Lacking Full Dashboard" Issue

### Problem
Super admin user (oliverkiptook@gmail.com) cannot see the full admin dashboard because the database hasn't been configured with super_admin RLS policies yet.

### Solution - Complete These Steps in Order

---

## Step 1: Check Current Status

1. Go to your **Supabase Dashboard** → **SQL Editor**
2. Run the diagnostic script: `check_super_admin_access.sql`
3. Review the results:
   - **Check 1**: Should show your user with `role='super_admin'`
   - **Check 2**: Should show constraint includes `'super_admin'`
   - **Check 3**: Should list multiple RLS policies for super_admin
   - **Check 4**: Should show data counts > 0

If any check fails, proceed to Step 2.

---

## Step 2: Get Your User ID

### Option A: From Supabase Dashboard
1. Go to **Authentication** → **Users**
2. Find user: `oliverkiptook@gmail.com`
3. Click on the user
4. Copy the **UUID** (looks like: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

### Option B: From SQL Editor
Run this query:
```sql
SELECT id, email FROM auth.users WHERE email = 'oliverkiptook@gmail.com';
```
Copy the `id` value.

---

## Step 3: Update the Setup Script

1. Open file: `supabase/setup_oliver_super_admin.sql`
2. Find line 26:
   ```sql
   v_user_id UUID := 'USER_ID_HERE'; -- REPLACE THIS WITH ACTUAL USER ID
   ```
3. Replace `USER_ID_HERE` with your actual UUID:
   ```sql
   v_user_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; -- Your actual ID
   ```
4. Save the file

---

## Step 4: Run the Setup Script

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **New Query**
3. Copy the **entire contents** of `setup_oliver_super_admin.sql` (after updating the UUID)
4. Paste into SQL Editor
5. Click **Run** or press **Ctrl+Enter**

### Expected Output:
```
NOTICE: Created System Administration department
NOTICE: Super admin profile created for oliverkiptook@gmail.com
Success: RLS policies created for super_admin role
```

If you see errors:
- **"User ID does not exist"**: Check you used the correct UUID from Step 2
- **"Duplicate key value"**: Profile already exists, that's OK
- **"Syntax error"**: Make sure you copied the entire script

---

## Step 5: Verify Super Admin Access

1. **Logout** from the application (important!)
2. **Login** again as `oliverkiptook@gmail.com`
3. You should now see:
   - ✅ Full Admin Dashboard
   - ✅ All user statistics (excluding other super_admins)
   - ✅ Recent activity
   - ✅ System alerts
   - ✅ All admin menu items (Users, Reports, Analytics, etc.)

---

## Step 6: Re-run Diagnostic (Optional)

Run `check_super_admin_access.sql` again to confirm all 4 checks pass.

---

## Troubleshooting

### Issue: "Still can't see dashboard"

**Check 1: Is RLS enabled on tables?**
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('users_profile', 'leave_requests', 'departments');
```
All should show `rowsecurity = true`.

**Check 2: Are policies created?**
```sql
SELECT COUNT(*) FROM pg_policies WHERE policyname LIKE '%super_admin%';
```
Should show at least 15 policies.

**Check 3: Is your role actually super_admin?**
```sql
SELECT email, role FROM users_profile WHERE email = 'oliverkiptook@gmail.com';
```
Should show `role = 'super_admin'`.

### Issue: "Error: permission denied for table users_profile"

This means RLS policies aren't working. Re-run `setup_oliver_super_admin.sql`.

### Issue: "Dashboard shows 0 users, 0 requests"

This means:
1. Either the database is empty (run seed.sql to add initial data)
2. Or RLS policies are blocking access (re-run setup script)

---

## Quick Fix Command

If you just want to quickly grant super_admin access without running the full script:

```sql
-- Update existing user to super_admin
UPDATE users_profile 
SET role = 'super_admin' 
WHERE email = 'oliverkiptook@gmail.com';

-- Then run the RLS policies section from setup_oliver_super_admin.sql
-- (Lines 87-250)
```

---

## Need Help?

- **Database logs**: Check Supabase Dashboard → Logs → Postgres Logs
- **Browser console**: Open DevTools (F12) → Console tab, check for errors
- **Test query**: Run this as super_admin:
  ```sql
  SELECT COUNT(*) FROM users_profile;
  ```
  If it returns 0 or errors, RLS policies aren't working.

---

## After Successful Setup

You should have:
- ✅ Super admin profile with `role='super_admin'`
- ✅ 17+ RLS policies for super_admin role
- ✅ Full access to all tables and data
- ✅ Hidden from regular HR admin user lists
- ✅ Access to all admin dashboard features

The admin dashboard will show all system statistics, recent activity, and give you full control over users, departments, leave types, holidays, and reports.
