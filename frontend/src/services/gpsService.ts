// Fleet Phase 4: GPS Tracking Service
// Handles GPS waypoint logging, offline queue, and route data

import { supabase } from '../lib/supabaseClient';
import { TripGpsLog, CreateGpsLogInput, GpsOfflineQueueItem } from '../types/fleetPhase4';

const GPS_OFFLINE_QUEUE_KEY = 'fleet_gps_offline_queue';
const MAX_QUEUE_SIZE = 5000;

// ============================================
// GPS LOG OPERATIONS
// ============================================

export async function logGpsWaypoint(input: CreateGpsLogInput): Promise<void> {
  const isOnline = navigator.onLine;

  if (!isOnline) {
    addToOfflineQueue(input);
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase.from('trip_gps_logs').insert({
      trip_request_id: input.trip_request_id,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracy: input.accuracy,
      speed: input.speed,
      heading: input.heading,
      altitude: input.altitude,
      recorded_at: input.recorded_at ?? new Date().toISOString(),
      is_offline_sync: false,
      created_by: user.id,
    });

    if (error) {
      // Fall back to offline queue on insert error
      addToOfflineQueue(input);
    }
  } catch {
    addToOfflineQueue(input);
  }
}

export async function getTripGpsLogs(tripRequestId: string): Promise<TripGpsLog[]> {
  try {
    const { data, error } = await supabase
      .from('trip_gps_logs')
      .select('*')
      .eq('trip_request_id', tripRequestId)
      .order('recorded_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching GPS logs:', error);
    return [];
  }
}

export async function calculateGpsDistanceFromDB(tripRequestId: string): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('calculate_gps_distance_km', {
      p_trip_id: tripRequestId
    });
    if (error) throw error;
    return data ?? 0;
  } catch (error) {
    console.error('Error calculating GPS distance:', error);
    return 0;
  }
}

// ============================================
// OFFLINE QUEUE
// ============================================

function addToOfflineQueue(input: CreateGpsLogInput): void {
  const queue = getOfflineQueue();

  // Drop oldest entries if at capacity
  while (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
  }

  queue.push({
    ...input,
    recorded_at: input.recorded_at ?? new Date().toISOString(),
    queued_at: new Date().toISOString(),
    is_offline_sync: true,
  });

  localStorage.setItem(GPS_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function getOfflineQueue(): GpsOfflineQueueItem[] {
  try {
    const raw = localStorage.getItem(GPS_OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getOfflineQueueSize(): number {
  return getOfflineQueue().length;
}

export async function syncOfflineGpsQueue(): Promise<{ synced: number; failed: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { synced: 0, failed: queue.length };

    const payload = queue.map(item => ({
      trip_request_id: item.trip_request_id,
      latitude: item.latitude,
      longitude: item.longitude,
      accuracy: item.accuracy,
      speed: item.speed,
      heading: item.heading,
      altitude: item.altitude,
      recorded_at: item.recorded_at,
      is_offline_sync: true,
      created_by: user.id,
    }));

    const { error } = await supabase.from('trip_gps_logs').insert(payload);

    if (error) {
      console.error('Error syncing GPS queue:', error);
      return { synced: 0, failed: queue.length };
    }

    localStorage.removeItem(GPS_OFFLINE_QUEUE_KEY);
    return { synced: queue.length, failed: 0 };
  } catch (error) {
    console.error('Error syncing GPS queue:', error);
    return { synced: 0, failed: queue.length };
  }
}

// ============================================
// GPS TRACKING (Capacitor — native only)
// ============================================

export function startGpsTracking(tripId: string, intervalMs = 30000): () => void {
  let watchId: string | null = null;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  const startTracking = async () => {
    try {
      // Dynamic import so this doesn't break on web
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor.isNativePlatform()) return;

      const { Geolocation } = await import('@capacitor/geolocation');

      // Request permissions
      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted') {
        console.warn('GPS permission denied');
        return;
      }

      const savePosition = async () => {
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10000,
          });

          await logGpsWaypoint({
            trip_request_id: tripId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed ?? undefined,
            heading: pos.coords.heading ?? undefined,
            altitude: pos.coords.altitude ?? undefined,
            recorded_at: new Date(pos.timestamp).toISOString(),
          });
        } catch (err) {
          console.warn('GPS position error:', err);
        }
      };

      // Take first reading immediately
      await savePosition();
      // Then on interval
      intervalHandle = setInterval(savePosition, intervalMs);
    } catch (err) {
      console.warn('GPS tracking unavailable:', err);
    }
  };

  startTracking();

  // Return stop function
  return () => {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (watchId !== null) {
      import('@capacitor/geolocation').then(({ Geolocation }) => {
        Geolocation.clearWatch({ id: watchId! });
      });
      watchId = null;
    }
  };
}
