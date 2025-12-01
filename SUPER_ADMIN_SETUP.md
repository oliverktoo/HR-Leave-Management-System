# Super Admin Setup Guide - Oliver Kiptook

## Overview
Created a **super_admin** role for oliverkiptook@gmail.com with full system access that is hidden from regular HR administrator user lists.

---

## Database Setup (Required First)

### Step 1: Create Auth User in Supabase Dashboard

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Create the User**
   - Go to: **Authentication** → **Users**
   - Click: **Invite User** or **Add User**
   - Enter:
     - Email: `oliverkiptook@gmail.com`
     - Password: Set a temporary password OR send invitation
   - ✅ Check: **Auto Confirm User**
   - Click: **Create User**

3. **Copy the User ID**
   - After creation, find the user in the list
   - Copy the **UUID** (looks like: `a1b2c3d4-...`)
   - You'll need this for the next step

### Step 2: Run the SQL Migration

1. **Open SQL Editor**
   - In Supabase Dashboard: **SQL Editor** → **New Query**

2. **Open the SQL File**
   - File location: `supabase/setup_oliver_super_admin.sql`
   - Copy all contents

3. **Update User ID**
   - Find this line: `v_user_id UUID := 'USER_ID_HERE';`
   - Replace `'USER_ID_HERE'` with the actual UUID you copied
   - Example: `v_user_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';`

4. **Execute the SQL**
   - Paste into SQL Editor
   - Click: **Run**
   - Check for success messages

5. **Verify Creation**
   - The script will output verification query results
   - You should see:
     - Email: oliverkiptook@gmail.com
     - Role: super_admin
     - Name: Oliver Kiptook
     - Employee ID: SUPER001

---

## What Was Changed

### 1. Database Changes (`setup_oliver_super_admin.sql`)

✅ **Added super_admin role** to database constraint
```sql
ALTER TABLE users_profile 
ADD CONSTRAINT chk_role CHECK (role IN ('employee', 'hod', 'hr_admin', 'super_admin'));
```

✅ **Created System Administration department** (if not exists)

✅ **Created user profile** with super_admin role

✅ **Added RLS policies** for full system access:
- View/update/insert/delete all user profiles
- Manage all leave requests
- Manage all leave balances
- Manage all departments
- Manage all leave types
- Manage all public holidays
- View all audit logs
- Manage all notifications

✅ **Created hr_visible_users view** - Excludes super_admin from HR user lists

### 2. Frontend Changes

#### TypeScript Types (`frontend/src/types/index.ts`)
```typescript
export type UserRole = 'employee' | 'hod' | 'hr_admin' | 'super_admin';
```

#### Admin Sidebar (`frontend/src/components/admin/AdminSidebar.tsx`)
```typescript
case 'super_admin':
  return 'System Administrator';
```

#### User Management (`frontend/src/components/admin/UserManagement.tsx`)
```typescript
.neq('role', 'super_admin')  // Hide super_admin from user list
```

#### App Routes (`frontend/src/App.tsx`)
All admin routes updated to allow super_admin:
```typescript
<ProtectedRoute allowedRoles={['hr_admin', 'super_admin']}>
```

---

## Super Admin Capabilities

### Full Access
✅ All admin dashboard features
✅ User management (create, edit, deactivate)
✅ Leave type management
✅ Reports & analytics
✅ Public holidays management
✅ System settings
✅ Bulk operations
✅ Team calendar
✅ Approvals

### Hidden from HR Admin
❌ **Not visible** in User Management lists
❌ **Not visible** in department user lists
❌ **Not visible** in regular reports
✅ **Only visible** to other super_admins (if more are created)

### Special Properties
- Employee ID: `SUPER001`
- Job Title: System Administrator
- Department: System Administration
- Role Display: "System Administrator"

---

## Testing the Setup

### 1. Login as Oliver
1. Go to: http://localhost:5173/login
2. Email: `oliverkiptook@gmail.com`
3. Password: (the one set during user creation)

### 2. Verify Access
✅ Should see "System Administrator" in sidebar
✅ Can access all admin tabs
✅ Can see all users, leave requests, etc.

### 3. Verify Hidden Status
1. Login as a regular HR admin
2. Go to User Management
3. Oliver's account should **not appear** in the list

---

## Security Notes

### Access Control
- **Database-level**: RLS policies enforce access (most important)
- **Frontend-level**: Route guards prevent unauthorized navigation (UX only)
- **Hidden from view**: Regular HR admins cannot see super_admin users

### Best Practices
1. ✅ Keep super_admin accounts to minimum (only Oliver currently)
2. ✅ Use strong passwords
3. ✅ Enable 2FA in Supabase if available
4. ✅ Monitor audit logs for super_admin activity
5. ✅ Regular password rotation

---

## Troubleshooting

### "User does not exist" Error
**Problem**: SQL script fails with user not found
**Solution**: Create auth user in Supabase Dashboard first (Step 1 above)

### "Role violation" Error  
**Problem**: Database rejects super_admin role
**Solution**: Ensure constraint was updated (check Step 1 of SQL script)

### Can't see admin pages
**Problem**: Oliver can't access admin dashboard
**Solution**: 
- Check user profile has `role = 'super_admin'`
- Clear browser cache/localStorage
- Check ProtectedRoute includes 'super_admin' in allowedRoles

### Still visible in user lists
**Problem**: Super admin appears in User Management
**Solution**: Check UserManagement.tsx has `.neq('role', 'super_admin')` filter

---

## Future Management

### To Create Another Super Admin
1. Create auth user in Supabase Dashboard
2. Modify `setup_oliver_super_admin.sql`:
   - Change email address
   - Change employee_id (e.g., SUPER002)
   - Change first_name/last_name
3. Run the modified SQL

### To Remove Super Admin Status
```sql
UPDATE users_profile 
SET role = 'hr_admin'  -- or 'employee'
WHERE email = 'oliverkiptook@gmail.com';
```

### To Deactivate Super Admin
```sql
UPDATE users_profile 
SET is_active = false
WHERE email = 'oliverkiptook@gmail.com';
```

---

## Files Modified/Created

### Created
- ✅ `supabase/setup_oliver_super_admin.sql` - Database setup script

### Modified
- ✅ `frontend/src/types/index.ts` - Added super_admin role
- ✅ `frontend/src/components/admin/AdminSidebar.tsx` - Role display
- ✅ `frontend/src/components/admin/UserManagement.tsx` - Hide super_admin
- ✅ `frontend/src/App.tsx` - Route access permissions

---

## Compilation Status

✅ **TypeScript**: 0 errors
✅ **All types updated**: UserRole includes 'super_admin'
✅ **All routes protected**: super_admin can access all admin routes
✅ **User hidden**: .neq('role', 'super_admin') filters applied

---

## Summary

**Super admin account created for:**
- 📧 Email: oliverkiptook@gmail.com
- 👤 Name: Oliver Kiptook
- 🎫 Employee ID: SUPER001
- 🔑 Role: super_admin
- 🏢 Department: System Administration
- 👁️ Visibility: Hidden from HR admins
- 🔓 Access: Full system access

**Ready to use after completing database setup steps above!**
