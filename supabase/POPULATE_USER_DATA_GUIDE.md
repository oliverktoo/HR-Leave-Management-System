# Display Real User Data - Complete Setup Guide

## Problem
Users logging into the system see empty dashboards with no leave balances or data displayed.

## Root Cause
Leave balance records haven't been created for employees in the database. The dashboard queries `leave_balances` table, but if no records exist for a user, they see zeros or empty states.

---

## 📋 **Complete Setup Steps**

### Step 1: Master Setup (Run First) ⭐ RECOMMENDED
**File:** `master_setup.sql`

This is an **all-in-one script** that handles everything automatically:
- ✅ Fixes color column issues
- ✅ Fixes RLS policies for leave_balances
- ✅ Creates leave types with colors
- ✅ Creates departments
- ✅ Sets up system settings
- ✅ Adds public holidays for 2026
- ✅ Verifies everything was created

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste `master_setup.sql`
3. Click "Run"
4. Verify you see "✅ MASTER SETUP COMPLETE!"

**This replaces Steps 1-3 below.** If you run this, skip to Step 2 (Populate Leave Balances).

---

### Alternative: Step-by-Step Setup

#### Step 1a: Setup Base Data
**File:** `setup_base_data.sql`

This ensures all required foundation data exists:
- ✅ Leave types (Annual, Sick, Maternity, etc.)
- ✅ Departments  
- ✅ System settings with default allocations
- ✅ Public holidays for 2026

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy and paste `setup_base_data.sql`
3. Click "Run"
4. Verify you see "✅ SETUP COMPLETE!"

---

### Step 2: Populate Leave Balances (Run Second)
**File:** `populate_all_leave_balances.sql`

This creates leave balance records for ALL active employees.

**What it does:**
- ✅ Creates balances for all active employees
- ✅ Uses system settings for default allocations
- ✅ Sets up balances for year 2026
- ✅ Initializes with 0 used/pending days
- ✅ Shows summary of created records

**How to run:**
1. Open Supabase SQL Editor
2. Copy and paste `populate_all_leave_balances.sql`
3. Click "Run"
4. You should see: "✅ Created balances for: [Employee Name]" for each employee

**Default Allocations Applied:**
- Annual Leave: 21 days
- Sick Leave: 10 days
- Maternity Leave: 90 days
- Paternity Leave: 14 days
- Compassionate: 7 days
- Study Leave: 5 days

---

### Step 3: Verify Everything Works
**File:** `verify_user_data.sql`

Run this to confirm all data is properly set up:
- Shows all leave types
- Lists all active users
- Shows which employees have balances
- Displays full balance breakdown

---

## ⚡ Quick Start (TL;DR)

**Run these 2 scripts in Supabase SQL Editor:**

```bash
# Step 1: Master setup (fixes everything + base data)
→ master_setup.sql          # All-in-one: Colors, RLS, base data

# Step 2: Create employee balances  
→ populate_all_leave_balances.sql   # Employee leave balances

# Step 3 (optional): Verify
→ verify_user_data.sql         # Check everything

# Step 4: Refresh browser
→ Login and see real data! 🎉
```

**Total time: ~2 minutes**

---

## Alternative: Use Admin UI (Per Employee)

**Navigate to:** Admin → Leave Balances

This allows HR admins to:
1. Select an employee
2. Click "Edit" or "⚡ Defaults"
3. Manually set or auto-apply default allocations
4. Save individual employee balances

**Best for:**
- Adjusting specific employee allocations
- Custom allocations that differ from defaults
- One-off corrections

---

### 🔧 **Option 3: Manual SQL (Individual User)**

Use `add_leave_balances.sql` as a template and modify the user ID.

---

## Verify Data After Setup

Run: `verify_user_data.sql`

This will show you:
- ✅ All leave types in the system
- ✅ All active users
- ✅ All departments
- ✅ Which employees HAVE balances
- ⚠️ Which employees DON'T have balances
- 📊 Full balance breakdown for all users

---

## What Users Will See After Setup

### Employee Dashboard
- **Total Available Leave:** Sum of all leave types
- **Used Leave:** Days already taken
- **Pending Leave:** Days in pending requests
- **Balance Breakdown:** Card for each leave type showing:
  - Allocated days
  - Used days
  - Pending days
  - Available days (calculated)
- **Recent Leave Requests:** Last 5 requests

### Leave Request Form
- Available balance for each leave type
- Real-time calculation of remaining days
- Validation against available balance

### Leave History
- All past and current leave requests
- Status tracking
- Document attachments (if uploaded)

---

## Troubleshooting

### "Still showing 0 balances"
1. Verify records were created:
   ```sql
   SELECT COUNT(*) FROM leave_balances WHERE year = 2026;
   ```
2. Check RLS policies are correct (run `fix_leave_balances_rls.sql`)
3. Refresh the browser / re-login

### "Users missing from list"
- Check `is_active = true` in `users_profile` table
- Verify user is not `super_admin` (they're excluded)

### "Wrong allocations"
- Update via Admin → Leave Balances UI
- Or run UPDATE SQL to adjust specific allocations

---

## Maintenance

### New Employees
When adding new employees:
1. Create user account in `users_profile`
2. Run this for the new user:
   ```sql
   -- Replace USER_ID with actual UUID
   INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation, used_days, pending_days, carryforward_days)
   SELECT 'USER_ID'::uuid, id, 2026, 
       CASE 
           WHEN LOWER(name) LIKE '%annual%' THEN 21
           WHEN LOWER(name) LIKE '%sick%' THEN 10
           WHEN LOWER(name) LIKE '%maternity%' THEN 90
           WHEN LOWER(name) LIKE '%paternity%' THEN 14
           ELSE max_days_per_year
       END,
       0, 0, 0
   FROM leave_types WHERE is_active = true;
   ```
3. Or use Admin → Leave Balances → "⚡ Defaults" button

### New Year Rollover
At the start of each year:
1. Update the year in `populate_all_leave_balances.sql`
2. Run the script to create balances for the new year
3. Optional: Carry forward unused days from previous year

---

## Quick Start (TL;DR)

```bash
# Step 1: Run in Supabase SQL Editor
→ master_setup.sql          # All-in-one setup script

# Step 2: Run in Supabase SQL Editor  
→ populate_all_leave_balances.sql   # Employee balances

# Step 3 (optional): Verify
→ verify_user_data.sql         # Check setup

# Step 4: Refresh browser
→ Login and check dashboard - Users see real data! 🎉
```
