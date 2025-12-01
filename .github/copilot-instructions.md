# Leave Management System - AI Coding Instructions

## Project Overview
**Serverless JAMstack leave management system** for HR departments. Built with React 19 + Vite, Supabase backend (PostgreSQL + Auth + RLS + Edge Functions). Currently in **Phase 2** (Employee UI + Approvals complete).

## Architecture: Serverless JAMstack

**Frontend**: React 19 + Vite + React Router v6  
**Backend**: Supabase (PostgreSQL 17, RLS, Auth, Edge Functions)  
**State**: React hooks + Supabase realtime subscriptions  
**Deployment**: Netlify (configured but not deployed yet)  
**Local Dev**: Vite dev server (port 5173), Supabase local (ports 54321-54324)

## Critical Technical Patterns

### 1. Database Security: RLS First, UI Second
**All data access enforced at PostgreSQL level via Row Level Security**. UI role checks are UX only.

**Example RLS from `002_triggers_and_rls.sql`:**
```sql
-- Employees see only their own requests
CREATE POLICY "users_view_own_profile" ON users_profile
FOR SELECT TO authenticated
USING (auth.uid() = id);

-- HODs see department data
CREATE POLICY "hod_view_department_profiles" ON users_profile
FOR SELECT TO authenticated
USING (department_id IN (
  SELECT department_id FROM users_profile 
  WHERE id = auth.uid() AND role IN ('hod', 'hr_admin')
));
```

**Never bypass RLS**: Always use `supabase.from()` queries (applies RLS automatically). Avoid service role key in frontend.

### 2. Leave Balance Updates: PostgreSQL Triggers Only
**DO NOT update balances in application code**. Balances auto-update via `update_leave_balance()` trigger in `002_triggers_and_rls.sql`:

- **INSERT** `leave_requests` (status='pending') → `pending_days += total_days`
- **UPDATE** to 'approved' → `used_days += total_days`, `pending_days -= total_days`  
- **UPDATE** to 'rejected'/'cancelled' → `pending_days -= total_days`

Application code only submits to `leave_requests` table. Trigger handles rest.

### 3. Working Days Calculation (Client-Side)
**Implementation**: `frontend/src/services/leaveService.js` lines 71-92

```javascript
export const calculateWorkingDays = (startDate, endDate, publicHolidays = []) => {
  let workingDays = 0;
  let currentDate = new Date(startDate);
  const holidayDates = publicHolidays.map(h => new Date(h.date).toDateString());

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday/Saturday
    const isHoliday = holidayDates.includes(currentDate.toDateString());
    if (!isWeekend && !isHoliday) workingDays++;
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return workingDays;
};
```

**Usage**: Always fetch `public_holidays` from DB first, then calculate. See `LeaveRequestForm.jsx` lines 37-57.

## Project Structure (Actual Implementation)

### Frontend (`/frontend/src/`)
```
/components
  /auth           - Login.jsx, ForgotPassword.jsx
  /dashboard      - Dashboard.jsx (role-based widgets)
  /leave          - LeaveRequestForm.jsx (multi-step), LeaveHistory.jsx
  /approvals      - Approvals.jsx (HOD/HR approval interface)
  /calendar       - TeamCalendar.jsx (month view + list view)
  /admin          - AdminDashboard, UserManagement, LeaveTypeManagement,
                    ReportsAnalytics, HolidayManagement, PolicySettings,
                    BulkOperations, AnalyticsDashboard
  ProtectedRoute.jsx - Route guard with role-based access
  ErrorBoundary.jsx  - Global error handler
  LoadingFallback.jsx
/hooks
  useAuth.jsx     - Auth context provider (user, profile, role, loading)
/services
  authService.js  - signIn, signUp, signOut, getUserProfile
  leaveService.js - All Supabase queries (287 lines, see below)
/lib
  supabaseClient.js - Single Supabase client instance
App.jsx           - React Router setup with ProtectedRoute guards
```

### Backend (`/supabase/`)
```
/migrations
  001_initial_schema.sql      - 9 core tables (246 lines)
  002_triggers_and_rls.sql    - Triggers + RLS policies (462 lines)
  003_user_management_enhancements.sql
  004_public_holidays.sql
/functions
  /send-email         - Email notifications (not integrated yet)
  /process-carryforward - Year-end carryforward logic
config.toml         - Local Supabase config (ports, auth settings)
seed.sql            - Initial departments, leave types, 2025 holidays
```

**Additional SQL files** (ad-hoc fixes): `FINAL_RLS_FIX.sql`, `remote_setup_complete.sql`, `create_super_admin.sql`, etc. Check before running migrations to avoid conflicts.

## Core Database Schema (9 Tables)

From `001_initial_schema.sql`:

1. **departments** - Organization structure, `head_of_department_id` FK to `users_profile`
2. **leave_types** - Leave policies (Annual: 21 days, Sick: 14 days, etc.), `allow_carryforward`, `max_carryforward_days`
3. **users_profile** - Extends `auth.users`, columns: `employee_id`, `role` (employee/hod/hr_admin), `department_id`, `is_active`
4. **leave_balances** - Annual allocation + used/pending/carryforward days per user/type/year, UNIQUE constraint on `(user_id, leave_type_id, year)`
5. **leave_requests** - Submissions with `status` (pending/approved/rejected/cancelled), `reviewed_by`, `document_url`
6. **leave_request_history** - Audit trail (via `log_request_history()` trigger)
7. **public_holidays** - Used in working days calc, `is_recurring` flag
8. **notifications** - In-app alerts (table exists but not actively used yet)
9. **audit_logs** - System-wide audit (via `log_audit()` trigger on sensitive tables)

## Key Service Layer Patterns

### `leaveService.js` Functions (Always Returns `{ data, error }`)

```javascript
// Fetch with joins (RLS auto-applied)
getLeaveBalances(userId, year) 
  .from('leave_balances')
  .select(`*, leave_types(...)`)
  .eq('user_id', userId).eq('year', year)

// Submit request (triggers fire automatically)
submitLeaveRequest(requestData)
  .from('leave_requests')
  .insert([{user_id, leave_type_id, start_date, end_date, total_days, reason, status: 'pending'}])

// HOD approvals
getPendingApprovals(userId) // Uses join to users_profile.department_id
approveLeaveRequest(requestId, reviewerId, comments)
  .update({status: 'approved', reviewed_by, reviewed_at: NOW(), reviewer_comments})
```

**Pattern**: All queries use `.select()` with joins to fetch related data. Always handle `{ data, error }` destructured response.

## Authentication Flow

### `useAuth` Hook (Global Context)
**File**: `frontend/src/hooks/useAuth.jsx`

```javascript
const { user, profile, role, loading, signOut } = useAuth();
// user: Supabase auth.users object
// profile: users_profile table data (first_name, department_id, etc.)
// role: 'employee' | 'hod' | 'hr_admin'
// loading: true during initial auth check
```

**Implementation**:
- Subscribes to `onAuthStateChange()`
- Fetches `users_profile` on session login
- Memoizes value to avoid re-renders

### Protected Routes Pattern
**File**: `frontend/src/components/ProtectedRoute.jsx`

```jsx
<ProtectedRoute allowedRoles={['hod', 'hr_admin']}>
  <Approvals />
</ProtectedRoute>
```

**Logic**:
- Shows loading spinner if `loading === true`
- Redirects to `/login` if no user
- Redirects to `/unauthorized` if role not in `allowedRoles`
- **Debug logs** to console (remove in production)

## Development Workflow

### ⚠️ CRITICAL: Database Setup MUST Come First

**Do database setup before any frontend work**. Frontend will fail without valid Supabase credentials.

#### Step 1: Database Setup (Supabase Cloud)

1. **Create Supabase Project** (if not exists):
   - Go to https://supabase.com/dashboard
   - Create new project, note the project URL and anon key

2. **Run Migrations in Order** (via Dashboard → SQL Editor):
   ```sql
   -- Run these files in exact order:
   1. supabase/migrations/001_initial_schema.sql
   2. supabase/migrations/002_triggers_and_rls.sql
   3. supabase/seed.sql  -- Creates departments, leave types, 2025 holidays
   ```

3. **Verify Database**:
   - Check Table Editor for 9 tables: departments, leave_types, users_profile, leave_balances, leave_requests, leave_request_history, public_holidays, notifications, audit_logs
   - Verify seed data: 5 departments, 6 leave types, 10 public holidays

4. **Create First Admin User**:
   - Go to Authentication → Users → Invite user
   - After signup, manually update `users_profile` table:
     ```sql
     UPDATE users_profile 
     SET role = 'hr_admin', 
         department_id = '00000000-0000-0000-0000-000000000001'  -- HR dept
     WHERE email = 'admin@example.com';
     ```

5. **Get Credentials**:
   - Settings → API → Copy `URL` and `anon public` key

#### Step 2: Frontend Setup (Windows PowerShell)

```powershell
# Navigate to frontend
cd frontend
npm install

# Configure environment
# Copy .env.example to .env
Copy-Item .env.example .env

# Edit .env and update:
# VITE_SUPABASE_URL=https://[your-project-ref].supabase.co
# VITE_SUPABASE_ANON_KEY=eyJhbGc...

# Start dev server
npm run dev  # Opens http://localhost:5173
```

#### Step 3: Test Login
- Navigate to http://localhost:5173/login
- Login with admin user created in Step 1
- Should redirect to /dashboard with role-based widgets

### Environment Variables
**File**: `frontend/.env` (gitignored, use `.env.example` as template)

```bash
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...  # Public anon key (safe for frontend)
VITE_APP_URL=http://localhost:5173
VITE_ENVIRONMENT=development
```

**Access in code**: `import.meta.env.VITE_SUPABASE_URL` (Vite convention, not `process.env`)

### Common Development Commands
```powershell
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint check
```

### Database Migration Strategy
**⚠️ ONLY run these 3 core migration files in order**:

1. `001_initial_schema.sql` - Creates 9 tables with constraints
2. `002_triggers_and_rls.sql` - Adds triggers + RLS policies  
3. `seed.sql` - Inserts initial data (departments, leave types, holidays)

**IGNORE these ad-hoc fix files** (they were one-time fixes during setup):
- `FINAL_RLS_FIX.sql` - Old RLS patch (already in 002)
- `remote_setup_complete.sql` - Old complete setup
- `create_super_admin.sql` - Manual admin creation (use Dashboard instead)
- `fix_*.sql` - All fix files (issues already resolved)
- `SETUP_*.sql` - Old setup scripts

**If you run ad-hoc files, you'll get duplicate policy errors**. Only use core migrations above.

## Role-Based Access Patterns

### 3 Roles in System
- **employee**: Default role, view own data only
- **hod** (Head of Department): Approve department requests, view team calendar
- **hr_admin**: Full system access (user management, reports, policies)

### Implementing Role Checks
**UI Level (UX only)**:
```javascript
const { role } = useAuth();
if (role === 'hr_admin') {
  // Show admin menu
}
```

**Route Level (also UX only)**:
```jsx
<Route path="/admin/*" element={
  <ProtectedRoute allowedRoles={['hr_admin']}>
    <AdminDashboard />
  </ProtectedRoute>
} />
```

**Database Level (REAL SECURITY)**:
RLS policies in `002_triggers_and_rls.sql` enforce access. Example:
```sql
CREATE POLICY "hr_view_all_profiles" ON users_profile
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM users_profile WHERE id = auth.uid() AND role = 'hr_admin'
));
```

## Current Implementation Status (Phase 2 Complete)

### ✅ Implemented Features
- Full authentication flow (login, logout, password reset UI)
- Employee dashboard with balance cards
- Multi-step leave request form with working days calc
- Leave history with filters (status, year) and cancel action
- HOD approval interface with approve/reject modal
- Team calendar (month grid + list views)
- Admin dashboard with user management, leave types, holidays
- Reports & analytics (department summaries, usage trends)
- Bulk operations UI (year-end processing)
- Complete RLS policies and database triggers
- Error boundary and loading states

### ⚠️ Not Yet Implemented
- Email notifications (Edge Functions written but not integrated)
- File uploads for leave documentation (UI exists, upload logic incomplete)
- Real-time notifications center (table exists, not wired to UI)
- Automated year-end carryforward (Edge Function written, not scheduled)
- Production deployment to Netlify

## Important Implementation Notes

### Date Handling
- **Storage**: PostgreSQL `DATE` type for leave dates, `TIMESTAMP WITH TIME ZONE` for audit fields
- **JavaScript**: Always pass ISO date strings (`YYYY-MM-DD`) to Supabase
- **Timezone**: Store as-is (no conversion needed for date-only fields)

### Error Handling Pattern
```javascript
const { data, error } = await leaveService.submitLeaveRequest(requestData);
if (error) {
  console.error('Submit error:', error);  // Log full error for debugging
  setError('Failed to submit request. Please try again.');  // User-friendly message
  return;
}
// Success handling
```

**Never expose raw Supabase errors to users**. Extract `error.message` or use generic messages.

### Multi-Step Form Pattern
**Example**: `LeaveRequestForm.jsx` (524 lines)

- `step` state (1=type selection, 2=dates, 3=reason/docs)
- `formData` state accumulates across steps
- `useEffect` hooks calculate working days when dates change
- Balance validation before allowing submission
- Loading states during async operations

### Supabase Query Joins
**Use nested `select()` for relations**:
```javascript
.select(`
  *,
  leave_types (name, color_code),
  reviewed_by_user:users_profile!leave_requests_reviewed_by_fkey (first_name, last_name)
`)
```

**Alias syntax**: `reviewed_by_user:users_profile!fkey_name` when multiple FKs to same table.

## Common Pitfalls to Avoid

1. **Don't manually update `leave_balances`** - Triggers handle this. Only insert/update `leave_requests`.
2. **Don't use service role key in frontend** - Always use anon key, let RLS restrict access.
3. **Don't forget to fetch `public_holidays` before calculating working days** - Calculation is client-side.
4. **Don't assume user has `profile` immediately after login** - Check `loading` state in `useAuth`.
5. **Don't run multiple migration SQL files blindly** - Check schema first (many ad-hoc fixes in `/supabase/`).
6. **Don't use `process.env` in Vite** - Use `import.meta.env` instead.

## Testing & Debugging

### Current Test Users (from seed.sql)
Check `seed.sql` or use Supabase Dashboard → Authentication to see users. No hardcoded test credentials in repo.

### Debugging Tips
- **RLS issues**: Check Supabase logs (Dashboard → Logs → Postgres Logs)
- **Auth state**: `useAuth` includes console.log statements (see `ProtectedRoute.jsx` lines 24-31)
- **Query errors**: All service functions log errors to console
- **Trigger failures**: Check `audit_logs` table for trigger execution trail
- **Database connection errors**: Verify `.env` file has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- **"Missing Supabase environment variables"**: Restart Vite dev server after updating `.env`

## Reference Documentation
- **Full spec**: `Leave SYS/leave_mgmt_doc.md` (complete system design)
- **Phase 1 summary**: `SETUP_COMPLETE.md` (database + auth setup)
- **Phase 2 summary**: `PHASE2_COMPLETE.md` (employee UI + approvals)
- **Quick start**: `README.md` (installation instructions)
- **CLI setup**: `CLI_SETUP_GUIDE.md` (Supabase CLI usage)
