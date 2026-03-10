# Two-Step Approval Process Implementation

## Overview
This document details the implementation of a two-step approval workflow for leave requests, where requests must be approved first by the Head of Department (HOD) and then by HR Administration.

## Workflow

### Previous Workflow
Employee → HOD/HR Approval → Approved/Rejected

### New Workflow
Employee → HOD Approval → HR Approval → Approved/Rejected

## Implementation Details

### 1. Database Changes

**File:** `supabase/003_two_step_approval.sql`

#### New Columns Added to `leave_requests` table:
- `hod_approved_by` - UUID reference to HOD who approved
- `hod_approved_at` - Timestamp of HOD approval
- `hod_comments` - Comments from HOD
- `hr_approved_by` - UUID reference to HR who gave final approval
- `hr_approved_at` - Timestamp of HR approval
- `hr_comments` - Comments from HR

#### New Status Value:
- `hod_approved` - Intermediate status when HOD approves but HR hasn't yet

#### Updated Triggers:
- **update_leave_balance()**: Modified to handle two-step approval. Days remain in `pending_days` after HOD approval, only move to `used_days` when HR gives final approval.
- **notify_leave_request_event()**: Updated to send notifications at each approval stage

#### Updated RLS Policies:
- HR Admin can now view and update ALL leave requests regardless of department
- HOD can only view and update requests from their department

### 2. TypeScript Type Updates

**File:** `frontend/src/types/index.ts`

#### LeaveRequestStatus Type:
```typescript
export type LeaveRequestStatus = 
  | 'pending'      // Awaiting HOD approval
  | 'hod_approved' // HOD approved, awaiting HR
  | 'approved'     // Final approval by HR
  | 'rejected'     // Rejected by HOD or HR
  | 'cancelled';   // Cancelled by employee
```

#### LeaveRequest Interface:
Added new fields:
- `hod_approved_by`
- `hod_approved_at`
- `hod_comments`
- `hr_approved_by`
- `hr_approved_at`
- `hr_comments`
- `hod_approver` (joined data from users_profile)
- `hr_approver` (joined data from users_profile)

### 3. Service Layer Updates

**File:** `frontend/src/services/leaveService.ts`

#### New Functions:

**`approveAsHOD(requestId, hodId, comments)`**
- Changes status from 'pending' to 'hod_approved'
- Records HOD approval details
- Leaves days in `pending_days` (doesn't affect balance yet)
- Triggers notification to employee and HR

**`approveAsHR(requestId, hrId, comments)`**
- Changes status from 'pending' or 'hod_approved' to 'approved'
- Records HR approval details
- Trigger automatically moves days from `pending_days` to `used_days`
- Sends final approval notification to employee

**`rejectLeaveRequest(requestId, reviewerId, comments, role)`**
- Handles rejection by either HOD or HR
- Records who rejected (HOD or HR) in appropriate fields
- Trigger automatically returns days to `available_days`
- Sends rejection notification

**`getRequestsForHRApproval()`**
- Fetches all 'pending' and 'hod_approved' requests
- Includes JOIN to get HOD approver details
- Used by HR to see all requests regardless of department

### 4. UI Component Updates

#### Approvals Component
**File:** `frontend/src/components/approvals/Approvals.tsx`

**Changes:**
- Role-based request loading:
  - **HOD**: Sees only 'pending' requests from their department
  - **HR**: Sees all 'pending' and 'hod_approved' requests from all departments
  
- Updated statistics dashboard:
  - Added "HOD Approved" stat card (visible only to HR)
  - Shows count of requests awaiting HR approval
  
- Enhanced request table:
  - Added "Status" column showing workflow stage
  - Status badges:
    - **Pending HOD** (yellow) - Awaiting HOD approval
    - **HOD Approved** (blue) - Approved by HOD, showing approver name
  - Action buttons show context:
    - HOD: "Forward to HR" button
    - HR: "Final Approve" button
  
- Approval modal enhancements:
  - Shows current approval stage
  - Displays HOD approver and comments if already approved at HOD level
  - Button text reflects role (HOD: "Forward to HR", HR: "Final Approve")

#### Leave History Component
**File:** `frontend/src/components/leave/LeaveHistory.tsx`

**Changes:**
- Added `getStatusLabel()` helper function for proper status display
- Updated status filter dropdown to include "HOD Approved" option
- Added status-info badge styling for 'hod_approved' status
- Status labels:
  - "Pending HOD" for 'pending' status
  - "HOD Approved" for 'hod_approved' status

#### Styling
**File:** `frontend/src/index.css`

**Changes:**
- Added `.status-info` class for HOD Approved badge:
  ```css
  .status-info {
    background-color: #dbeafe; /* Light blue */
    color: #1e40af; /* Dark blue text */
  }
  ```

## Deployment Instructions

### Step 1: Run Database Migration

1. Open Supabase Dashboard
2. Navigate to SQL Editor
3. Open the migration file: `supabase/003_two_step_approval.sql`
4. Execute the entire script
5. Verify execution:
   ```sql
   -- Check new columns exist
   SELECT column_name 
   FROM information_schema.columns 
   WHERE table_name = 'leave_requests' 
   AND column_name LIKE '%hod%' OR column_name LIKE '%hr_%';
   
   -- Check status constraint
   SELECT constraint_name, check_clause 
   FROM information_schema.check_constraints 
   WHERE constraint_name = 'chk_status';
   ```

### Step 2: Deploy Frontend Changes

1. All TypeScript changes are already compiled and ready
2. No additional npm packages required
3. Test compilation:
   ```bash
   npm run build
   ```

### Step 3: Testing Workflow

#### Test Case 1: Normal Two-Step Approval
1. **Employee**: Submit leave request
   - Expected: Status = 'pending'
   - Expected: Days moved to `pending_days`
   
2. **HOD**: Approve the request
   - Expected: Status changes to 'hod_approved'
   - Expected: Days remain in `pending_days`
   - Expected: Employee and HR receive notification
   
3. **HR**: Give final approval
   - Expected: Status changes to 'approved'
   - Expected: Days moved from `pending_days` to `used_days`
   - Expected: Employee receives final approval notification

#### Test Case 2: HR Direct Approval (Bypass)
1. **Employee**: Submit leave request
2. **HR**: Approve directly without HOD approval
   - Expected: Status goes from 'pending' to 'approved'
   - Expected: Days moved to `used_days`
   - Expected: Works correctly (HR can bypass HOD)

#### Test Case 3: HOD Rejection
1. **Employee**: Submit leave request
2. **HOD**: Reject the request
   - Expected: Status = 'rejected'
   - Expected: `hod_approved_by` is set (not hr_approved_by)
   - Expected: Days returned to `available_days`

#### Test Case 4: HR Rejection After HOD Approval
1. **Employee**: Submit leave request
2. **HOD**: Approve the request
3. **HR**: Reject the request
   - Expected: Status = 'rejected'
   - Expected: Both `hod_approved_by` and `hr_approved_by` fields populated
   - Expected: Days returned to `available_days`

### Step 4: Verify Notifications

Check that notifications are sent at each stage:
- Employee → HOD: "New leave request"
- HOD Approval → Employee: "Your request was approved by HOD"
- HOD Approval → HR: "New request awaiting your approval"
- HR Approval → Employee: "Your request was approved"
- Rejection → Employee: "Your request was rejected"

## Features

### HOD View
- ✅ Sees only pending requests from their department
- ✅ Can forward requests to HR (approve to 'hod_approved' status)
- ✅ Can reject requests outright
- ✅ Cannot see requests from other departments

### HR Admin View
- ✅ Sees ALL pending and HOD-approved requests from all departments
- ✅ Can give final approval to any request
- ✅ Can approve directly without HOD approval (bypass capability)
- ✅ Can see who approved at HOD level
- ✅ Can reject at any stage (before or after HOD approval)
- ✅ Separate stat card showing HOD-approved requests awaiting action

### Employee View
- ✅ Clear status indicators showing approval progress
- ✅ Can see if request is "Pending HOD" or "HOD Approved"
- ✅ Receives notifications at each stage
- ✅ Can filter by 'hod_approved' status in leave history

## Balance Management

### Pending Days Behavior
- **Request Submission**: Days deducted from `available_days`, added to `pending_days`
- **HOD Approval**: Days remain in `pending_days` (no change)
- **HR Approval**: Days moved from `pending_days` to `used_days`
- **Rejection at any stage**: Days returned from `pending_days` to `available_days`
- **Cancellation**: Days returned from pending to available

## Backward Compatibility

### Existing Leave Requests
- The migration preserves existing data
- Old requests with `reviewed_by` field are not affected
- New requests will use the two-step approval process
- Both `reviewed_by` (legacy) and new approval fields coexist

### Legacy Functions
- `updateRequestStatus()` function kept for backward compatibility
- New code uses `approveAsHOD()` and `approveAsHR()` instead
- Old code will continue to work but should be migrated

## Troubleshooting

### Issue: HOD not seeing pending requests
**Check:**
- HOD's department assignment in users_profile
- RLS policies are enabled
- User has role 'hod' in profile

### Issue: HR not seeing all requests
**Check:**
- User has role 'hr_admin' or 'super_admin'
- Migration script executed successfully
- RLS policy for HR was updated

### Issue: Days not moving correctly
**Check:**
- Trigger `update_leave_balance()` was recreated successfully
- Check trigger execution in database logs
- Verify status transitions are correct

### Issue: Status not showing correctly in UI
**Check:**
- Browser cache cleared
- CSS file loaded correctly (check for .status-info class)
- TypeScript types compiled without errors

## Future Enhancements

### Potential Improvements:
1. **Configurable workflow**: Allow some departments to skip HOD approval
2. **Parallel approvals**: Allow multiple HODs to approve
3. **Approval delegation**: HOD can delegate to assistant
4. **Approval timeline view**: Visual timeline showing approval stages
5. **Reminder notifications**: Auto-remind approvers after N days
6. **Bulk approval**: HR can approve multiple HOD-approved requests at once
7. **Approval comments visible in leave history**: Show all approval comments to employee

## Summary

The two-step approval process provides better control and visibility:
- **Separation of concerns**: HOD handles operational approval, HR handles policy compliance
- **Audit trail**: Clear record of who approved at each stage
- **Flexibility**: HR can still bypass HOD approval if needed
- **Balance safety**: Days only affect final balance when HR approves
- **Better notifications**: Users informed at each stage of the process

## Related Files

### Database
- `supabase/003_two_step_approval.sql` - Migration script

### Backend/Types
- `frontend/src/types/index.ts` - TypeScript type definitions
- `frontend/src/services/leaveService.ts` - API service layer

### Frontend Components
- `frontend/src/components/approvals/Approvals.tsx` - Approval interface
- `frontend/src/components/leave/LeaveHistory.tsx` - Employee leave history

### Styles
- `frontend/src/index.css` - Status badge styles

---

**Implementation Date:** February 27, 2026  
**Version:** 1.0  
**Status:** Ready for deployment
