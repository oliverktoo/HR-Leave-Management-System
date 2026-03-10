/**
 * Location Service
 * Handles GPS location tracking using Capacitor Geolocation
 */

import { Geolocation, Position } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

export interface LocationResult {
  success: boolean;
  coordinates?: LocationCoordinates;
  error?: string;
}

class LocationService {
  /**
   * Check if location services are available
   */
  async checkPermissions(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) {
      console.warn('⚠️ Location services only available on native platforms');
      return false;
    }

    try {
      const permission = await Geolocation.checkPermissions();
      
      if (permission.location === 'granted') {
        return true;
      }

      // Request permission if not granted
      const request = await Geolocation.requestPermissions();
      return request.location === 'granted';
    } catch (error) {
      console.error('❌ Error checking location permissions:', error);
      return false;
    }
  }

  /**
   * Get current GPS location
   */
  async getCurrentLocation(): Promise<LocationResult> {
    try {
      // Check permissions first
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        return {
          success: false,
          error: 'Location permission denied'
        };
      }

      // Get current position
      const position: Position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      });

      return {
        success: true,
        coordinates: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        }
      };
    } catch (error) {
      console.error('❌ Error getting current location:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get location'
      };
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   * Returns distance in meters
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Check if current location is within specified radius of target location
   */
  async isWithinRadius(
    targetLat: number,
    targetLon: number,
    radiusMeters: number
  ): Promise<{ withinRadius: boolean; distance: number; error?: string }> {
    const locationResult = await this.getCurrentLocation();

    if (!locationResult.success || !locationResult.coordinates) {
      return {
        withinRadius: false,
        distance: 0,
        error: locationResult.error
      };
    }

    const distance = this.calculateDistance(
      locationResult.coordinates.latitude,
      locationResult.coordinates.longitude,
      targetLat,
      targetLon
    );

    return {
      withinRadius: distance <= radiusMeters,
      distance: Math.round(distance),
      error: undefined
    };
  }

  /**
   * Format coordinates as string
   */
  formatCoordinates(lat: number, lng: number): string {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }

  /**
   * Get location as formatted string with accuracy
   */
  async getFormattedLocation(): Promise<string | null> {
    const result = await this.getCurrentLocation();
    
    if (!result.success || !result.coordinates) {
      return null;
    }

    const { latitude, longitude, accuracy } = result.coordinates;
    return `${this.formatCoordinates(latitude, longitude)} (±${Math.round(accuracy)}m)`;
  }
}

// Export singleton instance
export const locationService = new LocationService();
