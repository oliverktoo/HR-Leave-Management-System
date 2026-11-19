-- Migration 018: GPS Route Tracking
-- Phase 4: GPS waypoint logging for trips
-- Date: March 15, 2026

CREATE TABLE IF NOT EXISTS trip_gps_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_request_id UUID NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
    latitude        DOUBLE PRECISION NOT NULL,
    longitude       DOUBLE PRECISION NOT NULL,
    accuracy        REAL,
    speed           REAL,
    heading         REAL,
    altitude        REAL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at       TIMESTAMPTZ DEFAULT NOW(),
    is_offline_sync BOOLEAN DEFAULT false,
    created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_trip_gps_trip ON trip_gps_logs(trip_request_id);
CREATE INDEX IF NOT EXISTS idx_trip_gps_time ON trip_gps_logs(recorded_at);

ALTER TABLE trip_gps_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can insert gps logs"
ON trip_gps_logs FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Fleet staff and driver can read gps logs"
ON trip_gps_logs FOR SELECT TO authenticated
USING (
    created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM users_profile up
        WHERE up.id = auth.uid()
        AND up.role IN ('fleet_manager', 'hr_admin', 'super_admin')
    )
    OR EXISTS (
        SELECT 1 FROM trip_requests tr
        WHERE tr.id = trip_gps_logs.trip_request_id
        AND tr.requester_id = auth.uid()
    )
);

-- Haversine distance calculator
CREATE OR REPLACE FUNCTION calculate_gps_distance_km(p_trip_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    total_dist NUMERIC := 0;
    prev_lat   DOUBLE PRECISION;
    prev_lng   DOUBLE PRECISION;
    rec        RECORD;
    R          CONSTANT NUMERIC := 6371;
BEGIN
    FOR rec IN
        SELECT latitude, longitude
        FROM trip_gps_logs
        WHERE trip_request_id = p_trip_id
        ORDER BY recorded_at
    LOOP
        IF prev_lat IS NOT NULL THEN
            total_dist := total_dist + (
                2 * R * ASIN(SQRT(
                    POWER(SIN(RADIANS(rec.latitude  - prev_lat) / 2), 2) +
                    COS(RADIANS(prev_lat)) * COS(RADIANS(rec.latitude)) *
                    POWER(SIN(RADIANS(rec.longitude - prev_lng) / 2), 2)
                ))
            );
        END IF;
        prev_lat := rec.latitude;
        prev_lng := rec.longitude;
    END LOOP;
    RETURN ROUND(total_dist::NUMERIC, 3);
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_gps_distance_km(UUID) TO authenticated;

COMMENT ON TABLE trip_gps_logs IS 'GPS waypoints recorded during trip execution';
COMMENT ON FUNCTION calculate_gps_distance_km(UUID) IS 'Calculates total GPS distance in km using Haversine formula';
