-- Migration 019: Fleet Budget & Cost Management
-- Phase 4: Budget tracking, actual vs budget, TCO
-- Date: March 15, 2026

-- Push token support for driver notifications
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS push_token TEXT;

CREATE TABLE IF NOT EXISTS fleet_budgets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,
    category        VARCHAR(30) NOT NULL CHECK (category IN ('fuel', 'maintenance', 'total')),
    budget_year     SMALLINT NOT NULL,
    budget_month    SMALLINT NOT NULL CHECK (budget_month BETWEEN 1 AND 12),
    budget_amount   NUMERIC(14,2) NOT NULL CHECK (budget_amount >= 0),
    notes           TEXT,
    created_by      UUID NOT NULL REFERENCES auth.users(id),
    updated_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (department_id, category, budget_year, budget_month)
);

CREATE INDEX IF NOT EXISTS idx_fleet_budgets_period ON fleet_budgets(budget_year, budget_month);
CREATE INDEX IF NOT EXISTS idx_fleet_budgets_dept   ON fleet_budgets(department_id);
CREATE INDEX IF NOT EXISTS idx_fleet_budgets_cat    ON fleet_budgets(category);

ALTER TABLE fleet_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet managers and admins manage budgets"
ON fleet_budgets FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users_profile up
        WHERE up.id = auth.uid()
        AND up.role IN ('fleet_manager', 'hr_admin', 'super_admin')
    )
);

CREATE OR REPLACE FUNCTION set_fleet_budget_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_fleet_budgets_updated_at
    BEFORE UPDATE ON fleet_budgets
    FOR EACH ROW EXECUTE FUNCTION set_fleet_budget_updated_at();

-- Budget vs Actual view
CREATE OR REPLACE VIEW fleet_budget_actuals AS
WITH fuel_actuals AS (
    SELECT
        tr.department_id,
        EXTRACT(YEAR  FROM fr.refuel_datetime)::SMALLINT AS yr,
        EXTRACT(MONTH FROM fr.refuel_datetime)::SMALLINT AS mo,
        SUM(fr.cost_amount) AS actual_fuel
    FROM fuel_records fr
    JOIN trip_requests tr ON tr.id = fr.trip_request_id
    WHERE tr.department_id IS NOT NULL
    GROUP BY tr.department_id, yr, mo
),
maint_actuals AS (
    SELECT
        fv.assigned_department_id AS department_id,
        EXTRACT(YEAR  FROM mr.completed_date)::SMALLINT AS yr,
        EXTRACT(MONTH FROM mr.completed_date)::SMALLINT AS mo,
        SUM(mr.total_cost) AS actual_maintenance
    FROM maintenance_records mr
    JOIN fleet_vehicles fv ON fv.id = mr.vehicle_id
    WHERE fv.assigned_department_id IS NOT NULL
      AND mr.status = 'completed'
    GROUP BY fv.assigned_department_id, yr, mo
)
SELECT
    b.id                  AS budget_id,
    b.department_id,
    d.name                AS department_name,
    b.category,
    b.budget_year,
    b.budget_month,
    b.budget_amount,
    CASE b.category
        WHEN 'fuel'        THEN COALESCE(fa.actual_fuel, 0)
        WHEN 'maintenance' THEN COALESCE(ma.actual_maintenance, 0)
        WHEN 'total'       THEN COALESCE(fa.actual_fuel, 0) + COALESCE(ma.actual_maintenance, 0)
    END                   AS actual_amount,
    b.budget_amount - CASE b.category
        WHEN 'fuel'        THEN COALESCE(fa.actual_fuel, 0)
        WHEN 'maintenance' THEN COALESCE(ma.actual_maintenance, 0)
        WHEN 'total'       THEN COALESCE(fa.actual_fuel, 0) + COALESCE(ma.actual_maintenance, 0)
    END                   AS variance
FROM fleet_budgets b
LEFT JOIN departments d         ON d.id = b.department_id
LEFT JOIN fuel_actuals fa       ON fa.department_id = b.department_id
                                AND fa.yr = b.budget_year AND fa.mo = b.budget_month
LEFT JOIN maint_actuals ma      ON ma.department_id = b.department_id
                                AND ma.yr = b.budget_year AND ma.mo = b.budget_month;

GRANT SELECT ON fleet_budget_actuals TO authenticated;

-- Vehicle TCO view
CREATE OR REPLACE VIEW vehicle_tco AS
SELECT
    v.id             AS vehicle_id,
    v.plate_number,
    v.make,
    v.model,
    v.year,
    v.fuel_type,
    v.current_odometer,
    COALESCE(f.total_fuel_cost, 0)      AS total_fuel_cost,
    COALESCE(m.total_maint_cost, 0)     AS total_maintenance_cost,
    COALESCE(f.total_fuel_cost, 0) + COALESCE(m.total_maint_cost, 0) AS total_cost,
    COALESCE(f.tracked_km, 0)           AS tracked_km,
    CASE WHEN COALESCE(f.tracked_km, 0) > 0
         THEN ROUND((COALESCE(f.total_fuel_cost, 0) + COALESCE(m.total_maint_cost, 0)) /
                    f.tracked_km, 2)
         ELSE 0
    END AS cost_per_km,
    EXTRACT(YEAR  FROM AGE(NOW(), v.created_at)) * 12 +
    EXTRACT(MONTH FROM AGE(NOW(), v.created_at)) AS age_months
FROM fleet_vehicles v
LEFT JOIN (
    SELECT vehicle_id,
           SUM(cost_amount) AS total_fuel_cost,
           GREATEST(MAX(odometer_reading) - MIN(odometer_reading), 0) AS tracked_km
    FROM fuel_records
    GROUP BY vehicle_id
) f ON f.vehicle_id = v.id
LEFT JOIN (
    SELECT vehicle_id, SUM(total_cost) AS total_maint_cost
    FROM maintenance_records
    WHERE status = 'completed'
    GROUP BY vehicle_id
) m ON m.vehicle_id = v.id;

GRANT SELECT ON vehicle_tco TO authenticated;

COMMENT ON TABLE fleet_budgets IS 'Monthly fleet cost budgets per department and category';
COMMENT ON VIEW fleet_budget_actuals IS 'Budget vs actual spend comparison per department/month';
COMMENT ON VIEW vehicle_tco IS 'Total Cost of Ownership per vehicle including fuel and maintenance';
