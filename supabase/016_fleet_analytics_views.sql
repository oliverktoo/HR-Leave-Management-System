-- Migration 016: Fleet Analytics Views
-- Creates the views needed by fleetPhase2Service analytics functions

-- ── DROP EXISTING VIEWS FIRST (required when changing column types) ────────
DROP VIEW IF EXISTS trip_statistics;
DROP VIEW IF EXISTS maintenance_cost_summary;
DROP VIEW IF EXISTS fuel_efficiency_summary;

-- ── FUEL EFFICIENCY SUMMARY ────────────────────────────────────────────────
-- Per-vehicle fuel usage, cost, and efficiency metrics
CREATE OR REPLACE VIEW fuel_efficiency_summary AS
SELECT
  v.id                                                         AS vehicle_id,
  v.plate_number,
  v.make,
  v.model,
  COUNT(fr.id)                                                 AS total_refills,
  COALESCE(SUM(fr.quantity_liters), 0)                         AS total_fuel_liters,
  COALESCE(SUM(fr.cost_amount), 0)                             AS total_fuel_cost,
  CASE
    WHEN COALESCE(SUM(fr.quantity_liters), 0) > 0
    THEN COALESCE(SUM(fr.cost_amount), 0) / SUM(fr.quantity_liters)
    ELSE 0
  END                                                          AS avg_cost_per_liter,
  -- Distance = max odometer minus min odometer for this vehicle's fuel records
  GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0)
                                                               AS total_distance_km,
  CASE
    WHEN COALESCE(SUM(fr.quantity_liters), 0) > 0
      AND GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0) > 0
    THEN GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0)
         / SUM(fr.quantity_liters)
    ELSE 0
  END                                                          AS fuel_efficiency_km_per_liter,
  CASE
    WHEN GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0) > 0
    THEN COALESCE(SUM(fr.cost_amount), 0)
         / GREATEST(COALESCE(MAX(fr.odometer_reading) - MIN(fr.odometer_reading), 0), 0)
    ELSE 0
  END                                                          AS cost_per_km
FROM fleet_vehicles v
LEFT JOIN fuel_records fr ON fr.vehicle_id = v.id
GROUP BY v.id, v.plate_number, v.make, v.model;

GRANT SELECT ON fuel_efficiency_summary TO authenticated;

-- ── MAINTENANCE COST SUMMARY ───────────────────────────────────────────────
-- Per-vehicle maintenance cost breakdown and service history
CREATE OR REPLACE VIEW maintenance_cost_summary AS
SELECT
  v.id                                                         AS vehicle_id,
  v.plate_number,
  v.make,
  v.model,
  COUNT(mr.id)                                                 AS total_maintenance_records,
  COUNT(CASE WHEN mr.status = 'completed' THEN 1 END)         AS completed_services,
  COALESCE(SUM(mr.labor_cost), 0)                              AS total_labor_cost,
  COALESCE(SUM(mr.parts_cost), 0)                              AS total_parts_cost,
  COALESCE(SUM(mr.total_cost), 0)                              AS total_maintenance_cost,
  CASE
    WHEN COUNT(CASE WHEN mr.status = 'completed' THEN 1 END) > 0
    THEN COALESCE(
           SUM(CASE WHEN mr.status = 'completed' THEN mr.total_cost ELSE 0 END), 0
         )::NUMERIC / COUNT(CASE WHEN mr.status = 'completed' THEN 1 END)
    ELSE 0
  END                                                          AS avg_maintenance_cost,
  MAX(CASE WHEN mr.status = 'completed' THEN mr.completed_date END)
                                                               AS last_service_date,
  v.next_service_date                                          AS next_service_due
FROM fleet_vehicles v
LEFT JOIN maintenance_records mr ON mr.vehicle_id = v.id
GROUP BY v.id, v.plate_number, v.make, v.model, v.next_service_date;

GRANT SELECT ON maintenance_cost_summary TO authenticated;

-- ── TRIP STATISTICS ────────────────────────────────────────────────────────
-- Per-trip stats including odometer distances, durations, expenses, and logs
CREATE OR REPLACE VIEW trip_statistics AS
SELECT
  tr.id                                                        AS trip_id,
  tr.request_number,
  tr.status,
  COALESCE(v.plate_number, 'Unassigned')                       AS plate_number,
  COALESCE(CONCAT(v.make, ' ', v.model), 'Unassigned')         AS vehicle_name,
  tr.start_datetime                                            AS planned_start,
  tr.end_datetime                                              AS planned_end,
  tr.actual_start_datetime,
  tr.actual_end_datetime,
  tr.start_odometer,
  tr.end_odometer,
  CASE
    WHEN tr.end_odometer IS NOT NULL AND tr.start_odometer IS NOT NULL
    THEN tr.end_odometer - tr.start_odometer
    ELSE NULL
  END                                                          AS distance_by_odometer,
  tr.actual_distance_km,
  CASE
    WHEN tr.actual_start_datetime IS NOT NULL AND tr.actual_end_datetime IS NOT NULL
    THEN EXTRACT(EPOCH FROM (tr.actual_end_datetime - tr.actual_start_datetime)) / 3600.0
    ELSE NULL
  END                                                          AS actual_duration_hours,
  EXTRACT(EPOCH FROM (tr.end_datetime - tr.start_datetime)) / 3600.0
                                                               AS planned_duration_hours,
  (
    SELECT COALESCE(SUM(te.amount), 0)
    FROM trip_expenses te
    WHERE te.trip_request_id = tr.id
  )                                                            AS total_expenses,
  (
    SELECT COUNT(*)
    FROM trip_logs tl
    WHERE tl.trip_request_id = tr.id
  )                                                            AS log_entries_count,
  tr.trip_rating,
  tr.created_at
FROM trip_requests tr
LEFT JOIN fleet_vehicles v ON v.id = tr.assigned_vehicle_id;

GRANT SELECT ON trip_statistics TO authenticated;

-- ── VERIFY ─────────────────────────────────────────────────────────────────
SELECT viewname FROM pg_views
WHERE viewname IN ('fuel_efficiency_summary', 'maintenance_cost_summary', 'trip_statistics');
