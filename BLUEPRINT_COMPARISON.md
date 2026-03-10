# Blueprint vs Implementation Comparison

**Date**: November 16, 2025  
**Blueprint**: `Leave SYS/leave_mgmt_doc.md` (2877 lines)  
**Implementation**: Current codebase

---

## Executive Summary

✅ **Core architecture matches blueprint**: JAMstack with React + Supabase  
✅ **Phase 1-2 features complete**: Database, auth, employee UI, approvals  
⚠️ **Some blueprint features missing**: See gaps below  
⚠️ **Schema differences**: Minor variations from blueprint design

---

## 1. Database Schema Comparison

### ✅ Tables Implemented (9/9)
All core tables from blueprint exist:
- `departments` ✓
- `leave_types` ✓
- `users_profile` ✓
- `leave_balances` ✓
- `leave_requests` ✓
- `leave_request_history` ✓
- `public_holidays` ✓
- `notifications` ✓
- `audit_logs` ✓

### ⚠️ Schema Differences

#### 1. `users_profile` Table
**Blueprint specifies** (lines 1142-1163):
```sql
manager_id UUID FK→users_profile  -- Direct manager
code TEXT UNIQUE NOT NULL         -- Department short code
```

**Actual implementation**:
```sql
-- MISSING: manager_id column
-- departments table has head_of_department_id instead
-- No department code field
```

**Impact**: 
- ❌ Cannot track reporting hierarchy (manager chains)
- ❌ Cannot implement multi-level approval workflows
- ❌ Dashboard won't show "my team" for managers
- ⚠️ HOD approvals work differently (based on department, not manager hierarchy)

**Recommendation**: Add migration to include `manager_id` if manager-based approvals needed

---

#### 2. `leave_balances` Table
**Blueprint specifies** (lines 1203-1219):
```sql
opening_balance DECIMAL(5,2)  -- Carried forward from previous year
available_days DECIMAL(5,2) COMPUTED  -- Auto-calculated
```

**Actual implementation**:
```sql
carryforward_days DECIMAL(5,1)  -- Instead of opening_balance
-- No computed column for available_days
```

**Impact**:
- ✓ Functionally equivalent (carryforward_days serves same purpose)
- ⚠️ Frontend must calculate available_days manually
- ⚠️ Risk of calculation inconsistency across components

**Current calculation** (from `leaveService.js`):
```javascript
// No explicit calculation - just fetches fields
// Blueprint expects: opening_balance + annual_allocation - used_days - pending_days
```

**Recommendation**: Add database view or computed column for consistency

---

#### 3. `departments` Table
**Blueprint specifies** (lines 1165-1175):
```sql
code TEXT UNIQUE NOT NULL  -- Short code like "IT", "HR"
hod_id UUID FK→users_profile
```

**Actual implementation**:
```sql
head_of_department_id UUID FK→users_profile  -- ✓ Equivalent
-- MISSING: code field
```

**Impact**:
- ⚠️ Minor - codes useful for display/exports but not critical

---

### ✅ Constraints & Indexes Match
- All CHECK constraints implemented correctly
- Foreign keys properly defined
- Indexes on critical query columns
- Unique constraints match blueprint

---

## 2. Business Logic Comparison

### ✅ Implemented Features

#### Leave Request Workflow
- ✓ Multi-step form (3 steps: type, dates, reason/docs)
- ✓ Working days calculation (excludes weekends + holidays)
- ✓ Balance validation before submission
- ✓ Status workflow: pending → approved/rejected/cancelled

**Blueprint**: Lines 1540-1590  
**Implementation**: `frontend/src/components/leave/LeaveRequestForm.jsx`

#### Balance Management
- ✓ Trigger-based balance updates (lines 1310-1355 in blueprint)
- ✓ Automatic balance adjustments on status change
- ✓ Negative balance prevention (via RLS + validation)

**Implementation**: `supabase/migrations/002_triggers_and_rls.sql` lines 10-42

#### Working Days Calculation
**Blueprint** (lines 1540-1560):
```javascript
// Excludes weekends (Sun=0, Sat=6) AND public holidays
```

**Implementation** (leaveService.js lines 71-92):
```javascript
export const calculateWorkingDays = (startDate, endDate, publicHolidays = []) => {
  // ✓ Matches blueprint exactly
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = holidayDates.includes(currentDate.toDateString());
  if (!isWeekend && !isHoliday) workingDays++;
}
```

---

### ⚠️ Partially Implemented Features

#### Approval Workflow
**Blueprint** (lines 1600-1650):
- ✓ HOD approval interface exists
- ✓ Approve/reject with comments
- ✓ Team calendar view
- ⚠️ **Missing**: "Request more info" action
- ⚠️ **Missing**: Urgent flags for requests < 3 days notice
- ⚠️ **Missing**: Team members on leave context display
- ⚠️ **Missing**: "Business critical dates" warnings

**Current**: Basic approve/reject only (see `Approvals.jsx`)

#### Notification System
**Blueprint** (lines 1700-1850):
- ✓ Database table exists
- ✓ In-app notifications structure
- ❌ **NOT INTEGRATED**: Email notifications
- ❌ **NOT INTEGRATED**: Push notifications
- ❌ **NOT INTEGRATED**: Reminder for pending > 48 hours
- ❌ **NOT INTEGRATED**: Low balance alerts

**Status**: Edge Functions written (`send-email/index.ts`) but not called from app

---

### ❌ Not Implemented

#### Email Notifications
**Blueprint**: Complete HTML email templates (lines 1706-1800)
- Request submitted → Notify HOD
- Request approved → Notify employee
- Request rejected → Notify employee

**Current Status**:
- ✓ Edge Function exists: `supabase/functions/send-email/index.ts`
- ✓ Templates defined in Edge Function
- ❌ NOT called from application code
- ❌ SendGrid/Resend integration incomplete

**Required to complete**:
1. Add email service API key to Supabase secrets
2. Call Edge Function from trigger or frontend after status change
3. Test email delivery

---

#### Year-End Carryforward
**Blueprint** (lines 1626-1660):
```sql
-- Automated process on Jan 1
-- Calculates carryforward based on leave_types.max_carryforward_days
-- Creates next year's balances
```

**Current Status**:
- ✓ Edge Function exists: `supabase/functions/process-carryforward/index.ts`
- ❌ NOT scheduled (no cron job configured)
- ❌ NOT tested
- ⚠️ Manual process required currently

---

#### Multi-Level Approval
**Blueprint mentions** (lines 1450-1470):
- Manager-based approval chains
- Escalation to HR for disputes

**Current**: Single-level HOD approval only (based on department, not manager hierarchy)

---

#### Document Upload/Storage
**Blueprint** (lines 1225, 1540):
- `document_url TEXT` in leave_requests table
- Supabase Storage integration for attachments

**Current Status**:
- ✓ Database field exists
- ⚠️ UI has upload input field
- ❌ Upload logic NOT implemented
- ❌ Storage bucket NOT configured

**File**: `LeaveRequestForm.jsx` line 30 shows `document: null` but no upload handler

---

## 3. UI/UX Comparison

### ✅ Implemented Components

#### Dashboard
**Blueprint** (lines 433-445):
- ✓ Leave balance cards
- ✓ Recent requests list
- ✓ Quick action buttons
- ✓ Role-based widgets

**Implementation**: `Dashboard.jsx` matches blueprint

#### Leave Request Form
**Blueprint** (lines 437-449):
- ✓ Multi-step wizard (3 steps)
- ✓ Date picker with validation
- ✓ Working days calculation
- ⚠️ Document upload UI exists but non-functional

**Implementation**: `LeaveRequestForm.jsx` (524 lines)

#### Approvals Interface
**Blueprint** (lines 450-459):
- ✓ Pending requests list
- ✓ Approve/reject modal
- ✓ Comment system
- ⚠️ Missing team context features

**Implementation**: `Approvals.jsx`

#### Team Calendar
**Blueprint** (lines 460-470):
- ✓ Calendar view
- ✓ List view
- ✓ Month navigation
- ✓ Color-coded by leave type
- ⚠️ Export functionality NOT implemented

**Implementation**: `TeamCalendar.jsx`

---

### ⚠️ Partially Implemented

#### Admin Dashboard
**Blueprint** (lines 471-500):
- ✓ User management UI
- ✓ Leave type management
- ✓ Holiday management
- ✓ Reports & analytics
- ⚠️ Bulk operations UI exists but incomplete
- ❌ Bulk user import NOT implemented

**Implementation**: Multiple admin components in `/admin/` folder

---

### ❌ Not Implemented UI Features

#### Notification Center
**Blueprint**: In-app notification bell icon with dropdown
**Current**: Database table exists, no UI component

#### Calendar Export
**Blueprint**: Export to iCal/Google Calendar
**Current**: Not implemented

#### Advanced Reporting
**Blueprint** (lines 1890-1950):
- Leave utilization trends
- Approval analytics
- Compliance reports

**Current**: Basic department summaries only (see `ReportsAnalytics.jsx`)

---

## 4. Security & RLS Comparison

### ✅ Implemented Policies

All core RLS policies from blueprint implemented:

**Employees see own data** (blueprint line 1481):
```sql
CREATE POLICY "users_view_own_profile" ON users_profile
FOR SELECT TO authenticated
USING (auth.uid() = id);
```
✓ Implemented in `002_triggers_and_rls.sql` line 138

**HODs see department data** (blueprint lines 1487-1500):
✓ Implemented in `002_triggers_and_rls.sql` lines 143-152

**HR admins see all** (blueprint line 1505):
✓ Implemented in `002_triggers_and_rls.sql` lines 156-164

**Approval permissions** (blueprint lines 1507-1520):
✓ Implemented with proper role checks

---

### ⚠️ Security Gaps

#### Missing Policies
**Blueprint mentions** (line 1525):
- Policy: "Only employee can cancel own pending requests"

**Current**: Cancel action exists but policy not explicitly defined

#### Audit Trail
**Blueprint** (lines 1530-1535):
- Comprehensive audit logging with IP address and user agent

**Current Implementation**:
- ✓ Audit table exists
- ✓ Trigger logs changes
- ❌ IP address NOT captured
- ❌ User agent NOT captured

**File**: `002_triggers_and_rls.sql` lines 90-105 (missing IP/user agent params)

---

## 5. Features Comparison Summary

### ✅ Fully Implemented (Phase 1-2)
| Feature | Blueprint Reference | Implementation |
|---------|-------------------|----------------|
| Database schema | Lines 1100-1300 | 001_initial_schema.sql |
| Authentication | Lines 200-250 | useAuth.jsx, authService.js |
| Leave request submission | Lines 1540-1590 | LeaveRequestForm.jsx |
| Approval workflow | Lines 1600-1650 | Approvals.jsx |
| Balance tracking | Lines 1310-1355 | Triggers in 002_triggers_and_rls.sql |
| Team calendar | Lines 460-470 | TeamCalendar.jsx |
| Basic reports | Lines 1890-1920 | ReportsAnalytics.jsx |
| RLS policies | Lines 1480-1530 | 002_triggers_and_rls.sql |
| Working days calc | Lines 1540-1560 | leaveService.js lines 71-92 |

---

### ⚠️ Partially Implemented
| Feature | Status | Missing Pieces |
|---------|--------|---------------|
| Email notifications | Edge Function exists | Not integrated, no API key |
| Document upload | UI exists | Upload handler, storage bucket |
| Admin dashboard | Basic UI complete | Bulk operations incomplete |
| Notification center | Database ready | No UI component |
| Reporting | Basic reports | Advanced analytics, exports |

---

### ❌ Not Implemented
| Feature | Blueprint Reference | Priority |
|---------|-------------------|----------|
| Manager hierarchy | Line 1155 (manager_id) | Medium |
| Multi-level approvals | Lines 1450-1470 | Low |
| Year-end carryforward scheduling | Edge Function exists, not scheduled | High |
| Calendar export (iCal) | Line 466 | Low |
| Bulk user import | Line 478 | Medium |
| Mobile app | Lines 960-980 | Future (Phase 2) |
| SSO/LDAP integration | Line 995 | Future |
| Shift management | Line 990 | Future |

---

## 6. Code Quality Comparison

### ✅ Blueprint Best Practices Followed

**Error Handling** (Blueprint line 1850):
```javascript
// Blueprint pattern
const { data, error } = await supabase...
if (error) {
  console.error('Error:', error);
  return { data: null, error };
}
```
✓ Consistently used in `leaveService.js` (all 287 lines)

**Component Structure** (Blueprint lines 300-350):
- ✓ Separation of concerns (services, hooks, components)
- ✓ Consistent file naming
- ✓ Error boundaries implemented

**Database Triggers** (Blueprint lines 1310-1355):
- ✓ Balance updates via triggers, not app code
- ✓ Audit logging automated
- ✓ History tracking automated

---

### ⚠️ Deviations from Blueprint

**Available Balance Calculation**:
- **Blueprint**: Database computed column
- **Current**: Frontend calculation scattered across components
- **Risk**: Inconsistency

**Color Scheme**:
- **Blueprint** (lines 2023-2040): Specific color palette defined
- **Current**: Some components use different colors
- **Impact**: Visual inconsistency

---

## 7. Deployment Comparison

### Blueprint Deployment Strategy (Lines 2600-2877)

**Blueprint specifies**:
- Netlify deployment with CI/CD
- GitHub Actions workflow
- Environment-based configs
- Performance monitoring (Sentry)

**Current Status**:
- ⚠️ Netlify configured (`netlify.toml` exists) but NOT deployed
- ❌ No GitHub Actions workflow
- ✓ Environment variables properly structured
- ❌ No monitoring setup

---

## 8. Recommendations

### Priority 1 (High - Complete Phase 2)
1. ✅ **Integrate email notifications**
   - Add SendGrid/Resend API key to Supabase
   - Call Edge Function from application
   - Test all email flows

2. ✅ **Complete document upload**
   - Configure Supabase Storage bucket
   - Implement upload handler in LeaveRequestForm
   - Test file storage and retrieval

3. ✅ **Schedule year-end carryforward**
   - Set up Supabase cron job
   - Test carryforward logic
   - Document manual fallback process

### Priority 2 (Medium - Polish)
4. **Add manager_id to schema**
   - Migration: `ALTER TABLE users_profile ADD COLUMN manager_id UUID REFERENCES users_profile(id)`
   - Update user management UI
   - Enable manager-based reports

5. **Implement notification center UI**
   - Bell icon component
   - Dropdown with recent notifications
   - Mark as read functionality

6. **Add available_days computed column**
   - Database view or generated column
   - Ensures calculation consistency
   - Simplifies frontend queries

### Priority 3 (Low - Nice to Have)
7. **Calendar export**
   - iCal format generation
   - Google Calendar sync

8. **Advanced analytics**
   - Trend charts
   - Predictive analytics
   - Custom report builder

9. **Bulk operations**
   - CSV user import
   - Bulk balance adjustments
   - Mass notifications

---

## 9. Conclusion

### Overall Assessment
**Blueprint Alignment**: ~75% complete

- ✅ **Solid foundation**: Core database, authentication, and workflows match blueprint
- ✅ **Phase 1-2 delivered**: Employee and HOD features functional
- ⚠️ **Integration gaps**: Email, uploads, scheduling need completion
- ⚠️ **Schema variations**: Minor differences (manager_id, department code)
- ❌ **Advanced features deferred**: Appropriate for Phase 3

### Production Readiness
**Current State**: Beta-ready with manual workarounds  
**To reach production**: Complete Priority 1 items (2-3 days work)  
**Blueprint vision**: 90% achievable with Priority 1-2 items (1-2 weeks)

### Blueprint Accuracy
The blueprint document is **excellent** and well-thought-out. The implementation follows it closely where features are built. Gaps are primarily:
1. Features deferred to later phases (intentional)
2. Integration work (email, storage) incomplete
3. Minor schema optimizations (manager hierarchy)

**Recommendation**: Use blueprint as continued roadmap for Phase 3 development.
