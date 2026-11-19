-- Migration 020: Fleet Reporting Helper Functions
-- Phase 4: RPC functions for report generation
-- Date: March 15, 2026

-- Trip history report
CREATE OR REPLACE FUNCTION get_trip_history_report(
    p_vehicle_id    UUID  DEFAULT NULL,
    p_driver_id     UUID  DEFAULT NULL,
    p_department_id UUID  DEFAULT NULL,
    p_date_from     DATE  DEFAULT NULL,
    p_date_to       DATE  DEFAULT NULL
)
RETURNS TABLE (
    trip_id           UUID,
    request_number    TEXT,
    status            TEXT,
    requester_name    TEXT,
    department_name   TEXT,
    driver_name       TEXT,
    vehicle_plate     TEXT,
    vehicle_name      TEXT,
    destination       TEXT,
    purpose           TEXT,
    planned_start     TIMESTAMPTZ,
    actual_start      TIMESTAMPTZ,
    actual_end        TIMESTAMPTZ,
    distance_km       NUMERIC,
    duration_hours    NUMERIC,
    total_expenses    NUMERIC,
    trip_rating       SMALLINT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT
        tr.id,
        tr.request_number,
        tr.status::TEXT,
        CONCAT(rp.first_name, ' ', rp.last_name),
        d.name,
        CONCAT(dp.first_name, ' ', dp.last_name),
        fv.plate_number,
        CONCAT(fv.make, ' ', fv.model),
        tr.destination,
        tr.purpose,
        tr.start_datetime,
        tr.actual_start_datetime,
        tr.actual_end_datetime,
        CASE
            WHEN tr.end_odometer IS NOT NULL AND tr.start_odometer IS NOT NULL
            THEN (tr.end_odometer - tr.start_odometer)::NUMERIC
            ELSE tr.actual_distance_km
        END,
        CASE
            WHEN tr.actual_start_datetime IS NOT NULL AND tr.actual_end_datetime IS NOT NULL
            THEN ROUND(EXTRACT(EPOCH FROM (tr.actual_end_datetime - tr.actual_start_datetime)) / 3600.0, 2)
        END,
        COALESCE((SELECT SUM(te.amount) FROM trip_expenses te WHERE te.trip_request_id = tr.id), 0),
        tr.trip_rating
    FROM trip_requests tr
    LEFT JOIN users_profile rp  ON rp.id = tr.requester_id
    LEFT JOIN users_profile dp  ON dp.id = tr.assigned_driver_id
    LEFT JOIN departments d     ON d.id  = tr.department_id
    LEFT JOIN fleet_vehicles fv ON fv.id = tr.assigned_vehicle_id
    WHERE (p_vehicle_id    IS NULL OR tr.assigned_vehicle_id = p_vehicle_id)
      AND (p_driver_id     IS NULL OR tr.assigned_driver_id  = p_driver_id)
      AND (p_department_id IS NULL OR tr.department_id       = p_department_id)
      AND (p_date_from     IS NULL OR tr.start_datetime::DATE >= p_date_from)
      AND (p_date_to       IS NULL OR tr.start_datetime::DATE <= p_date_to)
    ORDER BY tr.start_datetime DESC;
$$;

GRANT EXECUTE ON FUNCTION get_trip_history_report(UUID, UUID, UUID, DATE, DATE) TO authenticated;

-- Fuel cost report
CREATE OR REPLACE FUNCTION get_fuel_cost_report(
    p_vehicle_id UUID  DEFAULT NULL,
    p_date_from  DATE  DEFAULT NULL,
    p_date_to    DATE  DEFAULT NULL
)
RETURNS TABLE (
    vehicle_id         UUID,
    plate_number       TEXT,
    vehicle_name       TEXT,
    total_refills      BIGINT,
    total_liters       NUMERIC,
    total_cost         NUMERIC,
    avg_cost_per_liter NUMERIC,
    total_distance_km  NUMERIC,
    efficiency_km_l    NUMERIC,
    cost_per_km        NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT
        v.id,
        v.plate_number,
        CONCAT(v.make, ' ', v.model),
        COUNT(fr.id),
        COALESCE(SUM(fr.quantity_liters), 0),
        COALESCE(SUM(fr.cost_amount), 0),
        CASE WHEN SUM(fr.quantity_liters) > 0
             THEN ROUND(SUM(fr.cost_amount) / SUM(fr.quantity_liters), 2) ELSE 0 END,
        GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0),
        CASE WHEN SUM(fr.quantity_liters) > 0
                  AND GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0) > 0
             THEN ROUND(GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0)
                  / SUM(fr.quantity_liters), 2) ELSE 0 END,
        CASE WHEN GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0) > 0
             THEN ROUND(SUM(fr.cost_amount)
                  / GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0), 2)
             ELSE 0 END
    FROM fleet_vehicles v
    LEFT JOIN fuel_records fr ON fr.vehicle_id = v.id
        AND (p_date_from IS NULL OR fr.refuel_datetime::DATE >= p_date_from)
        AND (p_date_to   IS NULL OR fr.refuel_datetime::DATE <= p_date_to)
    WHERE (p_vehicle_id IS NULL OR v.id = p_vehicle_id)
    GROUP BY v.id, v.plate_number, v.make, v.model;
$$;

GRANT EXECUTE ON FUNCTION get_fuel_cost_report(UUID, DATE, DATE) TO authenticated;

COMMENT ON FUNCTION get_trip_history_report IS 'Returns trip history with optional filters for vehicle, driver, department, and date range';
COMMENT ON FUNCTION get_fuel_cost_report IS 'Returns fuel cost summary per vehicle with efficiency metrics';
