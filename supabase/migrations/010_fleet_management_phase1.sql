-- FleetOS Phase 1: Core Booking System
-- Migration: 010_fleet_management_phase1.sql
-- Date: March 10, 2026

-- ============================================
-- Note: The 'fleet_manager' role is stored as TEXT in users_profile.role
-- No enum alteration needed - just set role = 'fleet_manager' for fleet managers
-- ============================================

-- ============================================
-- 1. Add driver attributes to users_profile
-- ============================================

ALTER TABLE users_profile 
ADD COLUMN IF NOT EXISTS is_driver BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS driver_license_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS driver_license_expiry DATE,
ADD COLUMN IF NOT EXISTS driver_license_class VARCHAR(10);

-- ============================================
-- 2. Create fleet_vehicles table
-- ============================================

CREATE TABLE IF NOT EXISTS fleet_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plate_number VARCHAR(20) NOT NULL UNIQUE,
    make VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year INTEGER,
    color VARCHAR(30),
    fuel_type VARCHAR(20) DEFAULT 'petrol' CHECK (fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid')),
    seating_capacity INTEGER DEFAULT 5,
    current_odometer DECIMAL(10,1) DEFAULT 0,
    assigned_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'in_use', 'maintenance', 'retired')),
    insurance_expiry DATE,
    next_service_date DATE,
    next_service_odometer DECIMAL(10,1),
    fuel_card_number VARCHAR(50),
    photo_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_status ON fleet_vehicles(status);
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_department ON fleet_vehicles(assigned_department_id);

-- ============================================
-- 3. Create driver_profiles table
-- ============================================

CREATE TABLE IF NOT EXISTS driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    
    license_number VARCHAR(50) NOT NULL,
    license_class VARCHAR(10),
    license_expiry DATE NOT NULL,
    license_photo_url TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    driver_rating DECIMAL(3,2) DEFAULT 5.00 CHECK (driver_rating >= 1.00 AND driver_rating <= 5.00),
    total_trips INTEGER DEFAULT 0,
    total_distance_km DECIMAL(12,1) DEFAULT 0,
    
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(20),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_user ON driver_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_driver_profiles_active ON driver_profiles(is_active);

-- ============================================
-- 4. Create trip_requests table
-- ============================================

CREATE TABLE IF NOT EXISTS trip_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_number VARCHAR(20) UNIQUE, -- TR-2026-0001 format
    requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id),
    
    -- Trip Details
    purpose TEXT NOT NULL,
    destination TEXT NOT NULL,
    multi_stop_destinations JSONB, -- [{address: string, order: number}]
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    estimated_distance_km DECIMAL(8,1),
    
    -- Passengers
    passengers JSONB, -- [{user_id: uuid, name: string}]
    passenger_count INTEGER DEFAULT 1,
    
    -- Vehicle Preference
    preferred_vehicle_id UUID REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
    vehicle_requirements TEXT,
    
    -- Status & Workflow
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'assigned', 
        'in_progress', 'completed', 'cancelled'
    )),
    
    -- Approval
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,
    approval_comments TEXT,
    rejection_reason TEXT,
    
    -- Assignment (after approval)
    assigned_vehicle_id UUID REFERENCES fleet_vehicles(id) ON DELETE SET NULL,
    assigned_driver_id UUID REFERENCES auth.users(id),
    assigned_by UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trip_requests_requester ON trip_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_trip_requests_department ON trip_requests(department_id);
CREATE INDEX IF NOT EXISTS idx_trip_requests_status ON trip_requests(status);
CREATE INDEX IF NOT EXISTS idx_trip_requests_dates ON trip_requests(start_datetime, end_datetime);
CREATE INDEX IF NOT EXISTS idx_trip_requests_driver ON trip_requests(assigned_driver_id);

-- ============================================
-- 5. Generate trip request number function
-- ============================================

CREATE OR REPLACE FUNCTION generate_trip_request_number()
RETURNS TRIGGER AS $$
DECLARE
    year_prefix VARCHAR(4);
    next_number INTEGER;
BEGIN
    year_prefix := TO_CHAR(NOW(), 'YYYY');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(request_number FROM 9) AS INTEGER)), 0) + 1
    INTO next_number
    FROM trip_requests
    WHERE request_number LIKE 'TR-' || year_prefix || '-%';
    
    NEW.request_number := 'TR-' || year_prefix || '-' || LPAD(next_number::TEXT, 4, '0');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating request numbers
DROP TRIGGER IF EXISTS trigger_generate_trip_request_number ON trip_requests;
CREATE TRIGGER trigger_generate_trip_request_number
    BEFORE INSERT ON trip_requests
    FOR EACH ROW
    WHEN (NEW.request_number IS NULL)
    EXECUTE FUNCTION generate_trip_request_number();

-- ============================================
-- 6. Updated_at trigger for all tables
-- ============================================

-- Fleet vehicles
DROP TRIGGER IF EXISTS trigger_fleet_vehicles_updated_at ON fleet_vehicles;
CREATE TRIGGER trigger_fleet_vehicles_updated_at
    BEFORE UPDATE ON fleet_vehicles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Driver profiles
DROP TRIGGER IF EXISTS trigger_driver_profiles_updated_at ON driver_profiles;
CREATE TRIGGER trigger_driver_profiles_updated_at
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trip requests
DROP TRIGGER IF EXISTS trigger_trip_requests_updated_at ON trip_requests;
CREATE TRIGGER trigger_trip_requests_updated_at
    BEFORE UPDATE ON trip_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Row Level Security Policies
-- ============================================

-- Enable RLS
ALTER TABLE fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_requests ENABLE ROW LEVEL SECURITY;

-- ==================
-- Fleet Vehicles RLS
-- ==================

-- Everyone can view vehicles
CREATE POLICY "fleet_vehicles_select_all" ON fleet_vehicles
    FOR SELECT USING (true);

-- Fleet managers and super admins can manage vehicles
CREATE POLICY "fleet_vehicles_insert" ON fleet_vehicles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

CREATE POLICY "fleet_vehicles_update" ON fleet_vehicles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

CREATE POLICY "fleet_vehicles_delete" ON fleet_vehicles
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- ==================
-- Driver Profiles RLS
-- ==================

-- Drivers can view their own profile
CREATE POLICY "driver_profiles_select_own" ON driver_profiles
    FOR SELECT USING (user_id = auth.uid());

-- Fleet managers, HR, and super admins can view all drivers
CREATE POLICY "driver_profiles_select_admin" ON driver_profiles
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'hr_admin', 'super_admin')
        )
    );

-- HR and super admins can manage driver profiles
CREATE POLICY "driver_profiles_insert" ON driver_profiles
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('hr_admin', 'super_admin')
        )
    );

CREATE POLICY "driver_profiles_update" ON driver_profiles
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('hr_admin', 'super_admin')
        )
        OR user_id = auth.uid() -- Drivers can update their own profile
    );

-- ==================
-- Trip Requests RLS
-- ==================

-- Users can view their own requests
CREATE POLICY "trip_requests_select_own" ON trip_requests
    FOR SELECT USING (requester_id = auth.uid());

-- Drivers can view requests assigned to them
CREATE POLICY "trip_requests_select_driver" ON trip_requests
    FOR SELECT USING (assigned_driver_id = auth.uid());

-- HODs can view department requests
CREATE POLICY "trip_requests_select_hod" ON trip_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users_profile up
            WHERE up.id = auth.uid()
            AND up.role = 'hod'
            AND up.department_id = trip_requests.department_id
        )
    );

-- Fleet managers and super admins can view all requests
CREATE POLICY "trip_requests_select_admin" ON trip_requests
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin', 'hr_admin')
        )
    );

-- Anyone can create a trip request
CREATE POLICY "trip_requests_insert" ON trip_requests
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND requester_id = auth.uid()
    );

-- Users can update their own pending requests (cancel)
CREATE POLICY "trip_requests_update_own" ON trip_requests
    FOR UPDATE USING (
        requester_id = auth.uid()
        AND status = 'pending'
    );

-- HODs can approve/reject department requests
CREATE POLICY "trip_requests_update_hod" ON trip_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_profile up
            WHERE up.id = auth.uid()
            AND up.role = 'hod'
            AND up.department_id = trip_requests.department_id
        )
        AND status IN ('pending', 'approved')
    );

-- Fleet managers can approve/reject and assign
CREATE POLICY "trip_requests_update_fleet" ON trip_requests
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users_profile WHERE id = auth.uid()
            AND role IN ('fleet_manager', 'super_admin')
        )
    );

-- ============================================
-- 8. Helper Functions
-- ============================================

-- Check if vehicle is available for a date range
CREATE OR REPLACE FUNCTION is_vehicle_available(
    p_vehicle_id UUID,
    p_start_datetime TIMESTAMPTZ,
    p_end_datetime TIMESTAMPTZ,
    p_exclude_request_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_vehicle_status VARCHAR;
    v_conflicting_requests INTEGER;
BEGIN
    -- Check vehicle status
    SELECT status INTO v_vehicle_status
    FROM fleet_vehicles
    WHERE id = p_vehicle_id;
    
    IF v_vehicle_status != 'available' THEN
        RETURN FALSE;
    END IF;
    
    -- Check for conflicting bookings
    SELECT COUNT(*) INTO v_conflicting_requests
    FROM trip_requests
    WHERE assigned_vehicle_id = p_vehicle_id
    AND status IN ('approved', 'assigned', 'in_progress')
    AND (id != p_exclude_request_id OR p_exclude_request_id IS NULL)
    AND (
        (start_datetime <= p_end_datetime AND end_datetime >= p_start_datetime)
    );
    
    RETURN v_conflicting_requests = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if driver is available for a date range
CREATE OR REPLACE FUNCTION is_driver_available(
    p_driver_id UUID,
    p_start_datetime TIMESTAMPTZ,
    p_end_datetime TIMESTAMPTZ,
    p_exclude_request_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_driver_active BOOLEAN;
    v_license_valid BOOLEAN;
    v_on_leave BOOLEAN;
    v_conflicting_trips INTEGER;
BEGIN
    -- Check if driver is active and license is valid
    SELECT 
        dp.is_active,
        dp.license_expiry >= CURRENT_DATE
    INTO v_driver_active, v_license_valid
    FROM driver_profiles dp
    WHERE dp.user_id = p_driver_id;
    
    IF NOT v_driver_active OR NOT v_license_valid THEN
        RETURN FALSE;
    END IF;
    
    -- Check if driver is on approved leave
    SELECT EXISTS (
        SELECT 1 FROM leave_requests lr
        WHERE lr.user_id = p_driver_id
        AND lr.status = 'approved'
        AND (
            (lr.start_date <= p_end_datetime::DATE AND lr.end_date >= p_start_datetime::DATE)
        )
    ) INTO v_on_leave;
    
    IF v_on_leave THEN
        RETURN FALSE;
    END IF;
    
    -- Check for conflicting assignments
    SELECT COUNT(*) INTO v_conflicting_trips
    FROM trip_requests
    WHERE assigned_driver_id = p_driver_id
    AND status IN ('assigned', 'in_progress')
    AND (id != p_exclude_request_id OR p_exclude_request_id IS NULL)
    AND (
        (start_datetime <= p_end_datetime AND end_datetime >= p_start_datetime)
    );
    
    RETURN v_conflicting_trips = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if requester is on leave (for blocking requests)
CREATE OR REPLACE FUNCTION is_user_on_leave(
    p_user_id UUID,
    p_date DATE
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM leave_requests
        WHERE user_id = p_user_id
        AND status = 'approved'
        AND start_date <= p_date
        AND end_date >= p_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. Grant permissions
-- ============================================

GRANT ALL ON fleet_vehicles TO authenticated;
GRANT ALL ON driver_profiles TO authenticated;
GRANT ALL ON trip_requests TO authenticated;

-- ============================================
-- 10. Comments for documentation
-- ============================================

COMMENT ON TABLE fleet_vehicles IS 'Company vehicles available for trip booking';
COMMENT ON TABLE driver_profiles IS 'Driver-specific information for users who can drive company vehicles';
COMMENT ON TABLE trip_requests IS 'Requests for vehicle usage, goes through approval and assignment workflow';

COMMENT ON FUNCTION is_vehicle_available IS 'Check if a vehicle is available for booking in a given time range';
COMMENT ON FUNCTION is_driver_available IS 'Check if a driver is available, has valid license, and not on leave';
COMMENT ON FUNCTION is_user_on_leave IS 'Check if a user has approved leave on a specific date';


