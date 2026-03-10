# Multi-Location Geofencing - Setup & Usage Guide

## 📍 Overview

The HR Management System now supports **multiple office locations** with individual geofencing settings. Organizations with multiple branches can configure separate geofences for each office, allowing staff to receive automatic check-in notifications at whichever location they arrive at.

## ✨ New Features

### 1. **Quick Location Capture**
- **One-Click GPS Capture**: Use "📍 Use My Current Location" button to instantly capture your exact GPS coordinates
- **High Accuracy**: Uses `enableHighAccuracy: true` for precise positioning (typically 5-10 meter accuracy)
- **No Manual Input Required**: Eliminates errors from manually typing coordinates

### 2. **Multiple Office Support**
- **Unlimited Locations**: Add as many office locations as your organization needs
- **Individual Settings**: Each location has its own:
  - Name and identification
  - GPS coordinates and geofence radius
  - Custom notification title and message
- **Active/Inactive Toggle**: Enable or disable locations without deleting them
- **Default Location**: Set a primary location that appears first in the mobile app

### 3. **Enhanced UI**
- **Visual Location Cards**: Easy-to-scan cards showing all configured locations
- **Map Integration**: View any location on Google Maps with one click
- **Edit/Delete Management**: Simple controls for managing locations
- **Real-Time Preview**: See notification preview before saving

---

## 🚀 Quick Start Guide

### Step 1: Run Database Migration

Before using the multi-location feature, run the database migration:

1. Open **Supabase SQL Editor**
2. Navigate to: `supabase/add_multiple_office_locations.sql`
3. Copy and execute the SQL script
4. ✅ Verify success message appears

**What it does:**
- Creates `office_locations` table
- Migrates any existing geofence data from `system_settings`
- Sets up indexes and permissions
- Creates `active_office_locations` view

### Step 2: Add Your First Location

#### Option A: Use Current Location (Recommended for Accuracy)

1. **Go to the Office**: Physically go to your office location
2. **Login as Admin**: Access the Admin Dashboard
3. **Navigate**: Admin > Geofence Settings
4. **Click**: Big purple button "📍 Use My Current Location"
5. **Wait**: 1-3 seconds while GPS acquires high-accuracy coordinates
6. **Fill Details**:
   - Give it a name (e.g., "Main Office", "Branch 1", "Warehouse")
   - Set geofence radius (recommended: 100-150 meters)
   - Customize notification messages
   - Check "Set as Default Location" for primary office
7. **Save**: Click "Add Location"

✅ **Result**: Location added with exact coordinates (accurate to ~5-10 meters)

#### Option B: Manual Entry

1. **Navigate**: Admin > Geofence Settings
2. **Click**: "➕ Add Location Manually"
3. **Enter Coordinates**:
   - **Latitude**: -1.286389 (range: -90 to 90)
   - **Longitude**: 36.817223 (range: -180 to 180)
   - **How to find**: Use Google Maps → Right-click location → Copy coordinates
4. **Test Location**: Click "🗺️ View on Map" to verify coordinates
5. **Set Radius**: 100-200 meters recommended
6. **Customize Notifications**
7. **Save**

### Step 3: Add Additional Locations

1. **Click**: "📍 Use My Current Location" OR "➕ Add Location Manually"
2. **Repeat** Step 2 for each additional office/branch
3. Each location is independent with its own settings

---

## 🎯 How It Works for Staff

### Mobile App Behavior

1. **Staff Arrives at Any Office**
   - Mobile app detects entry into geofence radius
   - Notification appears: "Welcome to [Office Name]!"
   - Staff can tap notification to open check-in screen

2. **Multiple Offices**
   - Staff receives notification at whichever office they arrive at
   - Each office has its own custom notification message
   - System automatically logs which office they checked in at

3. **Offline Support**
   - Location checks work offline
   - Check-ins stored locally if no internet
   - Auto-syncs when connection restored

---

## 📋 Managing Locations

### View All Locations

- Navigate to: **Admin > Geofence Settings**
- All configured locations display as cards
- Shows:
  - Location name and badges (Default, Inactive)
  - GPS coordinates
  - Geofence radius
  - Notification preview

### Edit a Location

1. Click **✏️ Edit** button on location card
2. Update any fields:
   - Name, coordinates, radius, notifications
   - Active/inactive status
   - Default location flag
3. Use **"📍 Update to Current Location"** to recapture GPS coordinates
4. Click **"Update Location"**

### Delete a Location

1. Click **🗑️ Delete** button on location card
2. Confirm deletion
3. Location removed from database
4. Staff will no longer receive notifications for that location

### Set Default Location

- Check **"Set as Default Location"** when editing/adding
- Default location:
  - Appears first in mobile app location list
  - Used as primary reference for distance calculations
  - Shows "Default" badge
- Only one default location allowed at a time

### Enable/Disable Locations

- Uncheck **"Active"** to temporarily disable a location
- Inactive locations:
  - Not monitored by mobile app
  - Not shown in check-in screens
  - Preserved in database for later reactivation
  - Show "Inactive" badge and grayed out appearance

---

## 🎨 Best Practices

### GPS Accuracy

**Recommended Approach:**
1. ✅ Use "📍 Use Current Location" while physically at the office
2. ✅ Stand outside or near windows for better GPS signal
3. ✅ Wait for accuracy message (typically shows ~5-20m accuracy)
4. ❌ Avoid using manual coordinates unless necessary

**Why Location Accuracy Matters:**
- Geofencing triggers based on distance from coordinates
- 10-meter GPS error = 10-meter smaller/larger geofence
- High accuracy prevents false triggers or missed notifications

### Geofence Radius Settings

| Radius | Use Case | Pros | Cons |
|--------|----------|------|------|
| **50m** | Small office buildings | Tight control | May miss edge cases |
| **100m** | Standard offices (recommended) | Balanced | Good default |
| **150m** | Large campuses | Wider coverage | May trigger too early |
| **200m+** | Industrial sites, warehouses | Maximum coverage | Less precise |

**Rule of Thumb**: Set radius to cover parking lot and building entrances

### Notification Messages

**Good Examples:**
- ✅ "Welcome to Main Office! Tap to check in."
- ✅ "You've arrived at Branch 2. Time to sign in!"
- ✅ "Hi! You're at the Warehouse. Don't forget to clock in."

**Poor Examples:**
- ❌ "Geofence triggered" (too technical)
- ❌ "Check in now!" (too commanding, no context)
- ❌ Long messages that get truncated

**Tips:**
- Keep titles under 50 characters
- Keep messages under 120 characters
- Include office name for clarity
- Use friendly, welcoming tone
- Add emoji for visual appeal (optional)

### Security & Privacy

**Location Data Handling:**
- GPS coordinates stored securely in database
- Only admins can view/edit office locations
- Staff only see office names, not exact coordinates
- All location checks happen locally on device
- Background location tracking respects OS permissions

**Permission Requirements:**
- iOS: "Location > Always Allow" in Settings
- Android: "Allow all the time" in app permissions
- Staff must explicitly grant permission
- App explains why location access is needed

---

## 🔧 Technical Details

### Database Schema

**Table: `office_locations`**
```sql
Column                | Type         | Description
---------------------|--------------|---------------------------
id                   | SERIAL       | Primary key
name                 | VARCHAR(100) | Office name
latitude             | DECIMAL      | GPS latitude (-90 to 90)
longitude            | DECIMAL      | GPS longitude (-180 to 180)
radius               | INTEGER      | Geofence radius in meters (10-1000)
notification_title   | VARCHAR(100) | Notification heading
notification_body    | VARCHAR(200) | Notification message
is_active            | BOOLEAN      | Enable/disable location
is_default           | BOOLEAN      | Primary location flag
created_at           | TIMESTAMPTZ  | Creation timestamp
updated_at           | TIMESTAMPTZ  | Last update timestamp
```

**Constraints:**
- Only one default location allowed (`is_default = true`)
- Latitude range: -90 to 90
- Longitude range: -180 to 180
- Radius range: 10 to 1000 meters

### API Changes

**New Functions:**
```typescript
// Load all active office locations
loadAllGeofenceConfigs(): Promise<GeofenceConfig[]>

// Get office locations (alias)
getOfficeLocations(): Promise<GeofenceConfig[]>

// Check if at any office
checkIfAtOffice(): Promise<{
  isAtOffice: boolean;
  distance: number;
  office?: GeofenceConfig;
}>
```

**Backwards Compatibility:**
- `loadGeofenceConfig()` still works (returns first location)
- Legacy `system_settings` table still supported as fallback
- Existing code continues to work without changes

### Performance

**Caching:**
- Office locations cached for 5 minutes
- Cache refreshed automatically when stale
- Manual cache clear after updates (`clearGeofenceCache()`)

**Mobile App Load:**
- Locations loaded once at app startup
- Background monitoring detects all geofences
- Minimal battery impact (uses efficient native APIs)

---

## 🧪 Testing Guide

### Test New Location Setup

1. **Add Test Location:**
   - Use your current location (home, coffee shop, etc.)
   - Set small radius (50m) for precise testing
   - Set custom notification: "TEST - You are at [Location]"

2. **Verify on Mobile:**
   - Close and restart mobile app
   - Walk to test location
   - Wait 2-5 minutes (geofence detection delay)
   - Check if notification appears

3. **Test Check-In:**
   - Tap notification
   - Verify check-in screen opens
   - Complete check-in
   - Verify attendance record saved

4. **Clean Up:**
   - Delete test location after verification
   - Or mark as inactive

### Test Multiple Locations

1. Add 2-3 locations (can be close together for testing)
2. Walk between locations
3. Verify correct notification for each
4. Check that staff app shows all active locations
5. Verify check-ins log correct office name

### Test Default Location

1. Set one location as default
2. Try setting another location as default
3. Verify only one location has "Default" badge
4. Check that default location appears first in mobile app

---

## 📊 Migration Path

### From Single Location to Multiple Locations

**Existing System (Legacy):**
- Single office location in `system_settings` table
- All staff used same geofence

**After Migration:**
- Legacy location automatically migrated to `office_locations` as "Main Office"
- Set as default location
- All existing staff continue to work without changes

**To Add More Locations:**
1. Run migration script (one-time)
2. Add additional locations via admin UI
3. Staff mobile apps auto-detect new locations on restart

---

## ❓ Troubleshooting

### "Error loading office locations"

**Cause:** Database table not created
**Fix:** Run `supabase/add_multiple_office_locations.sql` migration

### Notification not appearing on mobile

**Possible Causes:**
1. Location permission not granted → Check Settings > App > Location > "Always Allow"
2. Notification permission denied → Check Settings > Notifications > App > Allow
3. Geofence not triggered yet → Wait 2-5 minutes, or restart app
4. Location set as inactive → Check admin panel, ensure "Active" is checked

### GPS coordinates incorrect

**Fix:**
1. Edit location in admin panel
2. Go physically to office
3. Click "📍 Update to Current Location"
4. Wait for high-accuracy GPS lock (10-20 seconds)
5. Verify with "🗺️ View on Map" before saving

### Staff not seeing new locations

**Cause:** Mobile app cache
**Fix:** Staff must restart mobile app to load new locations

### Multiple notifications triggering

**Cause:** Overlapping geofences
**Fix:** 
1. Check if two locations are close together
2. Reduce radius to prevent overlap
3. Or deactivate one location

---

## 📱 Screenshots Guide

### Admin UI Flow

```
1. Geofence Settings Landing
   ├─ Quick Add Card (purple gradient)
   │  ├─ "📍 Use My Current Location" (primary button)
   │  └─ "➕ Add Location Manually" (secondary)
   │
   ├─ Location Cards Grid
   │  ├─ Card: Main Office (Default badge)
   │  ├─ Card: Branch 1
   │  └─ Card: Warehouse (Inactive badge)
   │
   └─ Info Box (blue)

2. Add/Edit Form
   ├─ Location Details
   │  ├─ Name input
   │  ├─ Default checkbox
   │  └─ Active checkbox
   │
   ├─ GPS Coordinates
   │  ├─ Latitude input
   │  ├─ Longitude input
   │  ├─ "Update to Current Location" button
   │  └─ "View on Map" button
   │
   ├─ Geofence Settings
   │  └─ Radius slider with visual indicator
   │
   └─ Notification Messages
      ├─ Title input (50 chars)
      ├─ Body textarea (200 chars)
      └─ Mobile preview box
```

---

## 🎓 Training Staff

### For Administrators

**Key Skills:**
1. Adding locations using current location feature
2. Setting appropriate geofence radius
3. Writing clear notification messages
4. Managing active/inactive locations
5. Testing geofences before enabling

**Training Time:** 15-20 minutes

### For Staff

**What They Need to Know:**
1. Grant location permission: "Always Allow"
2. Enable notifications
3. Keep location services on
4. Expect 2-5 minute delay for geofence trigger
5. Tap notification to check in

**Training Time:** 5 minutes

---

## 📞 Support & Feedback

### Common Questions

**Q: Can I have different geofence radii for different offices?**
A: Yes! Each office has independent radius setting.

**Q: Do staff see all office locations?**
A: Staff only see office names, not GPS coordinates or admin settings.

**Q: What happens if staff is between two offices?**
A: Whichever geofence they enter first triggers the notification.

**Q: Can I temporarily disable a location during holidays?**
A: Yes, uncheck "Active" - it preserves settings for later reactivation.

**Q: Is there a limit on number of locations?**
A: No hard limit, but recommend under 20 for performance.

---

## 🔮 Future Enhancements

**Planned Features:**
- 📊 Analytics: Which office has most check-ins
- 🗓️ Schedule: Auto-enable/disable locations by day/time
- 👥 Assignment: Assign staff to specific locations
- 📍 Geofence shapes: Polygons instead of circles
- 🗺️ Map view: Visual map showing all locations

---

## 📄 Version History

**v2.0.0** - March 2026
- ✨ Multi-location geofencing support
- ✨ Quick GPS capture with "Use Current Location"
- ✨ Individual location settings
- ✨ Active/inactive toggle
- ✨ Default location designation
- 🗄️ Migration from single to multiple locations
- 🎨 Enhanced UI with location cards

**v1.0.0** - Previous
- Single office location support
- Basic geofencing
- Stored in `system_settings` table

---

## 📚 Related Documentation

- **MOBILE_ATTENDANCE_BLUEPRINT.md** - Complete technical specifications
- **MOBILE_ATTENDANCE_TESTING.md** - Comprehensive testing checklist
- **EMAIL_NOTIFICATIONS_SETUP.md** - Notification system setup
- **PHASE3_IMPLEMENTATION_GUIDE.md** - Overall system implementation

---

**Last Updated:** March 6, 2026 | **Author:** GitHub Copilot | **Version:** 2.0.0
