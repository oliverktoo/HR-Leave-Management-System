# Remote Supabase Connection Status

## ✅ Connection Established

### Configuration
- **Supabase URL**: https://nmvdagfduojwbsxgqkjw.supabase.co
- **Environment**: Remote (Supabase Cloud)
- **Frontend**: Running on http://localhost:5179
- **Status**: Connected ✓

## Database Verification Checklist

### Required Tables (9 total)
Run this query in Supabase Dashboard → SQL Editor to verify:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

Expected tables:
- [ ] audit_logs
- [ ] departments
- [ ] leave_balances
- [ ] leave_request_history
- [ ] leave_requests
- [ ] leave_types
- [ ] notifications
- [ ] public_holidays
- [ ] users_profile

### Seed Data Verification

#### 1. Departments (should have 5)
```sql
SELECT id, name FROM departments ORDER BY name;
```
Expected: HR, IT, Finance, Operations, Marketing

#### 2. Leave Types (should have 6)
```sql
SELECT name, max_days_per_year FROM leave_types WHERE is_active = true ORDER BY name;
```
Expected: Annual Leave (21), Sick Leave (14), Maternity (90), Paternity (10), Compassionate (5), Study (10)

#### 3. Public Holidays 2025 (should have 10)
```sql
SELECT date, name FROM public_holidays WHERE date >= '2025-01-01' ORDER BY date;
```
Expected: New Year, Good Friday, Easter Monday, Labour Day, Madaraka Day, Huduma Day, Mashujaa Day, Jamhuri Day, Christmas, Boxing Day

## Next Steps

### 1. Create First Admin User
Since you can now access the login page, you need to create an admin user:

**Option A: Via Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw/auth/users
2. Click "Invite user" or "Add user"
3. Enter email and temporary password
4. After user signs up, run this SQL to make them admin:

```sql
UPDATE users_profile 
SET role = 'hr_admin', 
    department_id = '00000000-0000-0000-0000-000000000001'  -- HR department
WHERE email = 'your-admin@example.com';
```

**Option B: Via SQL (if signup is enabled)**
```sql
-- After user creates account via signup, update their profile:
UPDATE users_profile 
SET role = 'hr_admin',
    department_id = '00000000-0000-0000-0000-000000000001',
    is_active = true
WHERE email = 'your-admin@example.com';
```

### 2. Test Login Flow
1. Navigate to: http://localhost:5179/login
2. Login with admin credentials
3. Should redirect to: http://localhost:5179/dashboard
4. Verify you see admin menu options

### 3. Verify RLS Policies
If you get errors like "permission denied" or "insufficient privileges":
- Check Supabase logs: Dashboard → Logs → Postgres Logs
- Verify RLS policies were created (from 002_triggers_and_rls.sql)
- Ensure user profile exists in `users_profile` table

## Troubleshooting

### Issue: "Missing Supabase environment variables"
- Check `frontend/.env` file exists with correct values
- Restart Vite dev server after changing .env

### Issue: Login fails with "Invalid credentials"
- Verify user exists in Authentication → Users
- Check password is correct
- Ensure email is verified (or email confirmations disabled in auth settings)

### Issue: "Permission denied for table"
- RLS policies may not be set up
- Run 002_triggers_and_rls.sql migration
- Check user has `users_profile` record

### Issue: Dashboard shows no data
- Verify seed.sql was run
- Check browser console for errors
- Verify RLS policies allow user to read data

## Quick Database Check Commands

```bash
# Check if migrations were run (in Supabase Dashboard SQL Editor)

-- Check if triggers exist
SELECT trigger_name, event_object_table 
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- Check policies exist
SELECT tablename, policyname, permissive, cmd 
FROM pg_policies 
WHERE schemaname = 'public';
```

## Status Summary
- ✅ Frontend running and connected
- ✅ Environment variables configured
- ⏳ Awaiting database verification
- ⏳ Awaiting admin user creation
- ⏳ Awaiting login test
