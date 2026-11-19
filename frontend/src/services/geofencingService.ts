/**
 * Geofencing Service
 * Handles geofence monitoring and notifications for office location
 * 
 * Note: Background geolocation requires native implementation.
 * The @capacitor-community/background-geolocation plugin provides platform-specific APIs.
 * For production, you may need to implement native code or use a commercial plugin.
 */

import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { OFFICE_GEOFENCE, GeofenceConfig, getOfficeLocations, loadMinGPSAccuracy } from '../config/geofenceConfig';
import { locationService } from './locationService';
import { supabase } from '../lib/supabaseClient';
import { checkOut } from './attendanceService';



export interface GeofenceEvent {
  identifier: string;
  latitude: number;
  longitude: number;
  event: 'enter' | 'exit';
  timestamp: number;
}

class GeofencingService {
  private isMonitoring = false;
  // Reserved for future watcher implementation
  // private watcherId: string | null = null;

  /**
   * Initialize geofencing
   */
  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('⚠️ Geofencing only available on native platforms');
      return;
    }

    try {
      // Request notification permissions
      await this.requestNotificationPermissions();
      
      console.log('✅ Geofencing service initialized');
    } catch (error) {
      console.error('❌ Error initializing geofencing:', error);
      throw error;
    }
  }

  /**
   * Request notification permissions
   */
  private async requestNotificationPermissions(): Promise<boolean> {
    try {
      const permission = await LocalNotifications.checkPermissions();
      
      if (permission.display === 'granted') {
        return true;
      }

      const request = await LocalNotifications.requestPermissions();
      return request.display === 'granted';
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
      return false;
    }
  }

  /**
   * Start monitoring geofences.
   * NOTE: Background geolocation is not yet implemented — this is a no-op.
   * On-demand geofence checking is available via checkIfAtOffice().
   * To enable background geofencing, integrate a native plugin such as
   * @transistorsoft/capacitor-background-geolocation and wire handleGeofenceExit().
   */
  async startMonitoring(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    console.log('ℹ️ Background geofence monitoring not yet implemented. Using on-demand checks via checkIfAtOffice().');
  }

  /**
   * Check if currently within office geofence.
   * Gets GPS location once, validates accuracy, then checks all office locations.
   */
  async checkIfAtOffice(): Promise<{
    isAtOffice: boolean;
    distance: number;
    office?: GeofenceConfig;
    error?: string;
  }> {
    try {
      // Get GPS location once (avoids multiple requests when looping offices)
      const locationResult = await locationService.getCurrentLocation();
      if (!locationResult.success || !locationResult.coordinates) {
        return {
          isAtOffice: false,
          distance: 0,
          error: locationResult.error || 'Could not get GPS location'
        };
      }

      const { latitude, longitude, accuracy } = locationResult.coordinates;

      // Validate GPS accuracy before trusting the location
      const minAccuracy = await loadMinGPSAccuracy();
      if (accuracy > minAccuracy) {
        return {
          isAtOffice: false,
          distance: 0,
          error: `GPS accuracy too low (±${Math.round(accuracy)}m). Move to an open area for a better signal.`
        };
      }

      // Load all active office locations and check each one
      const officeLocations = await getOfficeLocations();
      let nearestDist = Infinity;
      let nearestOffice = officeLocations[0] || OFFICE_GEOFENCE;

      for (const office of officeLocations) {
        const dist = locationService.calculateDistance(latitude, longitude, office.latitude, office.longitude);

        if (dist <= office.radius) {
          return { isAtOffice: true, distance: Math.round(dist), office };
        }

        if (dist < nearestDist) {
          nearestDist = dist;
          nearestOffice = office;
        }
      }

      return {
        isAtOffice: false,
        distance: Math.round(nearestDist === Infinity ? 0 : nearestDist),
        office: nearestOffice
      };
    } catch (error) {
      console.error('❌ Error checking office location:', error);
      return {
        isAtOffice: false,
        distance: 0,
        error: error instanceof Error ? error.message : 'Failed to check location'
      };
    }
  }

  /**
   * Show notification when entering geofence
   */
  async showGeofenceNotification(config: GeofenceConfig): Promise<void> {
    try {
      const hasPermission = await this.requestNotificationPermissions();
      if (!hasPermission) {
        console.warn('⚠️ Notification permission denied');
        return;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: config.notificationTitle,
            body: config.notificationBody,
            id: Math.floor(Math.random() * 100000),
            schedule: { at: new Date(Date.now() + 1000) }, // 1 second delay
            sound: undefined,
            attachments: undefined,
            actionTypeId: 'ATTENDANCE_ACTION',
            extra: {
              action: 'check_in',
              office_id: config.identifier
            }
          }
        ]
      });

      console.log('✅ Geofence notification scheduled');
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  }

  /**
   * Handle geofence exit - Auto checkout if enabled
   */
  async handleGeofenceExit(config: GeofenceConfig): Promise<void> {
    try {
      console.log(`🚶 Exited geofence: ${config.identifier}`);
      
      // Check if auto-checkout on geofence exit is enabled
      const { data: settings, error } = await supabase
        .from('attendance_settings')
        .select('geofence_exit_checkout')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn('⚠️ Could not fetch attendance settings:', error);
        return;
      }

      if (!settings?.geofence_exit_checkout) {
        console.log('ℹ️ Geofence exit auto-checkout is disabled');
        return;
      }

      // Check if user is currently checked in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('⚠️ User not authenticated');
        return;
      }

      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
      const { data: todayRecord } = await supabase
        .from('attendance_records')
        .select('check_in_time, check_out_time')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      // Only auto-checkout if checked in and not already checked out
      if (todayRecord && todayRecord.check_in_time && !todayRecord.check_out_time) {
        console.log('🔄 Auto-checking out user...');
        
        const result = await checkOut(`Auto-checkout: Exited office geofence (${config.identifier})`);
        
        if (result.error) {
          console.error('❌ Auto-checkout failed:', result.error);
        } else {
          console.log('✅ Auto-checkout successful');
          
          // Show notification
          const hasPermission = await this.requestNotificationPermissions();
          if (hasPermission) {
            await LocalNotifications.schedule({
              notifications: [
                {
                  title: '✅ Auto-Checked Out',
                  body: `You've been automatically checked out after leaving ${config.identifier}`,
                  id: Math.floor(Math.random() * 100000),
                  schedule: { at: new Date(Date.now() + 1000) },
                  sound: undefined,
                  attachments: undefined,
                  actionTypeId: '',
                  extra: {}
                }
              ]
            });
          }
        }
      } else {
        console.log('ℹ️ User not checked in or already checked out');
      }
    } catch (error) {
      console.error('❌ Error handling geofence exit:', error);
    }
  }

  /**
   * Handle notification click/tap
   */
  setupNotificationHandlers(onCheckInRequest: () => void): void {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('📱 Notification action:', notification);
      
      if (notification.notification.extra?.action === 'check_in') {
        onCheckInRequest();
      }
    });
  }

  /**
   * Stop monitoring geofences (no-op until background geolocation is implemented).
   */
  async stopMonitoring(): Promise<void> {
    this.isMonitoring = false;
  }

  /**
   * Get monitoring status
   */
  isActive(): boolean {
    return this.isMonitoring;
  }
}

// Export singleton instance
export const geofencingService = new GeofencingService();
