# Mobile Attendance System - Complete Blueprint

**Date:** March 5, 2026  
**System:** FKF HR Management System  
**Version:** 1.0  
**Status:** ✅ IMPLEMENTED

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [High-Level Architecture](#high-level-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Geofencing Implementation](#geofencing-implementation)
6. [Offline Functionality](#offline-functionality)
7. [Implementation Details](#implementation-details)
8. [Security & Permissions](#security--permissions)
9. [Testing Strategy](#testing-strategy)
10. [Deployment Guide](#deployment-guide)

---

## Executive Summary

### Purpose
Enable staff to check in for attendance using their mobile devices with automatic geofence-triggered notifications, GPS verification, and offline capability.

### Key Features
- ✅ **Background Geofencing**: Automatic notification when staff arrive at office
- ✅ **GPS Verification**: Precise location tracking to verify physical presence
- ✅ **Offline-First**: Record attendance even without internet connection
- ✅ **Auto-Sync**: Seamless synchronization when connectivity is restored
- ✅ **Multi-Platform**: Native iOS and Android support via Capacitor

### User Experience Flow
```
Staff Arrives at Office → Background Geofence Triggered → Push Notification Sent
          ↓
Staff Taps Notification → App Opens to Check-In Screen → GPS Location Captured
          ↓
Internet Available? → YES → Save to Supabase Directly
                   → NO  → Save to Local SQLite
          ↓
Confirmation Shown: "Checked in at [TIME]" (Online/Offline indicator)
          ↓
[If Offline] When Internet Returns → Auto-Sync to Supabase
```

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      MOBILE APP LAYER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ React + Vite │  │  Capacitor   │  │  TypeScript  │     │
│  │   UI Layer   │  │ Native Bridge│  │ Type Safety  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    NATIVE SERVICES LAYER                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Background   │  │     GPS      │  │    Local     │     │
│  │ Geolocation  │  │  Tracking    │  │Notifications │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    OFFLINE STORAGE LAYER                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │    SQLite    │  │ Sync Service │  │Network Monitor│    │
│  │  Local DB    │  │  Auto-Sync   │  │ Online/Offline│    │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                      BACKEND LAYER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Supabase   │  │  PostgreSQL  │  │     Auth     │     │
│  │   Realtime   │  │   Database   │  │     RLS      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend Framework
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **UI Framework** | React | 19.2.0 | User interface |
| **Build Tool** | Vite | 7.2.2 | Fast development & bundling |
| **Language** | TypeScript | 5.9.3 | Type-safe code |
| **Router** | React Router | 7.9.6 | Navigation |

### Mobile Infrastructure
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Native Bridge** | Capacitor | 6.2.1 | iOS/Android integration |
| **GPS Tracking** | @capacitor/geolocation | 6.1.1 | Precise location |
| **Notifications** | @capacitor/local-notifications | 6.1.3 | Push notifications |
| **Background Geo** | @capacitor-community/background-geolocation | 1.2.0 | Geofence monitoring |
| **Local Storage** | @capacitor-community/sqlite | 6.0.0 | Offline database |

### Backend Services
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **BaaS** | Supabase | Backend-as-a-Service |
| **Database** | PostgreSQL 15+ | Relational database with PostGIS |
| **Auth** | Supabase Auth | User authentication |
| **Storage** | Supabase Storage | File storage |
| **Realtime** | Supabase Realtime | Live updates |

---

## Database Schema

### Core Table: `attendance_records`

```sql
CREATE TABLE public.attendance_records (
    -- Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    
    -- Timestamps
    check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Status
    status VARCHAR(20) DEFAULT 'present' 
        CHECK (status IN ('present', 'late', 'half_day', 'absent')),
    
    -- Location (Web - Text-based)
    location VARCHAR(255),
    ip_address INET,
    
    -- GPS Coordinates (Mobile - Precise)
    coords POINT,  -- PostGIS point type: (longitude, latitude)
    
    -- Offline Sync Tracking
    synced_at TIMESTAMPTZ,
    is_offline_sync BOOLEAN DEFAULT false,
    
    -- Additional Data
    notes TEXT,
    work_hours DECIMAL(5,2),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Key Indexes

```sql
-- Standard indexes
CREATE INDEX idx_attendance_user_id ON attendance_records(user_id);
CREATE INDEX idx_attendance_date ON attendance_records(date);
CREATE INDEX idx_attendance_user_date ON attendance_records(user_id, date);

-- Spatial index for GPS queries
CREATE INDEX idx_attendance_coords ON attendance_records USING GIST (coords);

-- Offline sync indexes
CREATE INDEX idx_attendance_synced_at ON attendance_records(synced_at) 
    WHERE synced_at IS NOT NULL;
CREATE INDEX idx_attendance_offline_sync ON attendance_records(is_offline_sync) 
    WHERE is_offline_sync = true;

-- Prevent duplicate check-ins
CREATE UNIQUE INDEX idx_unique_user_date ON attendance_records(user_id, date);
```

### Helper Function: Distance Calculation

```sql
CREATE OR REPLACE FUNCTION calculate_distance(
    coords1 POINT,
    coords2 POINT
) RETURNS NUMERIC AS $$
DECLARE
    lat1 NUMERIC;
    lon1 NUMERIC;
    lat2 NUMERIC;
    lon2 NUMERIC;
    r NUMERIC := 6371000; -- Earth radius in meters
    d_lat NUMERIC;
    d_lon NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    IF coords1 IS NULL OR coords2 IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Extract coordinates (PostgreSQL POINT format: (x,y) = (longitude, latitude))
    lon1 := coords1[0];
    lat1 := coords1[1];
    lon2 := coords2[0];
    lat2 := coords2[1];
    
    -- Haversine formula
    d_lat := radians(lat2 - lat1);
    d_lon := radians(lon2 - lon1);
    
    a := sin(d_lat/2) * sin(d_lat/2) +
         cos(radians(lat1)) * cos(radians(lat2)) *
         sin(d_lon/2) * sin(d_lon/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));
    
    RETURN r * c; -- Distance in meters
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### Geofence Configuration Table

```sql
CREATE TABLE IF NOT EXISTS public.system_settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example settings structure
{
  "office_latitude": -1.2517,
  "office_longitude": 36.7989,
  "geofence_radius": 100,
  "geofence_notification_title": "Welcome to FKF!",
  "geofence_notification_body": "You are at the office. Tap to sign in."
}
```

---

## Geofencing Implementation

### Configuration File
**Location:** `frontend/src/config/geofenceConfig.ts`

```typescript
export interface GeofenceConfig {
  latitude: number;
  longitude: number;
  radius: number; // in meters
  notificationTitle: string;
  notificationBody: string;
  identifier: string;
}

// Default configuration (FKF Office - Nairobi)
export const OFFICE_GEOFENCE: GeofenceConfig = {
  latitude: -1.2517,  // QV9X+4H3
  longitude: 36.7989,
  radius: 100, // 100 meters
  notificationTitle: 'Welcome to FKF!',
  notificationBody: 'You are at the office. Tap to sign in.',
  identifier: 'fkf-office-main',
};
```

### Geofencing Service
**Location:** `frontend/src/services/geofencingService.ts`

**Key Methods:**
- `initialize()` - Setup notification permissions
- `startMonitoring()` - Begin geofence tracking
- `checkIfAtOffice()` - Verify current location
- `showGeofenceNotification()` - Display arrival notification
- `setupNotificationHandlers()` - Handle notification taps

**How It Works:**
1. App initializes geofence with office coordinates and radius
2. Native OS monitors device location in background
3. When device enters geofence → OS wakes app
4. App schedules local notification
5. User taps notification → App opens to check-in screen

---

## Offline Functionality

### Local SQLite Database
**Location:** `frontend/src/services/offlineStorageService.ts`

**Schema:**
```sql
CREATE TABLE offline_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  check_in_time TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL,
  location TEXT,
  coords_lat REAL NOT NULL,
  coords_lng REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  synced INTEGER DEFAULT 0
);

CREATE INDEX idx_offline_attendance_synced ON offline_attendance(synced);
CREATE INDEX idx_offline_attendance_date ON offline_attendance(date);
```

### Sync Service
**Location:** `frontend/src/services/syncService.ts`

**Features:**
- Auto-sync every 2 minutes when online
- Manual sync trigger
- Network status monitoring
- Bulk insert to Supabase
- Retry logic for failed syncs
- Cleanup of old synced records (30 days)

**Sync Flow:**
```typescript
// Device goes offline
navigator.onLine = false

// User checks in
mobileCheckIn() 
  → saveToSQLite()
  → Show "Saved Offline" message

// Device comes online
navigator.onLine = true

// Auto-sync triggered
syncService.syncOfflineRecords()
  → getUnsyncedRecords()
  → Bulk insert to Supabase
  → Mark as synced in SQLite
  → Clean up old records
```

---

## Implementation Details

### Service Architecture

```
useMobileServices (Hook)
    ↓
    ├─→ offlineStorageService (SQLite)
    ├─→ geofencingService (Background Geo)
    ├─→ locationService (GPS)
    └─→ syncService (Auto-sync)
```

### Location Service
**Location:** `frontend/src/services/locationService.ts`

**Capabilities:**
- Check location permissions
- Get current GPS coordinates
- Calculate distance between points (Haversine)
- Check if within radius of target
- Format coordinates for display

### Attendance Service
**Location:** `frontend/src/services/attendanceService.ts`

**Methods:**
- `checkIn()` - Basic web check-in
- `mobileCheckIn()` - Enhanced mobile check-in with GPS
- `checkOut()` - Record departure time
- `getAttendanceHistory()` - Fetch records

**Mobile Check-In Flow:**
```typescript
async mobileCheckIn() {
  // 1. Get GPS location
  const location = await locationService.getCurrentLocation();
  
  // 2. Verify within geofence
  const geofenceCheck = await geofencingService.checkIfAtOffice();
  if (!geofenceCheck.isAtOffice) {
    throw Error(`Too far from office: ${geofenceCheck.distance}m`);
  }
  
  // 3. Check online status
  if (navigator.onLine) {
    // Save directly to Supabase
    return await saveToSupabase(location);
  } else {
    // Save to SQLite for later sync
    return await offlineStorage.saveAttendance(location);
  }
}
```

---

## Security & Permissions

### iOS Permissions (Info.plist)

```xml
<!-- Location Permissions -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>FKF HR needs your location to verify you are at the office when signing in for attendance.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>FKF HR needs to detect when you arrive at the office to send you a check-in reminder, even when the app is closed.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>FKF HR uses your location to automatically notify you when you arrive at the office for attendance check-in.</string>

<!-- Background Modes -->
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

### Android Permissions (AndroidManifest.xml)

```xml
<!-- Location Permissions -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Notification Permissions (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.VIBRATE" />

<!-- Background Processing -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

### Row Level Security (RLS)

```sql
-- Staff can view/insert/update their own records
CREATE POLICY "Users can manage own attendance"
    ON attendance_records
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- HR Admins can view all records
CREATE POLICY "HR admins can view all attendance"
    ON attendance_records
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users_profile
            WHERE id = auth.uid()
            AND role IN ('hr_admin', 'super_admin')
        )
    );
```

---

## Testing Strategy

### Unit Tests
- Service layer tests (Jest/Vitest)
- Distance calculation accuracy
- Offline storage operations
- Sync logic validation

### Integration Tests
- GPS location capture
- Geofence distance verification
- Online/offline transition
- Database sync operations

### Device Tests
- iOS physical device testing
- Android physical device testing
- Background geofence triggering
- Notification delivery
- Battery consumption monitoring

### Test Checklist
✅ See `MOBILE_ATTENDANCE_TESTING.md`

---

## Deployment Guide

### 1. Database Setup

```bash
# Run in Supabase SQL Editor
psql -f supabase/setup_attendance_system.sql
psql -f supabase/migrate_mobile_attendance.sql
```

### 2. Build Mobile App

```bash
cd frontend

# Install dependencies
npm install

# Build web assets
npm run build

# Sync to native platforms
npx cap sync

# Open in IDE
npx cap open android  # Android Studio
npx cap open ios      # Xcode
```

### 3. Configure Geofence

```sql
-- Insert geofence settings
INSERT INTO system_settings (id, settings) VALUES (
  1,
  '{
    "office_latitude": -1.2517,
    "office_longitude": 36.7989,
    "geofence_radius": 100,
    "geofence_notification_title": "Welcome!",
    "geofence_notification_body": "Tap to sign in"
  }'::jsonb
) ON CONFLICT (id) DO UPDATE
SET settings = EXCLUDED.settings;
```

### 4. Test Deployment

1. **Build signed APK/IPA**
2. **Install on test device**
3. **Grant location permissions** (Always Allow)
4. **Walk to office location**
5. **Verify notification received**
6. **Test check-in with internet**
7. **Test check-in without internet**
8. **Verify auto-sync when reconnected**

---

## Performance Considerations

| Metric | Target | Notes |
|--------|--------|-------|
| **Battery Impact** | < 5% per day | Background geolencing is battery-optimized |
| **Geofence Trigger Time** | 2-5 minutes | OS-dependent, not instant |
| **GPS Accuracy** | ±10-50 meters | Varies by device and environment |
| **Sync Speed** | < 3 seconds | For 10 pending records |
| **App Launch Time** | < 2 seconds | Cold start on mid-range device |

---

## Troubleshooting

### Common Issues

**Issue:** Geofence notifications not received
- **Check:** Location permission set to "Always Allow"
- **Check:** Background app refresh enabled (iOS)
- **Check:** Battery optimization disabled for app (Android)

**Issue:** "Not at office" error when clearly at location
- **Check:** GPS accuracy (wait for better signal)
- **Check:** Geofence radius (may need to increase)
- **Check:** Coordinates are correct (lat/lng not swapped)

**Issue:** Offline records not syncing
- **Check:** Internet connection restored
- **Check:** App is in foreground
- **Check:** Check browser console for sync errors

---

## Future Enhancements

- [ ] Multiple office locations support
- [ ] Dynamic geofence radius based on GPS accuracy
- [ ] Face recognition for additional verification
- [ ] Beacon-based check-in (indoor positioning)
- [ ] Analytics dashboard for location patterns
- [ ] QR code backup check-in method

---

## References

- [Capacitor Documentation](https://capacitorjs.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [Background Geolocation Plugin](https://github.com/capacitor-community/background-geolocation)
- [Haversine Formula](https://en.wikipedia.org/wiki/Haversine_formula)

---

**Document Version:** 1.0  
**Last Updated:** March 5, 2026  
**Author:** FKF Development Team
