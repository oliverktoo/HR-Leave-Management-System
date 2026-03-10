# Fix Login Issue - "Invalid Password" Error

## Problem
You're getting "Invalid password" error when trying to log in.

## Quick Solutions

### Option 1: Reset Password for Existing User (oliverkiptook@gmail.com)

1. **Go to Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw
   - Navigate to: **SQL Editor**

2. **Run the Password Reset Script:**
   - Open the file: `supabase/RESET_PASSWORD.sql`
   - Copy all the SQL code
   - Paste it into Supabase SQL Editor
   - Click **RUN**

3. **Login with these credentials:**
   ```
   Email: oliverkiptook@gmail.com
   Password: Admin123!@#
   URL: http://localhost:5177/
   ```

---

### Option 2: Create New Test Admin User

1. **Go to Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw
   - Navigate to: **SQL Editor**

2. **Run the Test Admin Script:**
   - Open the file: `supabase/CREATE_TEST_ADMIN.sql`
   - Copy all the SQL code
   - Paste it into Supabase SQL Editor
   - Click **RUN**

3. **Login with these credentials:**
   ```
   Email: admin@test.com
   Password: TestAdmin123!
   URL: http://localhost:5177/
   ```

---

### Option 3: Create User via Supabase Dashboard

If the SQL scripts don't work, you can create a user manually:

1. **Go to Supabase Dashboard:**
   - Open: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw
   - Navigate to: **Authentication → Users**

2. **Create New User:**
   - Click **"Add user"** or **"Invite user"**
   - Enter email: `test@fkf.com`
   - Enter password: `Test123!@#`
   - Make sure "Auto Confirm User" is checked
   - Click **"Create user"**

3. **Copy the User ID** that gets generated (UUID format)

4. **Create User Profile:**
   - Go to **SQL Editor**
   - Run this script (replace `YOUR_USER_ID` with the actual ID):
   
   ```sql
   DO $$
   DECLARE
       v_user_id uuid := 'YOUR_USER_ID'; -- Paste the UUID here
       v_hr_dept_id uuid;
   BEGIN
       -- Get HR department
       SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'Human Resources' LIMIT 1;
       
       -- Create profile
       INSERT INTO users_profile (
           id, email, first_name, last_name, employee_id,
           role, department_id, hire_date, is_active
       ) VALUES (
           v_user_id,
           'test@fkf.com',
           'Test',
           'User',
           'EMP-TEST',
           'hr_admin',
           v_hr_dept_id,
           CURRENT_DATE,
           true
       );
       
       -- Create leave balances
       INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days)
       SELECT v_user_id, id, 2026, max_days_per_year
       FROM leave_types WHERE is_active = true;
       
       RAISE NOTICE 'User created successfully!';
   END $$;
   ```

5. **Login:**
   ```
   Email: test@fkf.com
   Password: Test123!@#
   ```

---

## Common Issues & Fixes

### Issue: "User not found"
**Solution:** The user needs to exist in both:
- `auth.users` table (authentication)
- `users_profile` table (application data)

Run one of the SQL scripts above to create both.

### Issue: "Email not confirmed"
**Solution:** The scripts automatically confirm the email. Or manually:
1. Go to **Authentication → Users** in Supabase
2. Find your user
3. Click on the user
4. Make sure "Email Confirmed" shows a date

### Issue: Still can't login after running script
**Solution:** Try these steps:
1. Clear browser cache and cookies
2. Open browser in incognito/private mode
3. Try the URL: http://localhost:5177/login
4. Check Supabase Dashboard → Authentication → Policies to ensure RLS is configured

---

## Default Test Credentials Summary

After running the scripts, you should have these working accounts:

| Email | Password | Role | Script |
|-------|----------|------|--------|
| oliverkiptook@gmail.com | Admin123!@# | HR Admin | RESET_PASSWORD.sql |
| admin@test.com | TestAdmin123! | HR Admin | CREATE_TEST_ADMIN.sql |
| test@fkf.com | Test123!@# | HR Admin | Manual creation |

---

## Still Having Issues?

If none of these work, please check:

1. **Supabase Project Status:**
   - Ensure your Supabase project is active and running
   - Check: https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw

2. **Network Connection:**
   - Make sure you can access Supabase from your location
   - Check the browser console (F12) for any error messages

3. **Environment Variables:**
   - Verify `.env` file has correct Supabase URL and keys
   - The file is located at: `frontend/.env`

4. **Database Tables:**
   - Ensure all required tables exist in your Supabase database
   - Check: **Database → Tables** in Supabase Dashboard
