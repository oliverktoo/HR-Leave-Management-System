// Attendance Service - Handles all attendance-related API calls
import { supabase } from '../lib/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { locationService } from './locationService';
import { geofencingService } from './geofencingService';
import { offlineStorage } from './offlineStorageService';
import { loadAllGeofenceConfigs, loadMinGPSAccuracy } from '../config/geofenceConfig';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  check_in_time: string;
  check_out_time: string | null;
  date: string;
  status: 'present' | 'late' | 'half_day' | 'absent';
  location?: string;
  ip_address?: string;
  notes?: string;
  work_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSettings {
  id: string;
  work_start_time: string;
  work_end_time: string;
  late_threshold_minutes: number;
  half_day_hours: number;
  full_day_hours: number;
  grace_period_minutes: number;
  enable_location_tracking: boolean;
  require_checkout: boolean;
}

export interface AttendanceSummary {
  user_id: string;
  employee_id: string;
  full_name: string;
  department_id: string | null;
  department_name?: string;
  email: string;
  days_present: number;
  days_late: number;
  half_days: number;
  total_hours: number;
  month: string;
  report_date: string;
}

export interface CheckInData {
  location?: string;
  notes?: string;
  selfie_url?: string;
  face_match_score?: number | null;
  face_verified_auto?: boolean;
}

// Get today's attendance record for the current user
export const getTodayAttendance = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    
    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .maybeSingle();

    return { data, error };
  } catch (error) {
    console.error('Error fetching today attendance:', error);
    return { data: null, error };
  }
};

// Get user's IP address (for tracking purposes)
const getUserIP = async (): Promise<string | undefined> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch (error) {
    console.error('Error fetching IP:', error);
    return undefined;
  }
};

// Get user's location (if enabled)
const getUserLocation = async (): Promise<string | undefined> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(undefined);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        resolve(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      },
      () => resolve(undefined),  // silent — never blocks check-in
      { timeout: 10000, enableHighAccuracy: false }
    );
  });
};

// Check in - Create today's attendance record
export const checkIn = async (checkInData?: CheckInData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    // Get user profile for employee info
    const { data: profile } = await supabase
      .from('users_profile')
      .select('employee_id, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return { data: null, error: { message: 'User profile not found' } };
    }

    const fullName = `${profile.first_name} ${profile.last_name}`;

    // ── PREVENT DOUBLE CHECK-IN ─────────────────────────────────────────────
    // Block a new check-in if the employee already has an open record today.
    const todayDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const { data: openRecord } = await supabase
      .from('attendance_records')
      .select('id, check_out_time')
      .eq('user_id', user.id)
      .eq('date', todayDate)
      .maybeSingle();

    if (openRecord && !openRecord.check_out_time) {
      return {
        data: null,
        error: { message: 'You are already checked in. Please check out first before checking in again.' }
      };
    }
    // ── END DOUBLE CHECK-IN GUARD ────────────────────────────────────────────

    // ── GEOFENCE ENFORCEMENT (web) ──────────────────────────────────────────
    // Geofence IS enforced on web, but with a wider effective radius to account
    // for WiFi/IP-based location inaccuracy on laptops (±200–2000 m typical).
    //
    // We use max(configured_radius, WEB_RADIUS_BUFFER) so that:
    //   • Staff at the office (WiFi may place them 50–400 m off) → PASS
    //   • Staff at home or another city (2–50 km away) → FAIL
    //   • Staff at a nearby café (800 m away) → FAIL
    //
    // If location permission is denied, we show clear browser/OS instructions
    // rather than silently allowing through — this keeps accountability intact.
    const WEB_RADIUS_BUFFER = 500; // metres — minimum effective radius for web

    const { data: geofenceRows } = await supabase.rpc('get_geofence_config');
    const geofenceConfig = Array.isArray(geofenceRows) ? geofenceRows[0] : geofenceRows;

    if (geofenceConfig?.enforce_geofence) {
      if (!navigator.geolocation) {
        return {
          data: null,
          error: { message: 'Your browser does not support location access. Please use Chrome, Edge, or Firefox, or use the mobile app.' }
        };
      }

      const coordsResult = await new Promise<{ coords: GeolocationCoordinates | null; errorCode?: number }>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ coords: pos.coords }),
          (err) => resolve({ coords: null, errorCode: err.code }),
          // enableHighAccuracy: false — use WiFi/network location (fast, works on laptops)
          { timeout: 15000, enableHighAccuracy: false }
        );
      });

      if (!coordsResult.coords) {
        const reason = coordsResult.errorCode === 1
          ? 'Location permission is blocked. To fix:\n1. Click the 🔒 lock icon in your browser address bar\n2. Set Location to "Allow"\n3. Refresh the page and try again\n\nIf still blocked: Windows Settings → Privacy & Security → Location → turn on "Allow apps to access your location"'
          : 'Location services are off on this device. Please go to:\nWindows Settings → Privacy & Security → Location → turn on Location services\n\nThen refresh this page and try again.';
        return { data: null, error: { message: reason } };
      }

      // Check against all active office locations.
      // On web, effective radius = max(configured radius, WEB_RADIUS_BUFFER)
      // to compensate for WiFi positioning inaccuracy.
      const offices = await loadAllGeofenceConfigs();
      let isAtAnyOffice = false;
      let nearestName = 'office';
      let nearestDist = Infinity;
      let nearestRadius = WEB_RADIUS_BUFFER;

      for (const office of offices) {
        const effectiveRadius = Math.max(office.radius, WEB_RADIUS_BUFFER);
        const dist = locationService.calculateDistance(
          coordsResult.coords.latitude,
          coordsResult.coords.longitude,
          office.latitude,
          office.longitude
        );
        if (dist <= effectiveRadius) {
          isAtAnyOffice = true;
          break;
        }
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestName = office.name || 'office';
          nearestRadius = effectiveRadius;
        }
      }

      if (!isAtAnyOffice) {
        return {
          data: null,
          error: { message: `You must be at the office to check in. Your location is ${Math.round(nearestDist)}m from ${nearestName} (must be within ${nearestRadius}m). If you are at the office, please ensure your browser has location permission and try again.` }
        };
      }
    }
    // ── END GEOFENCE ENFORCEMENT ────────────────────────────────────────────

    // Get attendance settings to determine status
    const settings = await getAttendanceSettings();
    
    // Get location and IP if enabled
    const ip_address = await getUserIP();
    const location = settings.data?.enable_location_tracking 
      ? (checkInData?.location || await getUserLocation())
      : undefined;

    // Use server-side clock — date is computed from settings work_start_time
    // but the actual check_in_time timestamp is set by the DB server (now()).
    // Client never submits a timestamp to prevent device clock manipulation.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }); // date only — used for duplicate check

    // Determine late/present status based on server-approximate time
    // (small variance acceptable; the stored time is authoritative server time)
    let status: AttendanceRecord['status'] = 'present';
    if (settings.data) {
      const nowApprox = new Date();
      const workStartTime = new Date(`${today}T${settings.data.work_start_time}+03:00`);
      const minutesLate = (nowApprox.getTime() - workStartTime.getTime()) / (1000 * 60);
      if (minutesLate > settings.data.late_threshold_minutes) {
        status = 'late';
      }
    }

    const { data, error } = await supabase.rpc('server_clock_in', {
      p_employee_id:        profile.employee_id,
      p_employee_name:      fullName,
      p_date:               today,
      p_status:             status,
      p_location:           location ?? null,
      p_ip_address:         ip_address ?? null,
      p_notes:              checkInData?.notes ?? null,
      p_selfie_url:         checkInData?.selfie_url ?? null,
      p_face_match_score:   checkInData?.face_match_score ?? null,
      p_face_verified_auto: checkInData?.face_verified_auto ?? null,
    });

    const record = Array.isArray(data) ? data[0] : data;
    return { data: record, error };
  } catch (error) {
    console.error('Error checking in:', error);
    return { data: null, error };
  }
};

// Mobile Check In - Enhanced check-in with GPS, geofencing, and offline support
export const mobileCheckIn = async (checkInData?: CheckInData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users_profile')
      .select('employee_id, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return { data: null, error: { message: 'User profile not found' } };
    }

    const fullName = `${profile.first_name} ${profile.last_name}`;

    // Get GPS location using Capacitor on mobile
    let locationResult = null;
    let coords = null;
    let locationString = checkInData?.location;

    if (Capacitor.isNativePlatform()) {
      locationResult = await locationService.getCurrentLocation();
      
      if (!locationResult.success || !locationResult.coordinates) {
        return { 
          data: null, 
          error: { message: `Location required: ${locationResult.error || 'Could not get GPS location'}` } 
        };
      }

      coords = locationResult.coordinates;
      locationString = locationService.formatCoordinates(coords.latitude, coords.longitude);

      // Check if within office geofence
      const geofenceCheck = await geofencingService.checkIfAtOffice();
      if (!geofenceCheck.isAtOffice) {
        return {
          data: null,
          error: { 
            message: `You must be at the office to check in. You are ${geofenceCheck.distance}m away.` 
          }
        };
      }
    }

    // Get attendance settings
    const settings = await getAttendanceSettings();
    const nowApprox = new Date(); // approximate — used only for late/present status calc
    const today = nowApprox.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    // Determine late/present status (approximate — actual stored time is server now())
    let status: AttendanceRecord['status'] = 'present';
    if (settings.data) {
      const workStartTime = new Date(`${today}T${settings.data.work_start_time}+03:00`);
      const minutesLate = (nowApprox.getTime() - workStartTime.getTime()) / (1000 * 60);
      if (minutesLate > settings.data.late_threshold_minutes) {
        status = 'late';
      }
    }

    // Check if online
    const isOnline = navigator.onLine;

    // Offline path (mobile only) — queue locally; sync when back online
    if (!isOnline && Capacitor.isNativePlatform() && coords) {
      if (!offlineStorage.isAvailable()) {
        return {
          data: null,
          error: { message: 'Cannot check in offline - offline storage not available' }
        };
      }
      // For offline queue we must store a client time — it will be corrected to
      // server time when the sync RPC runs on reconnect.
      const clientTime = nowApprox.toISOString();
      const offlineId = await offlineStorage.saveAttendance({
        user_id: user.id,
        employee_id: profile.employee_id,
        employee_name: fullName,
        check_in_time: clientTime,
        date: today,
        status,
        location: locationString || '',
        coords_lat: coords.latitude,
        coords_lng: coords.longitude,
        notes: checkInData?.notes,
        created_at: clientTime
      });

      return {
        data: {
          id: `offline_${offlineId}`,
          user_id: user.id,
          employee_id: profile.employee_id,
          employee_name: fullName,
          check_in_time: clientTime,
          check_out_time: null,
          date: today,
          status,
          location: locationString,
          notes: checkInData?.notes,
          created_at: clientTime,
          updated_at: clientTime
        } as AttendanceRecord,
        error: null,
        offline: true
      };
    }

    // Online path — server sets check_in_time = now() (cannot be spoofed)
    const ipAddress = !Capacitor.isNativePlatform() ? await getUserIP() : null;
    const { data, error } = await supabase.rpc('server_clock_in', {
      p_employee_id:        profile.employee_id,
      p_employee_name:      fullName,
      p_date:               today,
      p_status:             status,
      p_location:           locationString ?? null,
      p_ip_address:         ipAddress ?? null,
      p_notes:              checkInData?.notes ?? null,
      p_selfie_url:         checkInData?.selfie_url ?? null,
      p_face_match_score:   checkInData?.face_match_score ?? null,
      p_face_verified_auto: checkInData?.face_verified_auto ?? null,
    });

    const record = Array.isArray(data) ? data[0] : data;
    return { data: record, error, offline: false };
  } catch (error) {
    console.error('Error in mobile check-in:', error);
    return { data: null, error };
  }
};

// Update office presence timestamp (called directly when already confirmed at office)
export const updateOfficePresence = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { error } = await supabase.rpc('update_last_office_presence', {
      p_user_id: user.id,
      p_date: today
    });

    if (error) {
      console.error('Error updating office presence:', error);
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating office presence:', error);
    return { success: false, error };
  }
};

// ─── Presence ping (web + native) ────────────────────────────────────────────
// Called every 10 minutes while the employee has an open attendance record.
// Checks geofence; if at office, updates last_office_presence. Also flags
// presence gaps on still-open records via flag_presence_gaps() RPC.
// Returns whether the employee was confirmed at the office.
export const pingPresenceIfAtOffice = async (): Promise<{
  atOffice: boolean;
  officeName?: string;
  flaggedGap?: boolean;
}> => {
  try {
    // First check if the user has an open record today
    const { data: todayRec } = await getTodayAttendance();
    if (!todayRec || todayRec.check_out_time) {
      // No open record — nothing to ping
      return { atOffice: false };
    }

    let isAtOffice = false;
    let officeName: string | undefined;

    if (Capacitor.isNativePlatform()) {
      const check = await geofencingService.checkIfAtOffice();
      isAtOffice = check.isAtOffice;
      officeName = check.office?.name;
    } else if (navigator.geolocation) {
      // Web path: get browser GPS, check all office geofences
      const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          () => resolve(null),
          { timeout: 15000, enableHighAccuracy: true }
        );
      });

      if (coords) {
        const minAccuracy = await loadMinGPSAccuracy();
        if (coords.accuracy <= minAccuracy) {
          const offices = await loadAllGeofenceConfigs();
          for (const office of offices) {
            const dist = locationService.calculateDistance(
              coords.latitude, coords.longitude,
              office.latitude, office.longitude
            );
            if (dist <= office.radius) {
              isAtOffice = true;
              officeName = office.name;
              break;
            }
          }
        }
      }
    }

    if (isAtOffice) {
      await updateOfficePresence();
    }

    // Flag presence gaps on all open records (RPC checks >30min stale presence)
    let flaggedGap = false;
    const { error: flagErr } = await supabase.rpc('flag_presence_gaps');
    if (flagErr) console.warn('flag_presence_gaps error:', flagErr.message);
    else flaggedGap = !isAtOffice; // if not at office, a gap may have been flagged

    return { atOffice: isAtOffice, officeName, flaggedGap };
  } catch (error) {
    console.error('Presence ping error:', error);
    return { atOffice: false };
  }
};

// ─── Late departure check ─────────────────────────────────────────────────────
// Returns true if current EAT time is between 19:00 and 20:00 (7–8pm window)
// and the employee still has an open attendance record.
export const isLateDepatureWindow = async (): Promise<boolean> => {
  try {
    const { data: todayRec } = await getTodayAttendance();
    if (!todayRec || todayRec.check_out_time) return false;

    // Get current hour in EAT using Intl API
    const hourEAT = parseInt(
      new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour: 'numeric', hour12: false }),
      10
    );

    // Late departure window: 19:00–19:59 EAT
    return hourEAT === 19;
  } catch {
    return false;
  }
};

// Pre-checkout location check — call before checkOut() to show a confirmation UI
export const checkLocationForCheckout = async (): Promise<{
  geofenceEnabled: boolean;
  isAtOffice: boolean | null; // null = unknown / not applicable
  distance?: number;
  officeName?: string;
  projectedCheckoutTime?: string; // ISO string — what time will be recorded if away
}> => {
  try {
    const { data: geofenceRows } = await supabase.rpc('get_geofence_config');
    const geofenceConfig = Array.isArray(geofenceRows) ? geofenceRows[0] : geofenceRows;

    if (!geofenceConfig?.enforce_geofence) {
      return { geofenceEnabled: false, isAtOffice: null };
    }

    // Fetch today's record for last_office_presence
    const { data: { user } } = await supabase.auth.getUser();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const { data: todayRecord } = await supabase
      .from('attendance_records')
      .select('last_office_presence')
      .eq('user_id', user!.id)
      .eq('date', today)
      .maybeSingle();

    let isAtOffice: boolean | null = null;
    let distance: number | undefined;
    let officeName: string | undefined;

    if (Capacitor.isNativePlatform()) {
      const { geofencingService } = await import('./geofencingService');
      const check = await geofencingService.checkIfAtOffice();
      isAtOffice = check.isAtOffice;
      distance = check.distance;
      officeName = check.office?.name;
    } else if (navigator.geolocation) {
      const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          () => resolve(null),
          { timeout: 15000, enableHighAccuracy: false }
        );
      });

      if (coords) {
        const offices = await loadAllGeofenceConfigs();
        let nearestDist = Infinity;
        let nearestOffice = offices[0];

        for (const office of offices) {
          const dist = locationService.calculateDistance(
            coords.latitude, coords.longitude, office.latitude, office.longitude
          );
          if (dist <= office.radius) {
            isAtOffice = true;
            distance = Math.round(dist);
            officeName = office.name;
            break;
          }
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestOffice = office;
          }
        }
        if (isAtOffice === null) {
          isAtOffice = false;
          distance = Math.round(nearestDist === Infinity ? 0 : nearestDist);
          officeName = nearestOffice?.name;
        }
      }
    }

    // Determine what checkout time would be recorded if the employee is away.
    // Rule:
    //   - last_office_presence recorded TODAY → use it (they left without checking out)
    //   - no presence data → use ACTUAL current time (they are checking out now, remotely)
    //   - 5pm fallback is intentionally removed: it was adding time they didn't work
    let projectedCheckoutTime: string | undefined;
    if (isAtOffice === false) {
      if (todayRecord?.last_office_presence) {
        const presenceDate = new Date(todayRecord.last_office_presence).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
        if (presenceDate === today) {
          projectedCheckoutTime = todayRecord.last_office_presence;
        }
      }
      // No presence data → actual time is the honest answer
      if (!projectedCheckoutTime) {
        projectedCheckoutTime = new Date().toISOString();
      }
    }

    return { geofenceEnabled: true, isAtOffice, distance, officeName, projectedCheckoutTime };
  } catch {
    return { geofenceEnabled: false, isAtOffice: null };
  }
};

// Check out - Update today's attendance record with check-out time
// Enforces office presence: uses last_office_presence if not currently at office
export const checkOut = async (notes?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    
    // First, get today's record
    const { data: todayRecord, error: fetchError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    if (fetchError || !todayRecord) {
      return { 
        data: null, 
        error: { message: 'No check-in record found for today. Please check in first.' } 
      };
    }

    if (todayRecord.check_out_time) {
      return { 
        data: null, 
        error: { message: 'You have already checked out today.' } 
      };
    }

    // Check if geofence enforcement should adjust the checkout time
    let checkOutTime = new Date().toISOString();
    let usedLastPresence = false;

    // ── GEOFENCE-AWARE CHECKOUT (web + native) ──────────────────────────────
    // When geofence is enabled, check whether the employee is at the office.
    // If away: use last_office_presence (if tracked) or today's work_end_time
    // as the recorded checkout. We NEVER block checkout outright — the employee
    // must always be able to sign out.
    try {
      const { data: geofenceRows } = await supabase.rpc('get_geofence_config');
      const geofenceConfig = Array.isArray(geofenceRows) ? geofenceRows[0] : geofenceRows;

      if (geofenceConfig?.enforce_geofence) {
        let isAtOfficeNow = true; // default: assume at office on error

        if (Capacitor.isNativePlatform()) {
          const { geofencingService } = await import('./geofencingService');
          const officeCheck = await geofencingService.checkIfAtOffice();
          isAtOfficeNow = officeCheck.isAtOffice;
        } else if (navigator.geolocation) {
          // Web: ask browser for location, check against ALL active office locations
          const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos.coords),
              () => resolve(null),
              { timeout: 15000, enableHighAccuracy: false }
            );
          });
          if (coords) {
            const offices = await loadAllGeofenceConfigs();
            isAtOfficeNow = offices.some(office => {
              const dist = locationService.calculateDistance(
                coords.latitude,
                coords.longitude,
                office.latitude,
                office.longitude
              );
              return dist <= office.radius;
            });
          }
          // If coords are null (permission denied), treat as unknown → keep current time
        }

        if (!isAtOfficeNow) {
          return {
            data: null,
            error: { message: 'Sign-out is restricted to the office zone. You are currently outside the office premises. Please return to the office to sign out, or contact HR if you need an override.' }
          };
        }
      }
    } catch (geoError) {
      console.warn('⚠️ Could not verify office location, proceeding with current time:', geoError);
    }
    // ── END GEOFENCE-AWARE CHECKOUT ──────────────────────────────────────────
    
    // When geofence detected the employee left early, use the recorded presence time
    // (a server-stored timestamp). For the normal at-office path, use server_clock_out
    // RPC which sets check_out_time = now() server-side — cannot be spoofed.
    let data: any, error: any;

    if (usedLastPresence) {
      // Remote checkout — build a note HR can read
      const timeStr = new Date(checkOutTime).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
      const isReconstructed = todayRecord.last_office_presence &&
        new Date(todayRecord.last_office_presence).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) === today &&
        checkOutTime === todayRecord.last_office_presence;
      const autoNote = isReconstructed
        ? `Remote checkout — last seen at office at ${timeStr}`
        : `Remote checkout — checked out from outside office at ${timeStr}`;
      const checkoutNotes = notes ? `${notes} [${autoNote}]` : autoNote;

      const workHours = todayRecord.check_in_time
        ? parseFloat(((new Date(checkOutTime).getTime() - new Date(todayRecord.check_in_time).getTime()) / 3600000).toFixed(2))
        : null;

      ({ data, error } = await supabase
        .from('attendance_records')
        .update({ check_out_time: checkOutTime, notes: checkoutNotes, work_hours: workHours })
        .eq('id', todayRecord.id)
        .select()
        .single());

      if (data) {
        const timeStr = new Date(checkOutTime).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' });
        const isReconstructed = todayRecord.last_office_presence &&
          new Date(todayRecord.last_office_presence).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }) === today &&
          checkOutTime === todayRecord.last_office_presence;
        return {
          data,
          error: null,
          warning: isReconstructed
            ? `Checkout recorded at ${timeStr} — that is when you were last detected at the office.`
            : `Checkout recorded at ${timeStr} (remote checkout outside office).`
        };
      }
    } else {
      // Normal path — server sets check_out_time = now()
      const checkoutNotes = notes ?? todayRecord.notes ?? null;
      const result = await supabase.rpc('server_clock_out', {
        p_record_id: todayRecord.id,
        p_notes: checkoutNotes,
      });
      data = Array.isArray(result.data) ? result.data[0] : result.data;
      error = result.error;
    }

    return { data, error };
  } catch (error) {
    console.error('Error checking out:', error);
    return { data: null, error };
  }
};

// Get attendance history for current user
export const getAttendanceHistory = async (
  startDate?: string,
  endDate?: string,
  limit: number = 30
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    let query = supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(limit);

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;
    return { data, error };
  } catch (error) {
    console.error('Error fetching attendance history:', error);
    return { data: null, error };
  }
};

// Get all attendance records (for admin/HOD)
export const getAllAttendanceRecords = async (
  startDate?: string,
  endDate?: string,
  department?: string,
  employeeId?: string
) => {
  try {
    let query = supabase
      .from('attendance_records')
      .select('*')
      .order('date', { ascending: false });

    if (startDate) {
      query = query.gte('date', startDate);
    }
    if (endDate) {
      query = query.lte('date', endDate);
    }
    if (employeeId) {
      query = query.eq('employee_id', employeeId);
    }

    const { data: records, error } = await query;
    
    if (error || !records) {
      return { data: null, error };
    }

    // Fetch user profiles for all records
    const userIds = [...new Set(records.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, department_id, email, role')
      .in('id', userIds);

    // Fetch departments for all unique department IDs
    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .in('id', deptIds);

    // Merge profile data with records and add department names
    const enrichedData = records.map(record => {
      const profile = profiles?.find(p => p.id === record.user_id);
      const department = departments?.find(d => d.id === profile?.department_id);
      return {
        ...record,
        users_profile: profile ? {
          ...profile,
          department_name: department?.name || null
        } : null
      };
    });

    // Apply department filter if specified
    const filteredData = department
      ? enrichedData.filter(r => r.users_profile?.department_id === department)
      : enrichedData;

    return { data: filteredData, error: null };
  } catch (error) {
    console.error('Error fetching all attendance records:', error);
    return { data: null, error };
  }
};

// Get attendance summary (monthly statistics)
export const getAttendanceSummary = async (departmentId?: string) => {
  try {
    let query = supabase
      .from('attendance_summary')
      .select('*')
      .order('full_name');
    
    // Note: attendance_summary view needs to include department_id to filter by department
    // For now, we'll fetch all and filter in memory if department is specified
    const { data, error } = await query;
    
    if (error || !data) return { data: null, error };
    
    // Fetch department names for all unique department IDs
    const deptIds = [...new Set(data.map(d => d.department_id).filter(Boolean))];
    let departmentMap = new Map<string, string>();
    
    if (deptIds.length > 0) {
      const { data: departments } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', deptIds);
      
      departments?.forEach(dept => {
        departmentMap.set(dept.id, dept.name);
      });
    }
    
    // Enrich data with department names
    const enrichedData = data.map(summary => ({
      ...summary,
      department_name: summary.department_id ? departmentMap.get(summary.department_id) : null
    }));
    
    // If department filter is applied, filter by department
    if (departmentId) {
      const filteredData = enrichedData.filter(d => d.department_id === departmentId);
      return { data: filteredData, error: null };
    }

    return { data: enrichedData, error: null };
  } catch (error) {
    console.error('Error fetching attendance summary:', error);
    return { data: null, error };
  }
};

// Get attendance settings
export const getAttendanceSettings = async () => {
  try {
    const { data, error } = await supabase
      .from('attendance_settings')
      .select('*')
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error fetching attendance settings:', error);
    return { data: null, error };
  }
};

// Update attendance settings (admin only)
export const updateAttendanceSettings = async (
  settings: Partial<AttendanceSettings>
) => {
  try {
    const { data: currentSettings } = await getAttendanceSettings();
    
    if (!currentSettings) {
      return { data: null, error: { message: 'Settings not found' } };
    }

    const { data, error } = await supabase
      .from('attendance_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentSettings.id)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error updating attendance settings:', error);
    return { data: null, error };
  }
};

// Admin: Manually add/correct attendance record
export const createAttendanceRecord = async (
  userId: string,
  employeeId: string,
  employeeName: string,
  checkInTime: string,
  checkOutTime: string | null,
  date: string,
  status: AttendanceRecord['status'],
  notes?: string
) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .insert([{
        user_id: userId,
        employee_id: employeeId,
        employee_name: employeeName,
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        date,
        status,
        notes,
      }])
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error creating attendance record:', error);
    return { data: null, error };
  }
};

// Admin: Update attendance record
export const updateAttendanceRecord = async (
  recordId: string,
  updates: Partial<AttendanceRecord>
) => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId)
      .select()
      .single();

    return { data, error };
  } catch (error) {
    console.error('Error updating attendance record:', error);
    return { data: null, error };
  }
};

// Admin: Delete attendance record
export const deleteAttendanceRecord = async (recordId: string) => {
  try {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('id', recordId);

    return { data: !error, error };
  } catch (error) {
    console.error('Error deleting attendance record:', error);
    return { data: false, error };
  }
};

// Get attendance statistics for dashboard
export const getAttendanceStats = async (userId?: string) => {
  try {
    const targetUserId = userId || (await supabase.auth.getUser()).data.user?.id;
    
    if (!targetUserId) {
      return { data: null, error: { message: 'User not found' } };
    }

    // Get current month records
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const startDate = startOfMonth.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', targetUserId)
      .gte('date', startDate);

    if (!records) {
      return { data: null, error: null };
    }

    const stats = {
      totalDays: records.length,
      presentDays: records.filter(r => r.status === 'present').length,
      lateDays: records.filter(r => r.status === 'late').length,
      halfDays: records.filter(r => r.status === 'half_day').length,
      totalHours: records.reduce((sum, r) => sum + (r.work_hours || 0), 0),
      averageHours: 0,
      checkedInToday: false,
      checkedOutToday: false,
    };

    stats.averageHours = stats.totalDays > 0 
      ? stats.totalHours / stats.totalDays 
      : 0;

    // Check today's status
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const todayRecord = records.find(r => r.date === today);
    if (todayRecord) {
      stats.checkedInToday = true;
      stats.checkedOutToday = !!todayRecord.check_out_time;
    }

    return { data: stats, error: null };
  } catch (error) {
    console.error('Error fetching attendance stats:', error);
    return { data: null, error };
  }
};

// Export attendance data to CSV (for reports)
export const exportAttendanceToCSV = async (
  startDate: string,
  endDate: string,
  department?: string
) => {
  try {
    const { data: records } = await getAllAttendanceRecords(
      startDate,
      endDate,
      department
    );

    if (!records || records.length === 0) {
      return { data: null, error: { message: 'No records found' } };
    }

    // Create CSV content
    const headers = [
      'Date',
      'Employee ID',
      'Employee Name',
      'Department',
      'Check In',
      'Check Out',
      'Work Hours',
      'Status',
      'Notes'
    ].join(',');

    const rows = records.map(record => {
      const userProfile = (record as any).users_profile;
      const employeeName = record.employee_name || 
        (userProfile ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() : 'Unknown');
      
      return [
        record.date,
        record.employee_id,
        employeeName,
        userProfile?.department_id || '',
        new Date(record.check_in_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }),
        record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : 'Not checked out',
        record.work_hours?.toFixed(2) || '0.00',
        record.status,
        record.notes || ''
      ].join(',');
    });

    const csv = [headers, ...rows].join('\n');
    
    // Create blob and download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance_${startDate}_to_${endDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);

    return { data: true, error: null };
  } catch (error) {
    console.error('Error exporting attendance:', error);
    return { data: null, error };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIVE DASHBOARD FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveFeedEntry {
  id: string;
  user_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  check_in_time: string;
  check_out_time: string | null;
  last_office_presence: string | null;
  status: AttendanceRecord['status'];
  location: string | null;
  work_hours: number | null;
}

export interface TodayStats {
  clocked_in_now: number;      // checked in, no checkout yet
  on_approved_leave: number;   // approved leave_requests covering today
  on_ooo_assignment: number;   // ooo_requests hr_approved covering today
  late_today: number;          // status = 'late' today
  not_yet_in: number;          // total staff minus (clocked_in + on_leave + on_ooo)
  missing_checkout: number;    // yesterday's records with no checkout
  total_staff: number;
}

export interface DeptBreakdownRow {
  department_id: string;
  department_name: string;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
}

export interface WeeklyTrendEntry {
  date: string;
  present: number;
  late: number;
  absent: number;
}

export interface FlaggedIssue {
  user_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  type: 'repeated_late' | 'missing_checkout' | 'high_overtime';
  detail: string;
}

// Today's live clock-in feed (most recent first)
export const getTodayLiveFeed = async (departmentId?: string): Promise<{ data: LiveFeedEntry[] | null; error: any }> => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const { data: records, error } = await supabase
      .from('attendance_records')
      .select('id, user_id, employee_id, employee_name, check_in_time, check_out_time, last_office_presence, status, location, work_hours')
      .eq('date', today)
      .order('check_in_time', { ascending: false })
      .limit(50);

    if (error || !records) return { data: null, error };

    // Enrich with department
    const userIds = [...new Set(records.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, department_id')
      .in('id', userIds);

    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .in('id', deptIds);

    const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    let enriched: LiveFeedEntry[] = records.map(r => {
      const p = profileMap.get(r.user_id);
      return {
        ...r,
        location: r.location || null,
        work_hours: r.work_hours || null,
        last_office_presence: r.last_office_presence || null,
        department_name: p?.department_id ? (deptMap.get(p.department_id) || null) : null,
      };
    });

    if (departmentId) {
      enriched = enriched.filter(r => {
        const p = profileMap.get(r.user_id);
        return p?.department_id === departmentId;
      });
    }

    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Today's KPI stats
export const getTodayStats = async (departmentId?: string): Promise<{ data: TodayStats | null; error: any }> => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    // Get all non-driver/non-admin staff
    let profileQuery = supabase
      .from('users_profile')
      .select('id, department_id, role')
      .in('role', ['employee', 'hod', 'fleet_manager', 'hr_admin']);
    const { data: allProfiles } = await profileQuery;

    // Filter by department if needed
    const relevantProfiles = departmentId
      ? allProfiles?.filter(p => p.department_id === departmentId)
      : allProfiles;
    const totalStaff = relevantProfiles?.length || 0;
    const relevantIds = relevantProfiles?.map(p => p.id) || [];

    // Today's attendance records
    const { data: todayRecords } = await supabase
      .from('attendance_records')
      .select('user_id, check_out_time, status')
      .eq('date', today)
      .in('user_id', relevantIds);

    const clockedInNow = todayRecords?.filter(r => !r.check_out_time).length || 0;
    const lateToday = todayRecords?.filter(r => r.status === 'late').length || 0;

    // Yesterday's missing checkouts
    const { data: yesterdayRecords } = await supabase
      .from('attendance_records')
      .select('id')
      .eq('date', yesterday)
      .is('check_out_time', null)
      .in('user_id', relevantIds);
    const missingCheckout = yesterdayRecords?.length || 0;

    // Approved leave covering today (regular leave_requests)
    const { data: leaveRecords } = await supabase
      .from('leave_requests')
      .select('user_id')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)
      .in('user_id', relevantIds);
    const onApprovedLeave = leaveRecords?.length || 0;

    // OOO assignments approved by HR covering today
    const { data: oooRecords } = await supabase
      .from('ooo_requests')
      .select('user_id')
      .eq('status', 'hr_approved')
      .lte('start_date', today)
      .gte('end_date', today)
      .in('user_id', relevantIds);
    const onOOOAssignment = oooRecords?.length || 0;

    const notYetIn = Math.max(0, totalStaff - clockedInNow - onApprovedLeave - onOOOAssignment);

    return {
      data: {
        clocked_in_now: clockedInNow,
        on_approved_leave: onApprovedLeave,
        on_ooo_assignment: onOOOAssignment,
        late_today: lateToday,
        not_yet_in: notYetIn,
        missing_checkout: missingCheckout,
        total_staff: totalStaff,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Department attendance breakdown for today
export const getDeptBreakdown = async (): Promise<{ data: DeptBreakdownRow[] | null; error: any }> => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .order('name');

    if (!departments) return { data: [], error: null };

    // Today's records
    const { data: todayRecords } = await supabase
      .from('attendance_records')
      .select('user_id, status, check_out_time')
      .eq('date', today);

    // Profiles with department
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, department_id')
      .in('role', ['employee', 'hod', 'fleet_manager', 'hr_admin']);

    // Approved leave today (regular leave)
    const { data: leaveRecords } = await supabase
      .from('leave_requests')
      .select('user_id')
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today);

    // OOO assignments approved by HR today
    const { data: oooRecords } = await supabase
      .from('ooo_requests')
      .select('user_id')
      .eq('status', 'hr_approved')
      .lte('start_date', today)
      .gte('end_date', today);

    // Merge both into a single "away" set
    const awayUserIds = new Set([
      ...(leaveRecords?.map(l => l.user_id) || []),
      ...(oooRecords?.map(o => o.user_id) || []),
    ]);
    const rows: DeptBreakdownRow[] = departments.map(dept => {
      const deptProfiles = profiles?.filter(p => p.department_id === dept.id) || [];
      const deptUserIds = new Set(deptProfiles.map(p => p.id));
      const deptAttendance = todayRecords?.filter(r => deptUserIds.has(r.user_id)) || [];

      const present = deptAttendance.filter(r => r.status === 'present').length;
      const late = deptAttendance.filter(r => r.status === 'late').length;
      const onLeave = deptProfiles.filter(p => awayUserIds.has(p.id)).length;
      const absent = Math.max(0, deptProfiles.length - present - late - onLeave);

      return { department_id: dept.id, department_name: dept.name, present, late, absent, on_leave: onLeave };
    });

    return { data: rows.filter(r => r.present + r.late + r.absent + r.on_leave > 0 || true), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Last 7 days attendance trend
export const getWeeklyTrend = async (departmentId?: string): Promise<{ data: WeeklyTrendEntry[] | null; error: any }> => {
  try {
    const entries: WeeklyTrendEntry[] = [];
    const today = new Date();

    // Get profiles
    let profileQuery = supabase
      .from('users_profile')
      .select('id, department_id')
      .in('role', ['employee', 'hod', 'fleet_manager', 'hr_admin']);
    const { data: profiles } = await profileQuery;
    const relevantIds = departmentId
      ? profiles?.filter(p => p.department_id === departmentId).map(p => p.id) || []
      : profiles?.map(p => p.id) || [];
    const totalStaff = relevantIds.length;

    // Last 7 days records in one query
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 6);
    const startDate = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const endDate = today.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: records } = await supabase
      .from('attendance_records')
      .select('date, user_id, status')
      .gte('date', startDate)
      .lte('date', endDate)
      .in('user_id', relevantIds);

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const dayRecords = records?.filter(r => r.date === dateStr) || [];
      const present = dayRecords.filter(r => r.status === 'present').length;
      const late = dayRecords.filter(r => r.status === 'late').length;
      const absent = Math.max(0, totalStaff - present - late);
      entries.push({ date: dateStr, present, late, absent });
    }

    return { data: entries, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Flagged issues: repeated lateness, missing checkouts from yesterday
export const getFlaggedIssues = async (departmentId?: string): Promise<{ data: FlaggedIssue[] | null; error: any }> => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, department_id, employee_id')
      .in('role', ['employee', 'hod', 'fleet_manager', 'hr_admin']);

    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: departments } = await supabase
      .from('departments')
      .select('id, name')
      .in('id', deptIds);
    const deptMap = new Map(departments?.map(d => [d.id, d.name]) || []);

    const relevantProfiles = departmentId
      ? profiles?.filter(p => p.department_id === departmentId)
      : profiles;
    const relevantIds = relevantProfiles?.map(p => p.id) || [];
    const profileMap = new Map(relevantProfiles?.map(p => [p.id, p]) || []);

    // Records last 5 days
    const { data: recentRecords } = await supabase
      .from('attendance_records')
      .select('user_id, date, status, check_out_time, work_hours')
      .gte('date', fiveDaysAgo)
      .lte('date', today)
      .in('user_id', relevantIds);

    const issues: FlaggedIssue[] = [];

    // Repeated late (≥3 in last 5 days)
    const lateCountMap = new Map<string, number>();
    recentRecords?.filter(r => r.status === 'late').forEach(r => {
      lateCountMap.set(r.user_id, (lateCountMap.get(r.user_id) || 0) + 1);
    });
    lateCountMap.forEach((count, userId) => {
      if (count >= 3) {
        const p = profileMap.get(userId);
        if (p) {
          issues.push({
            user_id: userId,
            employee_id: p.employee_id,
            employee_name: `${p.first_name} ${p.last_name}`,
            department_name: p.department_id ? (deptMap.get(p.department_id) || null) : null,
            type: 'repeated_late',
            detail: `Late ${count} of the last 5 days`,
          });
        }
      }
    });

    // Missing checkout yesterday
    const yesterdayMissing = recentRecords?.filter(r => r.date === yesterday && !r.check_out_time) || [];
    yesterdayMissing.forEach(r => {
      const p = profileMap.get(r.user_id);
      if (p) {
        issues.push({
          user_id: r.user_id,
          employee_id: p.employee_id,
          employee_name: `${p.first_name} ${p.last_name}`,
          department_name: p.department_id ? (deptMap.get(p.department_id) || null) : null,
          type: 'missing_checkout',
          detail: 'Did not clock out yesterday',
        });
      }
    });

    // High overtime today (work_hours > 10)
    const todayRecords = recentRecords?.filter(r => r.date === today && r.work_hours && r.work_hours > 10) || [];
    todayRecords.forEach(r => {
      const p = profileMap.get(r.user_id);
      if (p) {
        issues.push({
          user_id: r.user_id,
          employee_id: p.employee_id,
          employee_name: `${p.first_name} ${p.last_name}`,
          department_name: p.department_id ? (deptMap.get(p.department_id) || null) : null,
          type: 'high_overtime',
          detail: `${r.work_hours?.toFixed(1)}h logged today`,
        });
      }
    });

    return { data: issues, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OOO STAFF ON DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export interface OOOStaffEntry {
  user_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  ooo_type: string;
  assignment_title: string | null;
  start_date: string;
  end_date: string;
}

export const getTodayOOOStaff = async (): Promise<{ data: OOOStaffEntry[] | null; error: any }> => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });

    const { data: requests, error } = await supabase
      .from('ooo_requests')
      .select('id, user_id, employee_id, absence_type, start_date, end_date, assignment_id')
      .eq('status', 'hr_approved')
      .lte('start_date', today)
      .gte('end_date', today);

    if (error || !requests) return { data: null, error };

    const userIds = [...new Set(requests.map((r: any) => r.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, department_id')
      .in('id', userIds);

    const deptIds = [...new Set(profiles?.map((p: any) => p.department_id).filter(Boolean) || [])];
    const { data: departments } = await supabase
      .from('departments').select('id, name').in('id', deptIds);

    const deptMap = new Map(departments?.map((d: any) => [d.id, d.name]) || []);
    const profileMap = new Map(profiles?.map((p: any) => [p.id, p]) || []);

    const assignmentIds = [...new Set(requests.map((r: any) => r.assignment_id).filter(Boolean))];
    const assignmentMap = new Map<string, string>();
    if (assignmentIds.length > 0) {
      const { data: assignments } = await supabase
        .from('ooo_assignments').select('id, title').in('id', assignmentIds);
      assignments?.forEach((a: any) => assignmentMap.set(a.id, a.title));
    }

    const entries: OOOStaffEntry[] = requests.map((r: any) => {
      const p = profileMap.get(r.user_id) as any;
      return {
        user_id: r.user_id,
        employee_id: r.employee_id,
        employee_name: p ? `${p.first_name} ${p.last_name}` : r.employee_id,
        department_name: p?.department_id ? (deptMap.get(p.department_id) as string || null) : null,
        ooo_type: r.absence_type,
        assignment_title: r.assignment_id ? (assignmentMap.get(r.assignment_id) || null) : null,
        start_date: r.start_date,
        end_date: r.end_date,
      };
    });

    return { data: entries, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE ATTENDANCE REPORT (with OOO merged)
// ─────────────────────────────────────────────────────────────────────────────

export interface OOOAttendanceRow {
  id: string;
  date: string;
  row_type: 'attendance' | 'ooo';
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string;
  work_hours?: number | null;
  notes?: string | null;
  ooo_type?: string;
  ooo_title?: string;
  employee_id: string;
  employee_name: string;
}

export const getEmployeeAttendanceReport = async (
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<{ data: OOOAttendanceRow[] | null; error: any; employeeName?: string; department?: string }> => {
  try {
    const { data: profileRow } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, employee_id, department_id')
      .eq('employee_id', employeeId)
      .single();

    if (!profileRow) return { data: null, error: { message: 'Employee not found' } };

    const empName = `${profileRow.first_name} ${profileRow.last_name}`;

    let deptName = '';
    if (profileRow.department_id) {
      const { data: dept } = await supabase
        .from('departments').select('name').eq('id', profileRow.department_id).single();
      deptName = dept?.name || '';
    }

    // Attendance records
    const { data: records } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('employee_id', employeeId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    // Approved OOO requests overlapping the period
    const { data: oooRequests } = await supabase
      .from('ooo_requests')
      .select('id, absence_type, start_date, end_date, assignment_id')
      .eq('user_id', profileRow.id)
      .eq('status', 'hr_approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    const assignmentIds = [...new Set((oooRequests || []).map((r: any) => r.assignment_id).filter(Boolean))];
    const assignmentMap = new Map<string, string>();
    if (assignmentIds.length > 0) {
      const { data: assignments } = await supabase
        .from('ooo_assignments').select('id, title').in('id', assignmentIds);
      assignments?.forEach((a: any) => assignmentMap.set(a.id, a.title));
    }

    const attendanceRows: OOOAttendanceRow[] = (records || []).map((r: any) => ({
      id: r.id,
      date: r.date,
      row_type: 'attendance',
      check_in_time: r.check_in_time,
      check_out_time: r.check_out_time,
      status: r.status,
      work_hours: r.work_hours,
      notes: r.notes,
      employee_id: r.employee_id,
      employee_name: empName,
    }));

    // Expand OOO requests into per-day rows
    const attendanceDates = new Set(attendanceRows.map(r => r.date));
    const oooRows: OOOAttendanceRow[] = [];

    for (const ooo of (oooRequests || [])) {
      const clampStart = ooo.start_date < startDate ? startDate : ooo.start_date;
      const clampEnd   = ooo.end_date   > endDate   ? endDate   : ooo.end_date;
      const cur = new Date(clampStart);
      const end = new Date(clampEnd);

      while (cur <= end) {
        const dateStr = cur.toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
        if (!attendanceDates.has(dateStr)) {
          oooRows.push({
            id: `ooo-${ooo.id}-${dateStr}`,
            date: dateStr,
            row_type: 'ooo',
            ooo_type: ooo.absence_type,
            ooo_title: ooo.assignment_id
              ? (assignmentMap.get(ooo.assignment_id) || 'OOO Assignment')
              : 'OOO',
            employee_id: employeeId,
            employee_name: empName,
          });
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const merged = [...attendanceRows, ...oooRows].sort((a, b) => a.date.localeCompare(b.date));
    return { data: merged, error: null, employeeName: empName, department: deptName };
  } catch (err) {
    return { data: null, error: err };
  }
};
