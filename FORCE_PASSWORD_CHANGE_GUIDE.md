# Force Password Change After Admin Reset

This feature ensures that when an HR admin resets a user's password, the user is automatically prompted to change it on their next login.

---

## 🎯 How It Works

### User Experience Flow:

1. **Admin resets password** → Flag is set (`must_change_password = TRUE`)
2. **User logs in** with new password → Automatically redirected to Change Password page
3. **User creates their own password** → Flag is cleared (`must_change_password = FALSE`)
4. **User can now access the system** normally

---

## 🔧 Setup Instructions

### Step 1: Run the Database Migration

1. **Go to Supabase SQL Editor:**
   ```
   https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw/sql
   ```

2. **Run the migration script:**
   - Open file: `supabase/add_force_password_change.sql`
   - Copy all content
   - Paste into SQL Editor
   - Click **"RUN"**

3. **Verify success:**
   - You should see: "✅ Force Password Change functionality added successfully!"

### What This Migration Does:

✅ Adds `must_change_password` column to `users_profile` table  
✅ Updates `admin_reset_user_password()` function to set the flag  
✅ Updates `reset_employee_password()` function to set the flag  
✅ Creates `clear_must_change_password()` function to clear the flag  

---

## 📋 User Experience

### For Employees (After Admin Reset):

1. **Login with temporary password:**
   - Use the password given by HR admin
   - System detects password was reset by admin

2. **Automatic redirect:**
   - Immediately redirected to "Password Reset Required" page
   - Cannot access any other pages until password is changed
   - No "current password" field (they just logged in with it)

3. **Create new password:**
   - Enter new password (meets requirements)
   - Confirm new password
   - Click "Change Password"

4. **Access granted:**
   - Redirected to dashboard
   - Full system access restored
   - Can use the system normally

### For HR Admins:

1. **Reset user password:**
   - Go to User Management
   - Click "⋮" → "Reset Password"
   - Generate or enter new password
   - System automatically sets the force-change flag

2. **Share credentials:**
   - Copy the temporary password
   - Share with user securely (phone/WhatsApp)
   - Inform them: "You'll be prompted to change it when you log in"

3. **User changes password:**
   - Flag is automatically cleared
   - User can access system
   - No further action needed from admin

---

## 🔐 Security Features

### Immediate Password Change:
- ✅ User cannot skip password change
- ✅ User cannot access any page except change password
- ✅ Old temporary password is invalid after change

### Smart Detection:
- ✅ System detects if password was reset by admin
- ✅ No "current password" required (they just used it to login)
- ✅ Prevents confusion for users

### Audit Trail:
- ✅ All password resets logged in `audit_logs`
- ✅ Tracks who reset the password
- ✅ Tracks when user changed it
- ✅ Full accountability

---

## 💻 Technical Details

### Database Changes:

**New Column:**
```sql
ALTER TABLE users_profile 
ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE;
```

**Updated Functions:**
- `admin_reset_user_password(user_id, password)` - Sets flag to TRUE
- `reset_employee_password(email, password)` - Sets flag to TRUE
- `clear_must_change_password()` - Sets flag to FALSE (called after password change)

### Frontend Changes:

**1. Type Definition** (`types/index.ts`):
```typescript
export interface UserProfile {
  // ... other fields
  must_change_password?: boolean;
}
```

**2. Protected Route** (`components/ProtectedRoute.tsx`):
```typescript
// Checks must_change_password flag
if (profile?.must_change_password && location.pathname !== '/change-password') {
  return <Navigate to="/change-password" replace />;
}
```

**3. Change Password Component** (`components/auth/ChangePassword.tsx`):
- Detects forced change via `profile.must_change_password`
- Hides "current password" field if forced
- Calls `clear_must_change_password()` after successful change
- Uses `window.location.href` to fully refresh auth state

---

## 🎬 Complete Workflow Example

### Scenario: Employee "John Doe" forgot password

**1. HR Admin Action:**
```
Admin Panel → User Management → Find "John Doe"
→ Click "⋮" → Reset Password
→ Generate Password: "Temp@123Pass"
→ Copy password → Reset
→ Call John: "Your temporary password is Temp@123Pass"
```

**Behind the scenes:**
```sql
-- System automatically sets:
UPDATE users_profile 
SET must_change_password = TRUE 
WHERE id = 'john-uuid';
```

**2. John Attempts Login:**
```
Login Page → Enter email and "Temp@123Pass"
→ Login successful
→ REDIRECTED to "/change-password" (automatic!)
```

**3. John Sees:**
```
🔐 Password Reset Required

Your password was reset by an administrator. 
For security, you must create a new password 
before accessing the system.

[No current password field - he just logged in with it]

New Password: ___________
Confirm Password: ___________

Requirements:
✓ At least 8 characters
✓ One uppercase letter
✓ One lowercase letter
✓ One number
✓ One special character
```

**4. John Creates New Password:**
```
New Password: "MySecure@Pass2026"
Confirm: "MySecure@Pass2026"
→ Click "Change Password"
```

**Behind the scenes:**
```sql
-- Password updated in auth.users
-- Flag cleared:
UPDATE users_profile 
SET must_change_password = FALSE 
WHERE id = 'john-uuid';

-- Audit log created
INSERT INTO audit_logs (action, user_id) 
VALUES ('password_changed_by_user', 'john-uuid');
```

**5. John's Experience:**
```
"Password changed successfully!"
→ Redirected to Dashboard
→ Full access to system
→ Can work normally
```

---

## 🐛 Troubleshooting

### User stuck on change password page

**Problem:** User changed password but still redirected to change password  
**Solution:**
```sql
-- Manually clear the flag
UPDATE users_profile 
SET must_change_password = FALSE 
WHERE email = 'user@example.com';
```

### Flag not being set after admin reset

**Problem:** User can access system without changing password  
**Solution:**
- Ensure `add_force_password_change.sql` was run
- Check function exists:
```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'reset_employee_password';
```

### Frontend not detecting flag

**Problem:** User not redirected even though flag is TRUE  
**Solution:**
- Clear browser cache
- Check profile is loading: Open DevTools → Console → Check `profile` object
- Verify flag in database:
```sql
SELECT email, must_change_password 
FROM users_profile 
WHERE email = 'user@example.com';
```

---

## 📊 Monitoring

### Check users who need to change passwords:

```sql
SELECT 
  email,
  first_name,
  last_name,
  must_change_password,
  updated_at
FROM users_profile
WHERE must_change_password = TRUE;
```

### View password reset audit trail:

```sql
SELECT 
  al.created_at,
  al.action,
  up.email as target_user,
  admin.email as admin_user,
  al.new_data
FROM audit_logs al
LEFT JOIN users_profile up ON up.id = al.record_id
LEFT JOIN users_profile admin ON admin.id = al.user_id
WHERE al.action IN ('password_reset_by_admin', 'password_changed_by_user')
ORDER BY al.created_at DESC
LIMIT 20;
```

### Clear flag for all users (emergency):

```sql
-- Use with caution!
UPDATE users_profile 
SET must_change_password = FALSE 
WHERE must_change_password = TRUE;
```

---

## ✅ Testing Checklist

After deployment, test the following:

### ✓ Admin Reset Flow:
1. [ ] Admin can reset user password via User Management
2. [ ] Success message mentions "User will be required to change password"
3. [ ] Audit log entry created

### ✓ User Login Flow:
1. [ ] User logs in with temporary password
2. [ ] Automatically redirected to /change-password
3. [ ] Cannot navigate to /dashboard or other pages
4. [ ] "Password Reset Required" header shown
5. [ ] No "Current Password" field visible

### ✓ Password Change Flow:
1. [ ] User can enter new password
2. [ ] Password requirements validated
3. [ ] Confirmation works correctly
4. [ ] After clicking "Change Password", redirected to dashboard
5. [ ] User can access all pages normally

### ✓ Database State:
1. [ ] `must_change_password = TRUE` after admin reset
2. [ ] `must_change_password = FALSE` after user changes password
3. [ ] Audit logs contain both actions

---

## 🎁 Benefits

### For Users:
- ✅ Clear guidance on what to do
- ✅ No confusion about "current password"
- ✅ Smooth, secure password change experience
- ✅ Immediate access after password change

### For HR Admins:
- ✅ Confidence that users will create secure passwords
- ✅ No need to manually follow up
- ✅ Full audit trail for compliance
- ✅ Reduces password-related support tickets

### For Organization:
- ✅ Enhanced security (no reuse of temporary passwords)
- ✅ Compliance with password policies
- ✅ Reduced risk of unauthorized access
- ✅ Complete accountability

---

## 🚀 Summary

**Setup:**
1. Run `supabase/add_force_password_change.sql` ✅

**That's it!** The feature works automatically:
- ✅ Admin resets password → Flag set
- ✅ User logs in → Redirected to change password
- ✅ User creates new password → Flag cleared
- ✅ User accesses system → Normal operation

**No manual intervention needed after initial setup!** 🎉
