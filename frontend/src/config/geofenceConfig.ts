/**
 * Geofence Configuration for Multiple Office Locations
 * 
 * Loads office locations from database (office_locations table)
 * Settings managed through Admin > Geofence Settings UI
 */

import { supabase } from '../lib/supabaseClient';

export interface GeofenceConfig {
  latitude: number;
  longitude: number;
  radius: number; // in meters
  notificationTitle: string;
  notificationBody: string;
  identifier: string;
  name?: string;
}

// Default configuration (fallback if database settings not available)
const DEFAULT_OFFICE_CONFIG: GeofenceConfig = {
  latitude: -1.2517,  // FKF Office latitude (QV9X+4H3)
  longitude: 36.7989, // FKF Office longitude
  radius: 100, // 100 meters radius
  notificationTitle: 'Welcome to Office!',
  notificationBody: 'You are at the office. Tap to sign in.',
  identifier: 'office-main',
  name: 'Main Office',
};

// Cached configuration
let cachedConfigs: GeofenceConfig[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = 'geofence_office_locations_cache';

/**
 * Load all active geofence configurations from database
 * Falls back to default config if database is unavailable
 */
export async function loadGeofenceConfig(): Promise<GeofenceConfig> {
  const configs = await loadAllGeofenceConfigs();
  return configs[0] || DEFAULT_OFFICE_CONFIG;
}

/**
 * Load all active office locations from database
 * Returns array of geofence configurations
 */
export async function loadAllGeofenceConfigs(): Promise<GeofenceConfig[]> {
  // Return cached configs if still fresh
  if (cachedConfigs.length > 0 && Date.now() - lastFetchTime < CACHE_DURATION) {
    return cachedConfigs;
  }

  try {
    // Try loading from new office_locations table
    const { data: locations, error } = await supabase
      .from('office_locations')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');

    if (!error && locations && locations.length > 0) {
      // Convert to GeofenceConfig format
      const configs: GeofenceConfig[] = locations.map((loc) => ({
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius,
        notificationTitle: loc.notification_title,
        notificationBody: loc.notification_body,
        identifier: `office-${loc.id}`,
        name: loc.name,
      }));

      cachedConfigs = configs;
      lastFetchTime = Date.now();

      // Persist to localStorage so geofence checks work when device is briefly offline
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
      } catch { /* storage unavailable — non-fatal */ }

      console.log(`✅ Loaded ${configs.length} office location(s) from database`);
      return configs;
    }

    // Fallback to legacy system_settings table
    const { data: settingsData, error: settingsError } = await supabase
      .from('system_settings')
      .select('settings')
      .eq('id', 1)
      .single();

    if (!settingsError && settingsData?.settings) {
      const settings = settingsData.settings;
      const config: GeofenceConfig = {
        latitude: settings.office_latitude ?? DEFAULT_OFFICE_CONFIG.latitude,
        longitude: settings.office_longitude ?? DEFAULT_OFFICE_CONFIG.longitude,
        radius: settings.geofence_radius ?? DEFAULT_OFFICE_CONFIG.radius,
        notificationTitle: settings.geofence_notification_title ?? DEFAULT_OFFICE_CONFIG.notificationTitle,
        notificationBody: settings.geofence_notification_body ?? DEFAULT_OFFICE_CONFIG.notificationBody,
        identifier: DEFAULT_OFFICE_CONFIG.identifier,
        name: DEFAULT_OFFICE_CONFIG.name,
      };

      cachedConfigs = [config];
      lastFetchTime = Date.now();
      
      console.log('✅ Loaded geofence config from legacy system_settings');
      return cachedConfigs;
    }

    // No data found, use default
    console.warn('No office locations found, using default config');
    cachedConfigs = [DEFAULT_OFFICE_CONFIG];
    lastFetchTime = Date.now();
    return cachedConfigs;
    
  } catch (error) {
    console.error('Error loading office locations:', error);

    // Network failure — try localStorage cache before falling back to default
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GeofenceConfig[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.warn('⚠️ Using offline localStorage office locations cache');
          cachedConfigs = parsed;
          lastFetchTime = Date.now();
          return cachedConfigs;
        }
      }
    } catch { /* parse error — fall through */ }

    console.warn('Using default geofence config');
    cachedConfigs = [DEFAULT_OFFICE_CONFIG];
    lastFetchTime = Date.now();
    return cachedConfigs;
  }
}

/**
 * Clear cached configuration (call after updating settings)
 */
export function clearGeofenceCache(): void {
  cachedConfigs = [];
  lastFetchTime = 0;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* non-fatal */ }
}

// For backwards compatibility - get primary office location
export const OFFICE_GEOFENCE: GeofenceConfig = DEFAULT_OFFICE_CONFIG;

/**
 * Get all office locations (alias for loadAllGeofenceConfigs)
 */
export async function getOfficeLocations(): Promise<GeofenceConfig[]> {
  return await loadAllGeofenceConfigs();
}

// Synchronous export for backwards compatibility (will be empty until first load)
export const OFFICE_LOCATIONS: GeofenceConfig[] = [DEFAULT_OFFICE_CONFIG];

// Minimum GPS accuracy required (in meters)
// Can be overridden from database settings
export let MIN_GPS_ACCURACY = 50;

/**
 * Load MIN_GPS_ACCURACY from database
 */
export async function loadMinGPSAccuracy(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('settings')
      .eq('id', 1)
      .single();

    if (!error && data?.settings?.min_gps_accuracy) {
      MIN_GPS_ACCURACY = data.settings.min_gps_accuracy;
      return MIN_GPS_ACCURACY;
    }
  } catch (error) {
    console.error('Error loading GPS accuracy setting:', error);
  }
  
  return MIN_GPS_ACCURACY;
}

// How often to check for sync when online (milliseconds)
export const SYNC_CHECK_INTERVAL = 30000; // 30 seconds

// Maximum offline records to store
export const MAX_OFFLINE_RECORDS = 100;
