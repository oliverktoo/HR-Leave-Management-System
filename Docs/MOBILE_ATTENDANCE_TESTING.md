# Mobile Attendance System - Testing Checklist

**Date:** March 5, 2026  
**Version:** 1.0  
**Status:** Ready for Testing

---

## 📋 Overview

This document provides a comprehensive testing checklist for the mobile attendance system. Complete all sections before production deployment.

---

## 🔧 Pre-Testing Setup

### Database Setup
- [ ] Run `supabase/setup_attendance_system.sql`
- [ ] Run `supabase/migrate_mobile_attendance.sql`
- [ ] Run `supabase/verify_mobile_attendance_setup.sql`
- [ ] Confirm all checks pass (no ❌ errors)
- [ ] Create test user accounts (Staff, HOD, HR Admin)

### Geofence Configuration
- [ ] Configure office coordinates in system_settings table
- [ ] Set appropriate radius (recommended: 100-200m)
- [ ] Configure notification title and body text
- [ ] Verify coordinates on Google Maps

### Mobile App Build
- [ ] Run `npm install` in frontend/
- [ ] Run `npm run build`
- [ ] Run `npx cap sync android` (for Android)
- [ ] Run `npx cap sync ios` (for iOS)
- [ ] Open in Android Studio / Xcode
- [ ] Build debug APK/IPA

### Test Devices
- [ ] Android device (Android 8.0+) with GPS
- [ ] iOS device (iOS 13+) with GPS
- [ ] Both devices with internet connection
- [ ] Both devices can disable WiFi/data for offline testing

---

## 🧪 Test Cases

### 1. Database Schema Verification

#### Test 1.1: Table Structure
- [ ] Verify `attendance_records` table exists
- [ ] Confirm `coords` column exists (type: point)
- [ ] Confirm `synced_at` column exists (type: timestamptz)
- [ ] Confirm `is_offline_sync` column exists (type: boolean)
- [ ] Check all indexes created successfully

**SQL to run:**
```sql
\d attendance_records
SELECT * FROM verify_mobile_attendance_setup.sql;
```

**Expected:** All columns present, no errors

#### Test 1.2: Helper Functions
- [ ] Verify `calculate_distance()` function exists
- [ ] Test distance calculation with known coordinates
- [ ] Confirm result within expected range

**SQL to run:**
```sql
SELECT calculate_distance(
    point(36.7989, -1.2517),  -- FKF Office
    point(36.8219, -1.2864)   -- Nairobi City Center
);
-- Expected: ~5000 meters
```

**Expected:** Distance ≈ 4000-6000 meters

#### Test 1.3: RLS Policies
- [ ] Staff can view only their own records
- [ ] Staff can insert their own records
- [ ] HR Admin can view all records
- [ ] HOD can view department records
- [ ] Unauthorized access blocked

**SQL to run:**
```sql
SET SESSION ROLE staff_user;
SELECT * FROM attendance_records WHERE user_id != auth.uid();
-- Should return empty
```

**Expected:** RLS prevents unauthorized access

---

### 2. Service Layer Unit Tests

#### Test 2.1: Location Service

**Test: Get Current Location**
- [ ] Request location permission
- [ ] Capture GPS coordinates
- [ ] Verify latitude/longitude format
- [ ] Check accuracy value

**Code to test:**
```typescript
const result = await locationService.getCurrentLocation();
console.log('Location:', result);
```

**Expected:** 
- `success: true`
- Valid coordinates
- Accuracy < 100m (ideally)

**Test: Distance Calculation**
- [ ] Calculate distance between two known points
- [ ] Verify Haversine formula accuracy
- [ ] Test with different coordinate pairs

**Code to test:**
```typescript
const distance = locationService.calculateDistance(
  -1.2517, 36.7989,  // FKF Office
  -1.2864, 36.8219   // City Center
);
console.log('Distance:', distance, 'meters');
```

**Expected:** Distance ≈ 5000 meters (±500m)

**Test: Within Radius Check**
- [ ] Test point inside radius (should return true)
- [ ] Test point outside radius (should return false)
- [ ] Test edge case (exactly at radius)

**Code to test:**
```typescript
const check = await locationService.isWithinRadius(
  -1.2517, 36.7989,
  100  // 100m radius
);
console.log('Within radius:', check.withinRadius);
console.log('Distance:', check.distance);
```

**Expected:** Correct true/false based on actual location

#### Test 2.2: Geofencing Service

**Test: Initialize**
- [ ] Initialize geofencing service
- [ ] Verify notification permissions requested
- [ ] Check for errors in console

**Code to test:**
```typescript
await geofencingService.initialize();
```

**Expected:** No errors, permissions granted

**Test: Check If At Office**
- [ ] Call from inside office (should return true)
- [ ] Call from outside office (should return false)
- [ ] Verify distance calculation

**Code to test:**
```typescript
const result = await geofencingService.checkIfAtOffice();
console.log('At office:', result.isAtOffice);
console.log('Distance:', result.distance, 'm');
```

**Expected:** Accurate detection with correct distance

**Test: Show Notification**
- [ ] Trigger geofence notification
- [ ] Verify notification appears
- [ ] Check title and body text
- [ ] Tap notification and verify app opens

**Code to test:**
```typescript
await geofencingService.showGeofenceNotification(OFFICE_GEOFENCE);
```

**Expected:** Notification displayed with correct text

#### Test 2.3: Offline Storage Service

**Test: Initialize SQLite**
- [ ] Initialize offline storage
- [ ] Verify database created
- [ ] Check tables exist

**Code to test:**
```typescript
await offlineStorage.initialize();
console.log('Available:', offlineStorage.isAvailable());
```

**Expected:** `isAvailable() === true` on mobile

**Test: Save Attendance Record**
- [ ] Save test attendance record
- [ ] Verify record ID returned
- [ ] Query record from SQLite

**Code to test:**
```typescript
const id = await offlineStorage.saveAttendance({
  user_id: 'test-user-id',
  employee_id: 'EMP001',
  employee_name: 'Test User',
  check_in_time: new Date().toISOString(),
  date: new Date().toISOString().split('T')[0],
  status: 'present',
  location: 'Test Office',
  coords_lat: -1.2517,
  coords_lng: 36.7989,
  created_at: new Date().toISOString()
});
console.log('Saved with ID:', id);
```

**Expected:** ID returned, record exists in DB

**Test: Get Unsynced Records**
- [ ] Save multiple records
- [ ] Query unsynced records
- [ ] Verify correct count and data

**Code to test:**
```typescript
const unsynced = await offlineStorage.getUnsyncedRecords();
console.log('Unsynced:', unsynced.length);
```

**Expected:** Returns all unsynced records

**Test: Mark as Synced**
- [ ] Mark record as synced
- [ ] Verify synced flag updated
- [ ] Confirm not in unsynced query

**Code to test:**
```typescript
await offlineStorage.markAsSynced(recordId);
const count = await offlineStorage.getUnsyncedCount();
```

**Expected:** Count decreases by 1

#### Test 2.4: Sync Service

**Test: Auto-Sync Initialization**
- [ ] Start auto-sync
- [ ] Verify periodic sync begins
- [ ] Check console for sync logs

**Code to test:**
```typescript
syncService.startAutoSync((result) => {
  console.log('Sync result:', result);
});
```

**Expected:** Sync runs every 2 minutes

**Test: Manual Sync**
- [ ] Create unsynced records in SQLite
- [ ] Trigger manual sync
- [ ] Verify records uploaded to Supabase
- [ ] Confirm marked as synced locally

**Code to test:**
```typescript
const result = await syncService.syncOfflineRecords();
console.log('Synced:', result.syncedCount);
console.log('Failed:', result.failedCount);
```

**Expected:** 
- `syncedCount` matches number of pending records
- `failedCount === 0`
- Records visible in Supabase

**Test: Network Detection**
- [ ] Verify online status detected correctly
- [ ] Go offline, verify detection
- [ ] Go online, verify sync triggers

**Code to test:**
```typescript
console.log('Online:', syncService.isOnline());
// Toggle WiFi/data
console.log('Online:', syncService.isOnline());
```

**Expected:** Accurate online/offline status

---

### 3. Integration Tests

#### Test 3.1: Online Check-In Flow

**Prerequisites:**
- [ ] User logged in
- [ ] At office location (or mocked GPS)
- [ ] Internet connection available

**Steps:**
1. [ ] Navigate to attendance page
2. [ ] Tap "Check In" button
3. [ ] Grant location permission if prompted
4. [ ] Wait for GPS lock
5. [ ] Verify success message

**Verify:**
- [ ] "Checked in at [TIME]" message shown
- [ ] Record appears in attendance history
- [ ] Record exists in Supabase `attendance_records` table
- [ ] `coords` column populated with GPS coordinates
- [ ] `is_offline_sync` is false or null
- [ ] `synced_at` is null

**SQL to verify:**
```sql
SELECT * FROM attendance_records 
WHERE user_id = '<user_id>' 
AND date = CURRENT_DATE
ORDER BY check_in_time DESC 
LIMIT 1;
```

**Expected:** Record with GPS coordinates, created today

#### Test 3.2: Offline Check-In Flow

**Prerequisites:**
- [ ] User logged in
- [ ] At office location
- [ ] Internet connection DISABLED (Airplane mode or WiFi/data off)

**Steps:**
1. [ ] Disable WiFi and mobile data
2. [ ] Verify "Offline" indicator shown
3. [ ] Navigate to attendance page
4. [ ] Tap "Check In" button
5. [ ] Grant location permission if prompted
6. [ ] Wait for GPS lock
7. [ ] Verify "Saved Offline" message

**Verify:**
- [ ] "Checked in at [TIME] (Offline)" message shown
- [ ] Record appears in local attendance list
- [ ] Record saved in SQLite (not yet in Supabase)
- [ ] "1 pending" badge shown in status bar

**SQLite to verify (via debug console):**
```typescript
const unsynced = await offlineStorage.getUnsyncedRecords();
console.log(unsynced);
```

**Expected:** 1 unsynced record with correct data

#### Test 3.3: Auto-Sync When Reconnected

**Prerequisites:**
- [ ] Offline check-in completed (Test 3.2)
- [ ] App still open
- [ ] Internet still disabled

**Steps:**
1. [ ] Verify "1 pending" badge visible
2. [ ] Re-enable WiFi or mobile data
3. [ ] Wait up to 2 minutes for auto-sync
4. [ ] Observe status bar

**Verify:**
- [ ] "Offline" changes to "Online"
- [ ] "Syncing..." message briefly shown
- [ ] "1 pending" badge disappears
- [ ] "Synced successfully" message shown
- [ ] Record now in Supabase with `is_offline_sync = true` and `synced_at` populated

**SQL to verify:**
```sql
SELECT * FROM attendance_records 
WHERE user_id = '<user_id>' 
AND is_offline_sync = true
ORDER BY synced_at DESC 
LIMIT 1;
```

**Expected:** Record with `synced_at` timestamp

#### Test 3.4: Manual Sync

**Prerequisites:**
- [ ] Multiple offline records exist
- [ ] Internet connection available

**Steps:**
1. [ ] Tap "Sync Now" button
2. [ ] Observe progress indicator
3. [ ] Wait for completion

**Verify:**
- [ ] All pending records uploaded
- [ ] Badge count decreases to 0
- [ ] Success message shown
- [ ] All records visible in Supabase

**Expected:** All records synced successfully

#### Test 3.5: Geofence Too Far Error

**Prerequisites:**
- [ ] User logged in
- [ ] NOT at office location (or mock GPS far away)
- [ ] Internet connection available

**Steps:**
1. [ ] Navigate to attendance page
2. [ ] Tap "Check In" button
3. [ ] Wait for GPS lock

**Verify:**
- [ ] Error message: "You must be at the office to check in. You are [XXX]m away."
- [ ] No record created
- [ ] Distance shown is accurate

**Expected:** Check-in blocked, error message clear

---

### 4. Background Geofencing Tests

⚠️ **Note:** These tests require physical device and may take time.

#### Test 4.1: Geofence Notification on Arrival

**Prerequisites:**
- [ ] App installed on physical device
- [ ] Location permission set to "Always Allow"
- [ ] Background app refresh enabled (iOS)
- [ ] Battery optimization disabled for app (Android)
- [ ] User logged in

**Steps:**
1. [ ] Close app completely (swipe away)
2. [ ] Travel to location outside geofence (> 500m)
3. [ ] Wait 2 minutes
4. [ ] Travel to office location (inside geofence)
5. [ ] Wait up to 5 minutes

**Verify:**
- [ ] Notification received: "[Title] - [Body]"
- [ ] Notification includes office name/identifier
- [ ] Tap notification opens app to check-in page

**Expected:** Notification within 2-5 minutes of arrival

**If notification NOT received, check:**
- [ ] Location permission is "Always Allow" (not "While Using")
- [ ] Background app refresh enabled
- [ ] Geofence coordinates are correct
- [ ] Device GPS/location services enabled
- [ ] Battery saver mode not interfering

#### Test 4.2: No Notification When Already Inside

**Prerequisites:**
- [ ] Already tested arrival notification (Test 4.1)
- [ ] Currently at office

**Steps:**
1. [ ] Close app
2. [ ] Wait 10 minutes (remain at office)

**Verify:**
- [ ] No duplicate notifications received

**Expected:** No notification (already inside geofence)

#### Test 4.3: App Closed Scenario

**Prerequisites:**
- [ ] App force-closed
- [ ] Outside geofence

**Steps:**
1. [ ] Force stop app (Settings → Apps → FKF HR → Force Stop)
2. [ ] Travel to office

**Verify:**
- [ ] Notification still received (OS wakes app)

**Expected:** Notification works even when app closed

---

### 5. UI/UX Tests

#### Test 5.1: Mobile Status Indicator

**Test: Online Status**
- [ ] Start with internet enabled
- [ ] Verify green dot with "Online" text
- [ ] Disable internet
- [ ] Verify red dot with "Offline" text
- [ ] Re-enable internet
- [ ] Verify returns to green "Online"

**Expected:** Real-time status updates

**Test: Pending Badge**
- [ ] Create offline check-in
- [ ] Verify "1 pending" badge shown
- [ ] Create another offline check-in
- [ ] Verify "2 pending" badge shown
- [ ] Sync records
- [ ] Verify badge disappears

**Expected:** Accurate pending count

**Test: Sync Button**
- [ ] When online with pending records, verify button shown
- [ ] Tap button
- [ ] Verify "Syncing..." state
- [ ] Verify success message
- [ ] When no pending records, verify button hidden

**Expected:** Button behavior correct

**Test: Location Check Button**
- [ ] Tap location button
- [ ] Verify distance shown
- [ ] Verify "At office" or "Not at office" message

**Expected:** Accurate location feedback

#### Test 5.2: GeofenceSettings Admin UI

**Prerequisites:**
- [ ] Logged in as HR Admin or Super Admin

**Test: Load Settings**
- [ ] Navigate to Geofence Settings page
- [ ] Verify current values loaded

**Expected:** Values from database displayed

**Test: Update Coordinates**
- [ ] Change latitude/longitude
- [ ] Click "View on Map"
- [ ] Verify correct location opens in Google Maps

**Expected:** Map shows correct location

**Test: Use Current Location**
- [ ] Click "Use Current Location" button
- [ ] Grant location permission
- [ ] Verify coordinates populated with current location

**Expected:** Lat/lng updated automatically

**Test: Update Radius**
- [ ] Change radius slider
- [ ] Verify visualization updates
- [ ] Verify label changes (tight/recommended/large)

**Expected:** Live preview updates

**Test: Update Notification Text**
- [ ] Change notification title and body
- [ ] Verify character counts update
- [ ] Verify preview panel updates

**Expected:** Live preview of notification

**Test: Save Settings**
- [ ] Make changes
- [ ] Click Save
- [ ] Verify success message
- [ ] Reload page
- [ ] Verify changes persisted

**Expected:** Settings saved to database

**Test: Validation**
- [ ] Enter invalid latitude (e.g., 100)
- [ ] Try to save
- [ ] Verify error message

**Expected:** Validation prevents invalid data

---

### 6. Error Handling Tests

#### Test 6.1: Location Permission Denied

**Steps:**
1. [ ] Deny location permission
2. [ ] Try to check in
3. [ ] Observe error message

**Expected:** "Location permission denied" error shown

#### Test 6.2: GPS Unavailable

**Steps:**
1. [ ] Disable GPS/Location Services in device settings
2. [ ] Try to check in
3. [ ] Observe error

**Expected:** "Could not get GPS location" error

#### Test 6.3: Network Error During Sync

**Steps:**
1. [ ] Create offline records
2. [ ] Enable internet but modify Supabase URL to invalid
3. [ ] Trigger sync
4. [ ] Observe behavior

**Expected:** 
- Sync fails gracefully
- Records remain unsynced
- Error logged
- User notified

#### Test 6.4: Duplicate Check-In

**Steps:**
1. [ ] Check in successfully
2. [ ] Try to check in again same day
3. [ ] Observe error

**Expected:** "Already checked in today" error

---

### 7. Performance Tests

#### Test 7.1: GPS Lock Speed
- [ ] Force GPS cold start (reboot device)
- [ ] Open app and try check-in
- [ ] Time how long until GPS lock

**Target:** < 10 seconds in open area

#### Test 7.2: Check-In Speed
- [ ] Measure time from tap "Check In" to success message
- [ ] Test when online
- [ ] Test when offline

**Target:** 
- Online: < 3 seconds
- Offline: < 2 seconds

#### Test 7.3: Sync Speed
- [ ] Create 10 offline records
- [ ] Measure sync time

**Target:** < 5 seconds for 10 records

#### Test 7.4: App Launch Time
- [ ] Close app completely
- [ ] Launch app
- [ ] Time until ready

**Target:** < 2 seconds on mid-range device

#### Test 7.5: Battery Impact
- [ ] Install app with geofencing enabled
- [ ] Use device normally for full day
- [ ] Check battery usage stats

**Target:** < 5% daily battery drain from app

---

### 8. Cross-Platform Tests

#### Test 8.1: Android Specific

**Device:** Android 8.0+

- [ ] Install APK
- [ ] Grant permissions
- [ ] Test all flows (online, offline, sync, geofence)
- [ ] Verify notification style
- [ ] Check background geofencing
- [ ] Test on multiple Android versions if possible

**Known Issues:**
- Android 10+ requires explicit background location permission
- Some manufacturers (Huawei, Xiaomi) have aggressive battery optimization

#### Test 8.2: iOS Specific

**Device:** iOS 13+

- [ ] Install IPA
- [ ] Grant permissions (especially "Always Allow")
- [ ] Test all flows
- [ ] Verify notification style
- [ ] Check background geofencing
- [ ] Test on multiple iOS versions if possible

**Known Issues:**
- iOS may pause geofencing if app not used regularly
- Notification authorization must be explicit

---

### 9. Security Tests

#### Test 9.1: Unauthorized Access

**Steps:**
1. [ ] Log out
2. [ ] Try to access attendance features
3. [ ] Verify redirected to login

**Expected:** Authentication required

#### Test 9.2: RLS Verification

**Steps:**
1. [ ] Log in as Staff User A
2. [ ] Try to query User B's attendance
3. [ ] Verify blocked by RLS

**SQL to test:**
```sql
SELECT * FROM attendance_records 
WHERE user_id != auth.uid();
```

**Expected:** No results (RLS blocks)

#### Test 9.3: SQL Injection

**Steps:**
1. [ ] Try to inject SQL in notes field
2. [ ] Verify sanitized

**Input:** `'; DROP TABLE attendance_records; --`

**Expected:** Treated as plain text, no SQL executed

---

### 10. Regression Tests

After any code changes, re-test:

**Critical Paths:**
- [ ] Online check-in
- [ ] Offline check-in
- [ ] Auto-sync when reconnected
- [ ] Geofence notification
- [ ] Admin settings save

**Expected:** All critical features still working

---

## ✅ Test Sign-Off

### Test Summary

| Category | Total Tests | Passed | Failed | Notes |
|----------|-------------|--------|--------|-------|
| Database | ___ | ___ | ___ |  |
| Services | ___ | ___ | ___ |  |
| Integration | ___ | ___ | ___ |  |
| Geofencing | ___ | ___ | ___ |  |
| UI/UX | ___ | ___ | ___ |  |
| Error Handling | ___ | ___ | ___ |  |
| Performance | ___ | ___ | ___ |  |
| Cross-Platform | ___ | ___ | ___ |  |
| Security | ___ | ___ | ___ |  |
| **TOTAL** | **___** | **___** | **___** |  |

### Test Environment

- **Date Tested:** _______________
- **Tester Name:** _______________
- **Android Device:** _______________
- **iOS Device:** _______________
- **Supabase Instance:** _______________

### Blockers

List any critical issues found:

1. 
2. 
3. 

### Approval

- [ ] All critical tests passed
- [ ] No blocking issues
- [ ] Performance acceptable
- [ ] Ready for production

**QA Sign-Off:** _______________ **Date:** _______________

**PM Sign-Off:** _______________ **Date:** _______________

---

## 📝 Notes

- Tests should be performed on physical devices, not simulators (for GPS/geofencing)
- Allow adequate time for geofence triggers (2-5 minutes)
- Test in various network conditions (WiFi, 4G, 3G, offline)
- Test in different GPS conditions (outdoors, near windows, indoors)
- Document any device-specific issues

---

**Document Version:** 1.0  
**Last Updated:** March 5, 2026  
**Next Review:** After production deployment
