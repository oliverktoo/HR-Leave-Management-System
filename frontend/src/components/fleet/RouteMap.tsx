// Fleet Phase 4: Route Map Component
// Displays GPS route for a trip using Leaflet

import { useState, useEffect } from 'react';
import { getTripGpsLogs, calculateGpsDistanceFromDB } from '../../services/gpsService';
import { TripGpsLog } from '../../types/fleetPhase4';

interface RouteMapProps {
  tripId: string;
  odometerDistance?: number; // km from start/end odometer difference
}

// Lazy-loaded map component to avoid SSR issues
function LeafletMap({ logs }: { logs: TripGpsLog[] }) {
  useEffect(() => {
    // Dynamically load leaflet styles
    if (!document.querySelector('#leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (logs.length === 0) return;

    // Load leaflet dynamically
    import('leaflet').then((L) => {
      const mapId = 'route-map-container';
      const container = document.getElementById(mapId);
      if (!container) return;

      // Remove any existing map instance
      // @ts-ignore
      if (container._leaflet_id) return;

      const center: [number, number] = [logs[0].latitude, logs[0].longitude];
      const map = L.map(mapId).setView(center, 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Draw route polyline
      const coords: [number, number][] = logs.map(log => [log.latitude, log.longitude]);
      L.polyline(coords, { color: '#3b82f6', weight: 4, opacity: 0.8 }).addTo(map);

      // Start marker (green)
      if (logs.length > 0) {
        L.circleMarker([logs[0].latitude, logs[0].longitude], {
          radius: 10, fillColor: '#22c55e', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(map).bindPopup(`Start<br>${new Date(logs[0].recorded_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}`);
      }

      // End marker (red)
      if (logs.length > 1) {
        const last = logs[logs.length - 1];
        L.circleMarker([last.latitude, last.longitude], {
          radius: 10, fillColor: '#ef4444', color: '#fff', weight: 2, fillOpacity: 1
        }).addTo(map).bindPopup(`End<br>${new Date(last.recorded_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' })}`);
      }

      // Fit map to route
      if (coords.length > 1) {
        map.fitBounds(L.latLngBounds(coords), { padding: [20, 20] });
      }
    });
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div
      id="route-map-container"
      style={{ height: 400, width: '100%', borderRadius: 8, overflow: 'hidden' }}
    />
  );
}

export function RouteMap({ tripId, odometerDistance }: RouteMapProps) {
  const [logs, setLogs] = useState<TripGpsLog[]>([]);
  const [gpsDistance, setGpsDistance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [tripId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [logData, distance] = await Promise.all([
        getTripGpsLogs(tripId),
        calculateGpsDistanceFromDB(tripId),
      ]);
      setLogs(logData);
      setGpsDistance(distance);
    } finally {
      setIsLoading(false);
    }
  };

  const variance = odometerDistance != null && gpsDistance > 0
    ? Math.abs(odometerDistance - gpsDistance)
    : null;

  if (isLoading) {
    return <div className="text-center py-8 text-muted">Loading route data...</div>;
  }

  if (logs.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 48 }}>🗺️</div>
        <h3>No GPS Data</h3>
        <p>GPS tracking was not active during this trip, or no waypoints were recorded.</p>
      </div>
    );
  }

  const duration = logs.length > 1
    ? ((new Date(logs[logs.length - 1].recorded_at).getTime() - new Date(logs[0].recorded_at).getTime()) / 3600000).toFixed(1)
    : '—';

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <div className="stats-card">
          <p className="stats-title">GPS Distance</p>
          <p className="stats-value">{gpsDistance.toFixed(1)} km</p>
        </div>
        {odometerDistance != null && (
          <div className="stats-card">
            <p className="stats-title">Odometer Distance</p>
            <p className="stats-value">{odometerDistance.toFixed(1)} km</p>
          </div>
        )}
        {variance != null && (
          <div className="stats-card">
            <p className="stats-title">Variance</p>
            <p className={`stats-value ${variance > 5 ? 'text-danger' : 'text-success'}`}>
              {variance.toFixed(1)} km
            </p>
          </div>
        )}
        <div className="stats-card">
          <p className="stats-title">Waypoints</p>
          <p className="stats-value">{logs.length}</p>
        </div>
        <div className="stats-card">
          <p className="stats-title">Duration</p>
          <p className="stats-value">{duration} h</p>
        </div>
      </div>

      {/* Map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <LeafletMap logs={logs} />
      </div>

      {/* Offline sync indicator */}
      {logs.some(l => l.is_offline_sync) && (
        <div className="alert" style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
          ⚠️ Some waypoints were logged offline and synced later — small gaps in the route are normal.
        </div>
      )}
    </div>
  );
}
