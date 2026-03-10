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
import { OFFICE_GEOFENCE, GeofenceConfig, getOfficeLocations } from '../config/geofenceConfig';
import { locationService } from './locationService';
import { supabase } from '../lib/supabaseClient';
import { checkOut } from './attendanceService';

// Background Geolocation Plugin
// Note: @capacitor-community/background-geolocation is a community plugin
// For production use, consider: @transistorsoft/capacitor-background-geolocation (commercial)
let BackgroundGeolocation: any = null;

if (Capacitor.isNativePlatform()) {
  try {
    // Dynamically import the plugin if available
    BackgroundGeolocation = (window as any).BackgroundGeolocation;
  } catch (error) {
    console.warn('⚠️ Background Geolocation plugin not available:', error);
  }
}

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
   * Start monitoring geofences
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Already monitoring geofences');
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      console.warn('⚠️ Geofencing only available on native platforms');
      return;
    }

    try {
      // Load office locations from database
      const officeLocations = await getOfficeLocations();
      
      // Add geofences for all office locations
      for (const office of officeLocations) {
        await this.addGeofence(office);
      }

      this.isMonitoring = true;
      console.log('✅ Started monitoring geofences');
    } catch (error) {
      console.error('❌ Error starting geofence monitoring:', error);
      throw error;
    }
  }

  /**
   * Add a geofence
   */
  private async addGeofence(config: GeofenceConfig): Promise<void> {
    if (!BackgroundGeolocation) {
      console.warn('⚠️ Background Geolocation plugin not available');
      return;
    }

    try {
      // Note: Background geolocation implementation varies by plugin
      // This is a conceptual implementation - adjust based on actual plugin API
      console.log(`📍 Adding geofence: ${config.identifier}`);
      console.log(`   Location: ${config.latitude}, ${config.longitude}`);
      console.log(`   Radius: ${config.radius}m`);
      
      // Store geofence config for manual checking
      // (Background geolocation may need platform-specific implementation)
    } catch (error) {
      console.error('❌ Error adding geofence:', error);
      throw error;
    }
  }

  /**
   * Check if currently within office geofence
   */
  async checkIfAtOffice(): Promise<{
    isAtOffice: boolean;
    distance: number;
    office?: GeofenceConfig;
    error?: string;
  }> {
    try {
      // Load office locations from database
      const officeLocations = await getOfficeLocations();
      
      // Check each office location
      for (const office of officeLocations) {
        const result = await locationService.isWithinRadius(
          office.latitude,
          office.longitude,
          office.radius
        );

        if (result.withinRadius) {
          return {
            isAtOffice: true,
            distance: result.distance,
            office: office
          };
        }
      }

      // Not at any office - get distance to primary office
      const primaryOffice = officeLocations[0] || OFFICE_GEOFENCE;
      const primaryOfficeCheck = await locationService.isWithinRadius(
        primaryOffice.latitude,
        primaryOffice.longitude,
        primaryOffice.radius
      );

      return {
        isAtOffice: false,
        distance: primaryOfficeCheck.distance,
        office: primaryOffice
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

      const today = new Date().toISOString().split('T')[0];
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
   * Stop monitoring geofences
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    try {
      // Remove all geofences
      this.isMonitoring = false;
      console.log('⏹️ Stopped monitoring geofences');
    } catch (error) {
      console.error('❌ Error stopping geofence monitoring:', error);
    }
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
