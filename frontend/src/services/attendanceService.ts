// Attendance Service - Handles all attendance-related API calls
import { supabase } from '../lib/supabaseClient';
import { Capacitor } from '@capacitor/core';
import { locationService } from './locationService';
import { geofencingService } from './geofencingService';
import { offlineStorage } from './offlineStorageService';

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
}

// Get today's attendance record for the current user
export const getTodayAttendance = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const today = new Date().toISOString().split('T')[0];
    
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
      (error) => {
        console.error('Error getting location:', error);
        resolve(undefined);
      },
      { timeout: 5000 }
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

    // Get attendance settings to determine status
    const settings = await getAttendanceSettings();
    
    // Get location and IP if enabled
    const ip_address = await getUserIP();
    const location = settings.data?.enable_location_tracking 
      ? (checkInData?.location || await getUserLocation())
      : undefined;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const checkInTime = now.toISOString();
    
    // Determine status based on time
    let status: AttendanceRecord['status'] = 'present';
    if (settings.data) {
      const workStartTime = new Date(`${today}T${settings.data.work_start_time}`);
      const minutesLate = (now.getTime() - workStartTime.getTime()) / (1000 * 60);
      
      if (minutesLate > settings.data.late_threshold_minutes) {
        status = 'late';
      }
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .insert([{
        user_id: user.id,
        employee_id: profile.employee_id,
        employee_name: fullName,
        check_in_time: checkInTime,
        date: today,
        status,
        location,
        ip_address,
        notes: checkInData?.notes,
      }])
      .select()
      .single();

    return { data, error };
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
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const checkInTime = now.toISOString();

    // Determine status based on time
    let status: AttendanceRecord['status'] = 'present';
    if (settings.data) {
      const workStartTime = new Date(`${today}T${settings.data.work_start_time}`);
      const minutesLate = (now.getTime() - workStartTime.getTime()) / (1000 * 60);
      
      if (minutesLate > settings.data.late_threshold_minutes) {
        status = 'late';
      }
    }

    // Check if online
    const isOnline = navigator.onLine;

    // If offline and on mobile, save to local SQLite
    if (!isOnline && Capacitor.isNativePlatform() && coords) {
      if (!offlineStorage.isAvailable()) {
        return {
          data: null,
          error: { message: 'Cannot check in offline - offline storage not available' }
        };
      }

      const offlineId = await offlineStorage.saveAttendance({
        user_id: user.id,
        employee_id: profile.employee_id,
        employee_name: fullName,
        check_in_time: checkInTime,
        date: today,
        status,
        location: locationString || '',
        coords_lat: coords.latitude,
        coords_lng: coords.longitude,
        notes: checkInData?.notes,
        created_at: checkInTime
      });

      return {
        data: {
          id: `offline_${offlineId}`,
          user_id: user.id,
          employee_id: profile.employee_id,
          employee_name: fullName,
          check_in_time: checkInTime,
          check_out_time: null,
          date: today,
          status,
          location: locationString,
          notes: checkInData?.notes,
          created_at: checkInTime,
          updated_at: checkInTime
        } as AttendanceRecord,
        error: null,
        offline: true
      };
    }

    // Online check-in
    const recordData: any = {
      user_id: user.id,
      employee_id: profile.employee_id,
      employee_name: fullName,
      check_in_time: checkInTime,
      date: today,
      status,
      location: locationString,
      notes: checkInData?.notes,
    };

    // Add GPS coordinates if available (PostgreSQL point format)
    if (coords) {
      recordData.coords = `(${coords.longitude},${coords.latitude})`;
    }

    // Add IP address on web
    if (!Capacitor.isNativePlatform()) {
      recordData.ip_address = await getUserIP();
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .insert([recordData])
      .select()
      .single();

    return { data, error, offline: false };
  } catch (error) {
    console.error('Error in mobile check-in:', error);
    return { data: null, error };
  }
};

// Update office presence timestamp (called periodically when user is at office)
export const updateOfficePresence = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const today = new Date().toISOString().split('T')[0];
    
    // Call the database function to update last_office_presence
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

// Check out - Update today's attendance record with check-out time
// Enforces office presence: uses last_office_presence if not currently at office
export const checkOut = async (notes?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { data: null, error: { message: 'Not authenticated' } };
    }

    const today = new Date().toISOString().split('T')[0];
    
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

    // Check if user is currently at office (only on native platforms with geofencing)
    let checkOutTime = new Date().toISOString();
    let isAtOffice = true;
    let usedLastPresence = false;

    if (Capacitor.isNativePlatform()) {
      try {
        const { geofencingService } = await import('./geofencingService');
        const officeCheck = await geofencingService.checkIfAtOffice();
        
        isAtOffice = officeCheck.isAtOffice;

        // If not at office, use last_office_presence as checkout time
        if (!isAtOffice) {
          if (todayRecord.last_office_presence) {
            checkOutTime = todayRecord.last_office_presence;
            usedLastPresence = true;
            console.log('📍 User not at office. Using last office presence:', checkOutTime);
          } else {
            // No office presence tracking - reject checkout
            return {
              data: null,
              error: { 
                message: 'You must be at the office to check out. No office presence detected today.' 
              }
            };
          }
        } else {
          console.log('✅ User at office. Using current time for checkout.');
        }
      } catch (geoError) {
        console.warn('⚠️ Could not verify office location, proceeding with checkout:', geoError);
        // On error, allow checkout with current time
      }
    }
    
    // Update with checkout time (trigger will calculate work hours)
    const updateData: any = {
      check_out_time: checkOutTime,
      notes: notes ? 
        (usedLastPresence ? `${notes} (Auto-checkout: left office at ${new Date(checkOutTime).toLocaleTimeString()})` : notes)
        : (usedLastPresence ? `Auto-checkout: left office at ${new Date(checkOutTime).toLocaleTimeString()}` : todayRecord.notes),
    };

    const { data, error } = await supabase
      .from('attendance_records')
      .update(updateData)
      .eq('id', todayRecord.id)
      .select()
      .single();

    if (data && usedLastPresence) {
      return { 
        data, 
        error: null,
        warning: `You were checked out at ${new Date(checkOutTime).toLocaleTimeString()} (when you left the office)` 
      };
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
    const startDate = startOfMonth.toISOString().split('T')[0];

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
    const today = new Date().toISOString().split('T')[0];
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
        new Date(record.check_in_time).toLocaleTimeString(),
        record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : 'Not checked out',
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
