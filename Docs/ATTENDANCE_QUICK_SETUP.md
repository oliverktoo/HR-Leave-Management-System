# Quick Setup: Staff Attendance System

## 🚀 Quick Start (5 Minutes)

### Step 1: Setup Database (2 minutes)

1. Open Supabase Dashboard
2. Go to **SQL Editor**
3. Create a new query
4. Copy the entire contents of `supabase/setup_attendance_system.sql`
5. Paste and click **RUN**
6. Wait for success message

✅ **Expected Result**: Tables created, policies enabled, triggers active

### Step 2: Verify Installation (1 minute)

Run this query in SQL Editor to verify:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('attendance_records', 'attendance_settings');

-- Check if default settings exist
SELECT * FROM attendance_settings;
```

✅ **Expected Result**: 2 tables found, 1 settings row returned

### Step 3: Test Staff Check-In (2 minutes)

1. Log in as any staff member
2. Click **"🕐 Attendance"** in the menu
3. Click **"Check In Now"**
4. Verify check-in time appears

✅ **Expected Result**: Success message, check-in time displayed

## 📋 Verification Checklist

- [ ] Database tables created successfully
- [ ] Default settings row exists
- [ ] Staff can access `/attendance` page
- [ ] Staff can check in
- [ ] Staff can check out
- [ ] Admin can access `/admin/attendance`
- [ ] Admin can see all records
- [ ] Export to CSV works

## 🎯 First-Time Configuration

### Configure Work Hours (Admin Only)

1. Log in as **HR Admin** or **Super Admin**
2. Navigate to **Admin Dashboard** → **Attendance**
3. Click **Settings** tab
4. Click **Edit Settings**
5. Set your organization's work hours:
   - Work Start Time: `08:00` (8:00 AM)
   - Work End Time: `17:00` (5:00 PM)
   - Late Threshold: `15` minutes
6. Click **Save Settings**

### Test the System

#### As Staff Member
```
1. Login as regular employee
2. Go to Attendance page
3. Check in
4. Wait a few minutes (or test later)
5. Check out
6. View your calculated work hours
```

#### As Administrator
```
1. Login as HR Admin
2. Go to Admin Attendance
3. View the attendance record created above
4. Try exporting to CSV
5. Edit the record (optional)
```

## ⚙️ Quick Settings Reference

| Setting | Default | Recommended | Purpose |
|---------|---------|-------------|---------|
| Work Start Time | 08:00 | Your start time | When work officially begins |
| Work End Time | 17:00 | Your end time | When work officially ends |
| Late Threshold | 15 min | 10-30 min | Minutes after start = "Late" |
| Grace Period | 5 min | 5-10 min | Buffer before marking late |
| Half Day Hours | 4.0 | 4.0 | Hours for half day |
| Full Day Hours | 8.0 | 8.0 | Hours for full day |
| Location Tracking | OFF | OFF | GPS coordinates (optional) |
| Require Checkout | ON | ON | Must check out daily |

## 🔧 Common Issues & Quick Fixes

### "Cannot check in" Error

**Cause**: Already checked in today  
**Fix**: One check-in per day allowed. Check out first.

### "Not authenticated" Error

**Cause**: Session expired  
**Fix**: Refresh page and log in again

### Work hours showing 0.00

**Cause**: Haven't checked out yet  
**Fix**: Complete check-out to calculate hours (database trigger)

### Can't see attendance menu

**Cause**: Not logged in or wrong permissions  
**Fix**: Log in with valid credentials, refresh browser

## 📊 Daily Operations

### Morning Routine (Staff)
1. Arrive at work
2. Open HR system
3. Click Attendance
4. Check in

### Evening Routine (Staff)
1. Before leaving
2. Open Attendance page
3. Check out
4. Verify hours are correct

### Daily Admin Tasks
1. Check for missed check-outs
2. Review late arrivals
3. Correct any errors

### Monthly Admin Tasks
1. Export attendance data
2. Generate summary reports
3. Share with management/payroll

## 🎓 Training Your Team

### For Staff (5-minute training)

**Show them**:
1. Where to find Attendance page (🕐 icon in menu)
2. How to check in (one button click)
3. How to check out (one button click)
4. Where to see their statistics

**Key points**:
- Check in when arriving
- Check out when leaving
- Can add notes (optional)
- View your own history and stats

### For Admins (10-minute training)

**Show them**:
1. Admin Attendance page location
2. How to filter records
3. How to edit/delete records
4. How to export data
5. How to configure settings

**Key points**:
- Review daily for missed check-outs
- Export monthly for records
- Edit only when necessary
- Keep settings consistent

## 📱 Mobile Usage

The system is fully responsive:
- Works on any smartphone/tablet
- Same login credentials
- Same check-in/out process
- Optimized touch interface

**Best Practice**: Add website to home screen for quick access

### iOS
1. Open Safari → HR system
2. Tap Share button
3. Tap "Add to Home Screen"

### Android
1. Open Chrome → HR system
2. Tap Menu (⋮)
3. Tap "Add to Home Screen"

## 🎉 You're Ready!

Your Staff Attendance System is now fully operational.

**Next Steps**:
1. Inform all staff about the new system
2. Provide brief training (5 minutes)
3. Monitor usage for first week
4. Adjust settings as needed

**Need Help?**  
Refer to the complete guide: `Docs/ATTENDANCE_SYSTEM_GUIDE.md`

---

**Quick Reference Card**

| Role | Access | Key Feature |
|------|--------|-------------|
| **All Staff** | `/attendance` | Check in/out daily |
| **HOD** | View dept. records | Monitor team |
| **HR Admin** | `/admin/attendance` | Full management |

**Support**: Check Supabase logs for any errors
