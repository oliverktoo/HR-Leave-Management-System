-- FleetOS Phase 2: Trip Execution & Operations Management
-- Migration: 011_fleet_management_phase2.sql
-- Date: March 11, 2026

-- ============================================
-- Summary: Extends Phase 1 with trip execution tracking, fuel management,
-- maintenance records, expense tracking, and vehicle inspections
-- ============================================

-- ============================================
-- 1. Trip Execution Tracking
-- ============================================

-- Extend trip_requests table with execution data
ALTER TABLE trip_requests
ADD COLUMN IF NOT EXISTS actual_start_datetime TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_end_datetime TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS start_odometer DECIMAL(10,1),
ADD COLUMN IF NOT EXISTS end_odometer DECIMAL(10,1),
ADD COLUMN IF NOT EXISTS actual_distance_km DECIMAL(8,1),
ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS trip_rating DECIMAL(3,2) CHECK (trip_rating >= 1.00 AND trip_rating <= 5.00),
ADD COLUMN IF NOT EXISTS trip_feedback TEXT;

-- Add index for trip tracking queries
CREATE INDEX IF NOT EXISTS idx_trip_requests_actual_dates ON trip_requests(actual_start_datetime, actual_end_datetime);

-- ============================================
-- 2. Fuel Management
-- ============================================

CREATE TABLE IF NOT EXISTS fuel_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    trip_request_id UUID REFERENCES trip_requests(id) ON DELETE SET NULL,
    driver_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Fuel Details
    refuel_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fuel_type VARCHAR(20) NOT NULL CHECK (fuel_type IN ('petrol', 'diesel', 'electric')),
    quantity_liters DECIMAL(8,2) NOT NULL CHECK (quantity_liters > 0),
    cost_amount DECIMAL(10,2) NOT NULL CHECK (cost_amount >= 0),
    cost_per_liter DECIMAL(8,2),
    odometer_reading DECIMAL(10,1) NOT NULL,
    
    -- Fuel Station
    station_name VARCHAR(100),
    station_location TEXT,
    
    -- Payment
    fuel_card_number VARCHAR(50),
    receipt_number VARCHAR(50),
    receipt_photo_url TEXT,
    payment_method VARCHAR(20) DEFAULT 'fuel_card' CHECK (payment_method IN ('fuel_card', 'cash', 'mpesa', 'company_card')),
    
    -- Validation
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for fuel queries
CREATE INDEX IF NOT EXISTS idx_fuel_records_vehicle ON fuel_records(vehicle_id, refuel_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_records_driver ON fuel_records(driver_id);
CREATE INDEX IF NOT EXISTS idx_fuel_records_trip ON fuel_records(trip_request_id);
CREATE INDEX IF NOT EXISTS idx_fuel_records_verification ON fuel_records(is_verified, verified_at);

-- ============================================
-- 3. Maintenance Management
-- ============================================

CREATE TABLE IF NOT EXISTS maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    
    -- Maintenance Type
    maintenance_type VARCHAR(30) NOT NULL CHECK (maintenance_type IN (
        'service', 'repair', 'inspection', 'tire_change', 'oil_change', 
        'brake_service', 'battery', 'accident_repair', 'other'
    )),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
    
    -- Schedule
    scheduled_date DATE,
    completed_date DATE,
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    
    -- Details
    odometer_reading DECIMAL(10,1),
    description TEXT NOT NULL,
    work_performed TEXT,
    parts_replaced JSONB, -- [{part_name: string, quantity: number, cost: number}]
    
    -- Service Provider
    service_provider VARCHAR(100),
    service_location TEXT,
    mechanic_name VARCHAR(100),
    
    -- Costs
    labor_cost DECIMAL(10,2) DEFAULT 0,
    parts_cost DECIMAL(10,2) DEFAULT 0,
    total_cost DECIMAL(10,2) DEFAULT 0,
    
    -- Documentation
    invoice_number VARCHAR(50),
    invoice_photo_url TEXT,
    
    -- Follow-up
    next_service_date DATE,
    next_service_odometer DECIMAL(10,1),
    
    -- Tracking
    reported_by UUID REFERENCES auth.users(id),
    assigned_to UUID REFERENCES auth.users(id),
    completed_by UUID REFERENCES auth.users(id),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for maintenance queries
CREATE INDEX IF NOT EXISTS idx_maintenance_vehicle ON maintenance_records(vehicle_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_records(status, priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_dates ON maintenance_records(scheduled_date, completed_date);

-- ============================================
-- 4. Trip Expenses
-- ============================================

CREATE TABLE IF NOT EXISTS trip_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_request_id UUID NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id),
    
    -- Expense Details
    expense_type VARCHAR(30) NOT NULL CHECK (expense_type IN (
        'fuel', 'toll', 'parking', 'accommodation', 'meals', 
        'repairs', 'other'
    )),
    expense_date DATE NOT NULL,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'KES',
    
    -- Description
    description TEXT NOT NULL,
    location TEXT,
    
    -- Payment
    payment_method VARCHAR(20) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'mpesa', 'fuel_card', 'company_card')),
    paid_by UUID REFERENCES auth.users(id),
    
    -- Documentation
    receipt_number VARCHAR(50),
    receipt_photo_url TEXT,
    
    -- Approval
    is_approved BOOLEAN DEFAULT FALSE,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for expense queries
CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip ON trip_expenses(trip_request_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_vehicle ON trip_expenses(vehicle_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_approval ON trip_expenses(is_approved, approved_at);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_type ON trip_expenses(expense_type, expense_date);

-- ============================================
-- 5. Vehicle Inspections
-- ============================================

CREATE TABLE IF NOT EXISTS vehicle_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    trip_request_id UUID REFERENCES trip_requests(id) ON DELETE SET NULL,
    
    -- Inspection Type
    inspection_type VARCHAR(20) NOT NULL CHECK (inspection_type IN ('pre_trip', 'post_trip', 'periodic', 'incident')),
    inspection_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    odometer_reading DECIMAL(10,1) NOT NULL,
    
    -- Inspector
    inspector_id UUID NOT NULL REFERENCES auth.users(id),
    
    -- Inspection Items (JSON structure for flexibility)
    checklist JSONB NOT NULL DEFAULT '{}', -- {item_name: {status: pass/fail/na, notes: string}}
    
    -- Overall Status
    overall_status VARCHAR(20) DEFAULT 'pass' CHECK (overall_status IN ('pass', 'pass_with_notes', 'fail')),
    
    -- Issues Found
    issues_found TEXT[],
    damage_reported BOOLEAN DEFAULT FALSE,
    damage_description TEXT,
    damage_photos JSONB, -- [url1, url2, ...]
    
    -- Actions Required
    requires_maintenance BOOLEAN DEFAULT FALSE,
    maintenance_priority VARCHAR(20) CHECK (maintenance_priority IN ('low', 'normal', 'high', 'critical')),
    action_taken TEXT,
    
    -- Signature/Verification
    inspector_signature_url TEXT,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for inspection queries
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle ON vehicle_inspections(vehicle_id, inspection_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_trip ON vehicle_inspections(trip_request_id);
CREATE INDEX IF NOT EXISTS idx_inspections_type ON vehicle_inspections(inspection_type, inspection_datetime);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON vehicle_inspections(overall_status, requires_maintenance);

-- ============================================
-- 6. Trip Logs (Detailed trip tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS trip_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_request_id UUID NOT NULL REFERENCES trip_requests(id) ON DELETE CASCADE,
    
    -- Log Entry
    log_datetime TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    log_type VARCHAR(30) NOT NULL CHECK (log_type IN (
        'started', 'waypoint', 'break', 'refuel', 'incident', 
        'delay', 'completed', 'cancelled', 'note'
    )),
    
    -- Location
    location TEXT,
    coordinates POINT, -- GPS coordinates
    odometer_reading DECIMAL(10,1),
    
    -- Details
    description TEXT NOT NULL,
    duration_minutes INTEGER, -- For breaks, delays
    
    -- User
    logged_by UUID NOT NULL REFERENCES auth.users(id),
    
    -- Attachments
    photos JSONB, -- [url1, url2, ...]
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for trip log queries
CREATE INDEX IF NOT EXISTS idx_trip_logs_request ON trip_logs(trip_request_id, log_datetime);
CREATE INDEX IF NOT EXISTS idx_trip_logs_type ON trip_logs(log_type, log_datetime);

-- ============================================
-- 7. Fuel Efficiency Tracking View
-- ============================================

CREATE OR REPLACE VIEW fuel_efficiency_summary AS
SELECT 
    v.id as vehicle_id,
    v.plate_number,
    v.make,
    v.model,
    COUNT(f.id) as total_refills,
    SUM(f.quantity_liters) as total_fuel_liters,
    SUM(f.cost_amount) as total_fuel_cost,
    AVG(f.cost_per_liter) as avg_cost_per_liter,
    SUM(t.actual_distance_km) as total_distance_km,
    CASE 
        WHEN SUM(f.quantity_liters) > 0 THEN 
            SUM(t.actual_distance_km) / SUM(f.quantity_liters)
        ELSE NULL
    END as fuel_efficiency_km_per_liter,
    CASE 
        WHEN SUM(t.actual_distance_km) > 0 THEN 
            SUM(f.cost_amount) / SUM(t.actual_distance_km)
        ELSE NULL
    END as cost_per_km
FROM fleet_vehicles v
LEFT JOIN fuel_records f ON v.id = f.vehicle_id
LEFT JOIN trip_requests t ON f.trip_request_id = t.id AND t.actual_distance_km IS NOT NULL
WHERE v.status != 'retired'
GROUP BY v.id, v.plate_number, v.make, v.model;

-- ============================================
-- 8. Maintenance Cost Summary View
-- ============================================

CREATE OR REPLACE VIEW maintenance_cost_summary AS
SELECT 
    v.id as vehicle_id,
    v.plate_number,
    v.make,
    v.model,
    COUNT(m.id) as total_maintenance_records,
    SUM(CASE WHEN m.status = 'completed' THEN 1 ELSE 0 END) as completed_services,
    SUM(m.labor_cost) as total_labor_cost,
    SUM(m.parts_cost) as total_parts_cost,
    SUM(m.total_cost) as total_maintenance_cost,
    AVG(m.total_cost) as avg_maintenance_cost,
    MAX(m.completed_date) as last_service_date,
    MIN(m.next_service_date) as next_service_due
FROM fleet_vehicles v
LEFT JOIN maintenance_records m ON v.id = m.vehicle_id
WHERE v.status != 'retired'
GROUP BY v.id, v.plate_number, v.make, v.model;

-- ============================================
-- 9. Trip Statistics View
-- ============================================

CREATE OR REPLACE VIEW trip_statistics AS
SELECT 
    t.id as trip_id,
    t.request_number,
    t.status,
    v.plate_number,
    v.make || ' ' || v.model as vehicle_name,
    t.start_datetime as planned_start,
    t.end_datetime as planned_end,
    t.actual_start_datetime,
    t.actual_end_datetime,
    t.start_odometer,
    t.end_odometer,
    t.end_odometer - t.start_odometer as distance_by_odometer,
    t.actual_distance_km,
    EXTRACT(EPOCH FROM (t.actual_end_datetime - t.actual_start_datetime))/3600 as actual_duration_hours,
    EXTRACT(EPOCH FROM (t.end_datetime - t.start_datetime))/3600 as planned_duration_hours,
    (SELECT SUM(amount) FROM trip_expenses WHERE trip_request_id = t.id) as total_expenses,
    (SELECT COUNT(*) FROM trip_logs WHERE trip_request_id = t.id) as log_entries_count,
    t.trip_rating,
    t.created_at
FROM trip_requests t
LEFT JOIN fleet_vehicles v ON t.assigned_vehicle_id = v.id
WHERE t.status IN ('in_progress', 'completed');

-- ============================================
-- 10. Helper Functions
-- ============================================

-- Calculate fuel efficiency for a trip
CREATE OR REPLACE FUNCTION calculate_trip_fuel_efficiency(p_trip_id UUID)
RETURNS TABLE (
    fuel_used_liters DECIMAL(8,2),
    distance_km DECIMAL(8,1),
    efficiency_km_per_liter DECIMAL(6,2),
    total_fuel_cost DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        SUM(f.quantity_liters)::DECIMAL(8,2) as fuel_used_liters,
        t.actual_distance_km,
        CASE 
            WHEN SUM(f.quantity_liters) > 0 THEN 
                (t.actual_distance_km / SUM(f.quantity_liters))::DECIMAL(6,2)
            ELSE NULL
        END as efficiency_km_per_liter,
        SUM(f.cost_amount)::DECIMAL(10,2) as total_fuel_cost
    FROM trip_requests t
    LEFT JOIN fuel_records f ON f.trip_request_id = t.id
    WHERE t.id = p_trip_id
    GROUP BY t.id, t.actual_distance_km;
END;
$$ LANGUAGE plpgsql;

-- Check if vehicle is due for maintenance
CREATE OR REPLACE FUNCTION is_vehicle_due_for_maintenance(
    p_vehicle_id UUID,
    p_current_odometer DECIMAL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_next_service_odo DECIMAL;
    v_next_service_date DATE;
BEGIN
    SELECT next_service_odometer, next_service_date
    INTO v_next_service_odo, v_next_service_date
    FROM fleet_vehicles
    WHERE id = p_vehicle_id;
    
    -- Check if due by odometer
    IF v_next_service_odo IS NOT NULL AND p_current_odometer >= v_next_service_odo THEN
        RETURN TRUE;
    END IF;
    
    -- Check if due by date
    IF v_next_service_date IS NOT NULL AND v_next_service_date <= CURRENT_DATE THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. Updated_at Triggers
-- ============================================

-- Maintenance records
DROP TRIGGER IF EXISTS trigger_maintenance_updated_at ON maintenance_records;
CREATE TRIGGER trigger_maintenance_updated_at
    BEFORE UPDATE ON maintenance_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 12. Row Level Security Policies
-- ============================================

-- Enable RLS
ALTER TABLE fuel_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_logs ENABLE ROW LEVEL SECURITY;

-- Fuel Records Policies
CREATE POLICY "Users can view fuel records for their assigned trips or vehicles"
    ON fuel_records FOR SELECT
    USING (
        auth.uid() = driver_id OR
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = fuel_records.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

CREATE POLICY "Drivers and fleet managers can create fuel records"
    ON fuel_records FOR INSERT
    WITH CHECK (
        auth.uid() = driver_id OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

CREATE POLICY "Fleet managers can update fuel records"
    ON fuel_records FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

-- Maintenance Records Policies
CREATE POLICY "Users can view maintenance records"
    ON maintenance_records FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

CREATE POLICY "Fleet managers can manage maintenance records"
    ON maintenance_records FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

-- Trip Expenses Policies
CREATE POLICY "Users can view trip expenses for their trips"
    ON trip_expenses FOR SELECT
    USING (
        auth.uid() = paid_by OR
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = trip_expenses.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin', 'hod')
        )
    );

CREATE POLICY "Trip participants can create expenses"
    ON trip_expenses FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = trip_expenses.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

CREATE POLICY "Managers can approve/update expenses"
    ON trip_expenses FOR UPDATE
    USING (
        auth.uid() = created_by OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin', 'hod')
        )
    );

-- Vehicle Inspections Policies
CREATE POLICY "Users can view inspections"
    ON vehicle_inspections FOR SELECT
    USING (
        auth.uid() = inspector_id OR
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = vehicle_inspections.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

CREATE POLICY "Drivers and managers can create inspections"
    ON vehicle_inspections FOR INSERT
    WITH CHECK (
        auth.uid() = inspector_id
    );

-- Trip Logs Policies
CREATE POLICY "Users can view trip logs for their trips"
    ON trip_logs FOR SELECT
    USING (
        auth.uid() = logged_by OR
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = trip_logs.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

CREATE POLICY "Trip participants can create logs"
    ON trip_logs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM trip_requests 
            WHERE id = trip_logs.trip_request_id 
            AND (requester_id = auth.uid() OR assigned_driver_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM users_profile 
            WHERE id = auth.uid() 
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

-- ============================================
-- Phase 2 Migration Complete
-- ============================================

COMMENT ON TABLE fuel_records IS 'FleetOS Phase 2: Fuel consumption and refill tracking';
COMMENT ON TABLE maintenance_records IS 'FleetOS Phase 2: Vehicle maintenance and service records';
COMMENT ON TABLE trip_expenses IS 'FleetOS Phase 2: Trip-related expenses and reimbursements';
COMMENT ON TABLE vehicle_inspections IS 'FleetOS Phase 2: Pre/post trip vehicle inspections';
COMMENT ON TABLE trip_logs IS 'FleetOS Phase 2: Detailed trip activity logs';
