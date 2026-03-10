# Staff Attendance Sign-In/Sign-Out System

## Overview

The Staff Attendance System is a comprehensive solution integrated into the FKF HR Leave Management System. It allows staff members to clock in and out daily, track their work hours, and provides administrators with complete attendance management and reporting capabilities.

## Features

### For Staff (All Users)

- **Daily Check-In/Check-Out**: Simple one-click attendance tracking
- **Real-time Clock**: Live time display showing current date and time
- **Work Duration Tracking**: Automatic calculation of daily work hours
- **Attendance Status**: Automatic status assignment (Present, Late, Half Day)
- **Personal Statistics**: Monthly attendance summary with:
  - Total days present
  - Late arrivals count
  - Half days worked
  - Total and average hours worked
- **Recent History**: Quick view of last 7 days attendance
- **Notes**: Optional notes for check-in and check-out
- **Mobile Responsive**: Works on all devices

### For Administrators (HR Admin & Super Admin)

- **Complete Attendance Records**: View all employee attendance with filters
- **Filter Options**:
  - Date range
  - Department
  - Employee ID
- **Edit & Correction**: Manually correct or update attendance records
- **Delete Records**: Remove incorrect entries
- **Monthly Summary Reports**: Department-wise attendance analytics
- **Export to CSV**: Download attendance data for external reporting
- **Configurable Settings**:
  - Work start/end times
  - Late threshold (minutes)
  - Grace period
  - Half day/full day hour definitions
  - Location tracking toggle
  - Mandatory check-out requirement

### For HODs (Head of Department)

- HODs can view attendance records for their department members
- Access to team attendance analytics

## Installation & Setup

### 1. Database Setup

Run the SQL script to create the necessary tables and policies:

```bash
# Navigate to the supabase folder
cd supabase

# Run the setup script in Supabase SQL Editor
# Copy and paste the contents of setup_attendance_system.sql
```

Or execute via Supabase CLI:

```bash
supabase db push setup_attendance_system.sql
```

The script creates:
- `attendance_records` table - Stores all check-in/check-out records
- `attendance_settings` table - System configuration
- `attendance_summary` view - Monthly analytics
- Row Level Security (RLS) policies
- Automatic work hours calculation triggers
- Helper functions for attendance operations

### 2. Frontend Setup

The frontend components are already integrated. Ensure all dependencies are installed:

```bash
cd frontend
npm install
```

### 3. Configuration

After running the database setup, configure the default settings via the Admin Attendance Settings tab:

- **Work Start Time**: Default 8:00 AM
- **Work End Time**: Default 5:00 PM
- **Late Threshold**: 15 minutes (arrivals after this are marked "Late")
- **Grace Period**: 5 minutes (buffer before late marking)
- **Half Day Hours**: 4.0 hours
- **Full Day Hours**: 8.0 hours
- **Location Tracking**: Disabled by default (optional GPS tracking)
- **Require Checkout**: Enabled by default

## Usage Guide

### Staff Usage

#### Checking In

1. Navigate to **Attendance** from the main dashboard menu (🕐 icon)
2. The current time is displayed prominently at the top
3. Click the **"Check In Now"** button
4. Optionally add notes about your shift
5. Your check-in time is recorded with automatic status assignment

**Status Assignment**:
- **Present**: Arrived on time or within grace period
- **Late**: Arrived after the late threshold

#### Checking Out

1. Return to the **Attendance** page
2. View your current work duration in real-time
3. Optionally add notes about your day
4. Click the **"Check Out Now"** button
5. Your work hours are automatically calculated and saved

#### Viewing History

The attendance page shows:
- Today's attendance status
- Current month statistics
- Recent 7-day history with times and hours

### Administrator Usage

#### Viewing All Attendance Records

1. Navigate to **Admin Dashboard** → **Attendance** (or use sidebar menu)
2. Select the **"Attendance Records"** tab
3. Apply filters:
   - Start Date / End Date
   - Department
   - Employee ID
4. Click **"Apply Filters"**

#### Editing Attendance Records

1. Click the **Edit** (✏️) button next to any record
2. Modify:
   - Check-in time
   - Check-out time
   - Status (Present, Late, Half Day, Absent)
3. Click the **Save** (✓) button to confirm

#### Deleting Records

1. Click the **Delete** (🗑️) button next to any record
2. Confirm the deletion when prompted

#### Viewing Summary Reports

1. Select the **"Summary & Reports"** tab
2. View monthly statistics for all employees:
   - Days present
   - Days late
   - Half days
   - Total work hours

#### Exporting Data

1. Set your desired date range and filters
2. Click **"Export to CSV"**
3. The file downloads automatically with filename: `attendance_YYYY-MM-DD_to_YYYY-MM-DD.csv`

#### Configuring Settings

1. Select the **"Settings"** tab
2. Click **"Edit Settings"**
3. Modify any configuration values
4. Click **"Save Settings"**

## Technical Architecture

### Database Schema

#### `attendance_records` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to auth.users |
| employee_id | VARCHAR(50) | Employee identifier |
| employee_name | VARCHAR(255) | Employee full name |
| check_in_time | TIMESTAMPTZ | Check-in timestamp |
| check_out_time | TIMESTAMPTZ | Check-out timestamp (nullable) |
| date | DATE | Date of attendance |
| status | VARCHAR(20) | Present, Late, Half Day, Absent |
| location | VARCHAR(255) | GPS coordinates (optional) |
| ip_address | INET | IP address for tracking |
| notes | TEXT | Employee notes |
| work_hours | DECIMAL(5,2) | Calculated work duration |
| created_at | TIMESTAMPTZ | Record creation time |
| updated_at | TIMESTAMPTZ | Last update time |

**Constraints**:
- Unique constraint on (user_id, date) - One attendance record per day per user
- Foreign key to auth.users with CASCADE delete

#### `attendance_settings` Table

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| work_start_time | TIME | Official work start time |
| work_end_time | TIME | Official work end time |
| late_threshold_minutes | INTEGER | Minutes after start = late |
| half_day_hours | DECIMAL(4,2) | Hours for half day |
| full_day_hours | DECIMAL(4,2) | Hours for full day |
| grace_period_minutes | INTEGER | Grace period before late |
| enable_location_tracking | BOOLEAN | GPS tracking toggle |
| require_checkout | BOOLEAN | Mandatory check-out |

### API Services

Located in: `frontend/src/services/attendanceService.ts`

**Key Functions**:

- `getTodayAttendance()` - Get current user's today record
- `checkIn(data)` - Record check-in with optional notes
- `checkOut(notes)` - Record check-out with optional notes
- `getAttendanceHistory(startDate, endDate, limit)` - Fetch user history
- `getAllAttendanceRecords(filters)` - Admin: Get all records
- `getAttendanceSummary()` - Admin: Get monthly statistics
- `getAttendanceSettings()` - Get system configuration
- `updateAttendanceSettings(settings)` - Admin: Update configuration
- `updateAttendanceRecord(id, updates)` - Admin: Edit record
- `deleteAttendanceRecord(id)` - Admin: Delete record
- `exportAttendanceToCSV(startDate, endDate, department)` - Export data

### Components

#### `StaffAttendance.tsx`

Staff-facing attendance interface:
- Check-in/check-out controls
- Real-time clock
- Personal statistics
- Recent history table
- Status badges

Located: `frontend/src/components/attendance/StaffAttendance.tsx`

#### `AdminAttendance.tsx`

Administrator attendance management:
- Tabbed interface (Records, Summary, Settings)
- Filter controls
- Inline editing
- Export functionality
- Settings configuration

Located: `frontend/src/components/attendance/AdminAttendance.tsx`

### Styling

Custom styles in: `frontend/src/styles/attendance.css`

Features:
- Modern card-based layout
- Gradient time display
- Responsive grid system
- Status badge colors
- Dark mode support
- Mobile-optimized tables

## Security & Permissions

### Row Level Security (RLS)

**Staff Users**:
- ✅ View own attendance records
- ✅ Create own attendance records (check-in)
- ✅ Update own attendance records (check-out)
- ❌ View others' records
- ❌ Delete any records

**HOD (Head of Department)**:
- ✅ View department members' attendance
- ❌ Edit/delete attendance records

**HR Admin & Super Admin**:
- ✅ View all attendance records
- ✅ Edit any attendance record
- ✅ Delete any attendance record
- ✅ Modify system settings
- ✅ Export all data

### Data Privacy

- IP addresses captured for audit purposes
- Location tracking optional (disabled by default)
- All data encrypted at rest (Supabase default)
- HTTPS encryption in transit

## Routes

### Staff Routes

- `/attendance` - Staff attendance interface (Protected, all authenticated users)

### Admin Routes

- `/admin/attendance` - Admin attendance management (Protected, HR Admin & Super Admin only)

## Navigation Integration

### Staff Dashboard
- Menu item: "🕐 Attendance"
- Accessible to all authenticated users

### Admin Dashboard
- Sidebar: "🕐 Attendance"
- Quick Action card: "Attendance - View and manage staff attendance"
- Accessible to HR Admin & Super Admin

## Troubleshooting

### Issue: Can't check in

**Solutions**:
- Ensure you haven't already checked in today (only one check-in per day)
- Check browser console for errors
- Verify database connection
- Check Row Level Security policies

### Issue: Work hours not calculating

**Solutions**:
- Ensure check-out time is recorded
- Database trigger should calculate automatically
- Try refreshing the page
- Check for database errors in Supabase logs

### Issue: Late status not applying correctly

**Solutions**:
- Verify attendance settings (work start time, late threshold)
- Check system timezone settings
- Ensure server time is correct

### Issue: Export not downloading

**Solutions**:
- Check browser pop-up blocker
- Ensure records exist for the selected date range
- Try different date range
- Check browser console for errors

## Future Enhancements

Potential features for future versions:

1. **Biometric Integration**: Fingerprint or face recognition check-in
2. **Mobile App**: Native iOS/Android apps
3. **Geofencing**: Restrict check-in to office location
4. **Shift Management**: Support multiple shifts and schedules
5. **Overtime Tracking**: Automatic overtime hour calculation
6. **Leave Integration**: Sync with leave requests (no check-in on leave days)
7. **Notifications**: Remind staff to check in/out
8. **Custom Reports**: Advanced reporting with charts
9. **Department Analytics**: Department-level attendance trends
10. **QR Code Check-in**: Quick check-in via QR code scanning

## Best Practices

### For Staff

1. Check in as soon as you arrive at work
2. Don't forget to check out when leaving
3. Add meaningful notes if arriving late or leaving early
4. Review your attendance history regularly

### For Administrators

1. Review pending/missing check-outs daily
2. Export monthly reports for payroll
3. Regularly monitor late arrivals
4. Adjust settings based on organizational needs
5. Back up attendance data monthly

## Support

For technical support or feature requests:

1. Check this documentation first
2. Review Supabase logs for errors
3. Check browser console for client-side issues
4. Contact system administrator

## License

This attendance system is part of the FKF HR Leave Management System.

## Version History

- **v1.0.0** (2026-03-04)
  - Initial release
  - Basic check-in/check-out
  - Admin management
  - Export functionality
  - Configurable settings

---

**Last Updated**: March 4, 2026
**Author**: FKF HR System Development Team
