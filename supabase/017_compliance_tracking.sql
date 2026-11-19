-- Migration 017: Compliance Tracking System
-- Phase 3: Operations & Compliance
-- Adds license tracking, vehicle documents, and compliance monitoring
-- Date: March 14, 2026

-- ============================================
-- 1. Driver License Tracking
-- ============================================

-- Extend driver_profiles with license information
ALTER TABLE users_profile
ADD COLUMN IF NOT EXISTS license_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS license_type VARCHAR(20) CHECK (license_type IN ('class_a', 'class_b', 'class_c', 'class_d', 'class_e')),
ADD COLUMN IF NOT EXISTS license_issue_date DATE,
ADD COLUMN IF NOT EXISTS license_expiry_date DATE,
ADD COLUMN IF NOT EXISTS license_issuing_authority VARCHAR(100),
ADD COLUMN IF NOT EXISTS license_status VARCHAR(20) DEFAULT 'active' CHECK (license_status IN ('active', 'expired', 'suspended', 'revoked')),
ADD COLUMN IF NOT EXISTS license_document_url TEXT,
ADD COLUMN IF NOT EXISTS license_last_verified DATE,
ADD COLUMN IF NOT EXISTS license_notes TEXT;

-- Add index for license expiry queries
CREATE INDEX IF NOT EXISTS idx_users_profile_license_expiry ON users_profile(license_expiry_date) WHERE role = 'driver';

-- ============================================
-- 2. Vehicle Documents Table
-- ============================================

CREATE TABLE IF NOT EXISTS vehicle_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES fleet_vehicles(id) ON DELETE CASCADE,

    -- Document Details
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
        'registration', 'insurance', 'road_tax', 'fitness_certificate',
        'pollution_certificate', 'permit', 'authorization', 'other'
    )),
    document_number VARCHAR(100),
    issue_date DATE,
    expiry_date DATE NOT NULL,
    issuing_authority VARCHAR(100),
    document_status VARCHAR(20) DEFAULT 'active' CHECK (document_status IN ('active', 'expired', 'pending_renewal')),

    -- File Storage
    document_url TEXT,
    document_filename VARCHAR(255),

    -- Audit
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    verified_by UUID REFERENCES auth.users(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for document queries
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_expiry ON vehicle_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_type ON vehicle_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_status ON vehicle_documents(document_status);

-- ============================================
-- 3. Compliance Alerts Table
-- ============================================

CREATE TABLE IF NOT EXISTS compliance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Alert Details
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN (
        'license_expiry', 'vehicle_document_expiry', 'maintenance_due',
        'insurance_expiry', 'registration_expiry', 'service_overdue'
    )),
    alert_priority VARCHAR(20) DEFAULT 'medium' CHECK (alert_priority IN ('low', 'medium', 'high', 'critical')),

    -- Related Entities
    vehicle_id UUID REFERENCES fleet_vehicles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES vehicle_documents(id) ON DELETE CASCADE,
    maintenance_record_id UUID REFERENCES maintenance_records(id) ON DELETE CASCADE,

    -- Alert Content
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_date DATE,
    days_until_due INTEGER,

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'dismissed')),
    acknowledged_by UUID REFERENCES auth.users(id),
    acknowledged_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Auto-generation
    is_auto_generated BOOLEAN DEFAULT true,
    last_checked_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for alert queries
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_type ON compliance_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_priority ON compliance_alerts(alert_priority);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_status ON compliance_alerts(status);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_due_date ON compliance_alerts(due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_vehicle ON compliance_alerts(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_driver ON compliance_alerts(driver_id);

-- ============================================
-- 4. RLS Policies
-- ============================================

-- Vehicle Documents Policies
DROP POLICY IF EXISTS "Fleet managers and admins can manage vehicle documents" ON vehicle_documents;
CREATE POLICY "Fleet managers and admins can manage vehicle documents"
ON vehicle_documents
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('fleet_manager', 'hr_admin', 'super_admin')
  )
);

-- Compliance Alerts Policies
DROP POLICY IF EXISTS "Fleet managers and admins can manage compliance alerts" ON compliance_alerts;
CREATE POLICY "Fleet managers and admins can manage compliance alerts"
ON compliance_alerts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('fleet_manager', 'hr_admin', 'super_admin')
  )
);

-- Driver license data access (drivers can view their own, admins can view all)
DROP POLICY IF EXISTS "Users can view their own license data" ON users_profile;
CREATE POLICY "Users can view their own license data"
ON users_profile
FOR SELECT
TO authenticated
USING (
  id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM users_profile up
    WHERE up.id = auth.uid()
    AND up.role IN ('fleet_manager', 'hr_admin', 'super_admin')
  )
);

DROP POLICY IF EXISTS "Admins can update license data" ON users_profile;
CREATE POLICY "Admins can update license data"
ON users_profile
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('fleet_manager', 'hr_admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_profile
    WHERE users_profile.id = auth.uid()
    AND users_profile.role IN ('fleet_manager', 'hr_admin', 'super_admin')
  )
);

-- ============================================
-- 5. Helper Functions
-- ============================================

-- Function to check for expiring documents and create alerts
CREATE OR REPLACE FUNCTION check_document_expiry_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    doc_record RECORD;
BEGIN
    -- Check vehicle documents expiring in next 30 days
    FOR doc_record IN
        SELECT id, vehicle_id, document_type, expiry_date,
               EXTRACT(DAY FROM expiry_date - CURRENT_DATE) as days_until_expiry
        FROM vehicle_documents
        WHERE document_status = 'active'
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND NOT EXISTS (
            SELECT 1 FROM compliance_alerts ca
            WHERE ca.document_id = vehicle_documents.id
            AND ca.alert_type = 'vehicle_document_expiry'
            AND ca.status IN ('active', 'acknowledged')
        )
    LOOP
        INSERT INTO compliance_alerts (
            alert_type, alert_priority, vehicle_id, document_id,
            title, description, due_date, days_until_due
        ) VALUES (
            'vehicle_document_expiry',
            CASE
                WHEN doc_record.days_until_expiry <= 7 THEN 'critical'
                WHEN doc_record.days_until_expiry <= 14 THEN 'high'
                ELSE 'medium'
            END,
            doc_record.vehicle_id, doc_record.id,
            UPPER(doc_record.document_type) || ' Expiring Soon',
            doc_record.document_type || ' expires on ' || doc_record.expiry_date,
            doc_record.expiry_date, doc_record.days_until_expiry
        );
        alert_count := alert_count + 1;
    END LOOP;

    RETURN alert_count;
END;
$$;

-- Function to check for expiring driver licenses
CREATE OR REPLACE FUNCTION check_license_expiry_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    alert_count INTEGER := 0;
    driver_record RECORD;
BEGIN
    -- Check driver licenses expiring in next 30 days
    FOR driver_record IN
        SELECT id, license_expiry_date,
               EXTRACT(DAY FROM license_expiry_date - CURRENT_DATE) as days_until_expiry
        FROM users_profile
        WHERE role = 'driver'
        AND license_status = 'active'
        AND license_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        AND NOT EXISTS (
            SELECT 1 FROM compliance_alerts ca
            WHERE ca.driver_id = users_profile.id
            AND ca.alert_type = 'license_expiry'
            AND ca.status IN ('active', 'acknowledged')
        )
    LOOP
        INSERT INTO compliance_alerts (
            alert_type, alert_priority, driver_id,
            title, description, due_date, days_until_due
        ) VALUES (
            'license_expiry',
            CASE
                WHEN driver_record.days_until_expiry <= 7 THEN 'critical'
                WHEN driver_record.days_until_expiry <= 14 THEN 'high'
                ELSE 'medium'
            END,
            driver_record.id,
            'Driver License Expiring Soon',
            'Driver license expires on ' || driver_record.license_expiry_date,
            driver_record.license_expiry_date, driver_record.days_until_expiry
        );
        alert_count := alert_count + 1;
    END LOOP;

    RETURN alert_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION check_document_expiry_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION check_license_expiry_alerts() TO authenticated;

-- ============================================
-- 6. Triggers for Automatic Alert Updates
-- ============================================

-- Trigger to update compliance alerts when documents are updated
CREATE OR REPLACE FUNCTION update_compliance_alerts_on_document_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update existing alerts for this document
    UPDATE compliance_alerts
    SET
        due_date = NEW.expiry_date,
        days_until_due = EXTRACT(DAY FROM NEW.expiry_date - CURRENT_DATE),
        alert_priority = CASE
            WHEN EXTRACT(DAY FROM NEW.expiry_date - CURRENT_DATE) <= 7 THEN 'critical'
            WHEN EXTRACT(DAY FROM NEW.expiry_date - CURRENT_DATE) <= 14 THEN 'high'
            ELSE 'medium'
        END,
        last_checked_at = NOW()
    WHERE document_id = NEW.id
    AND status IN ('active', 'acknowledged');

    -- Mark alerts as resolved if document is no longer expiring soon
    UPDATE compliance_alerts
    SET
        status = 'resolved',
        resolved_at = NOW(),
        resolution_notes = 'Document renewed or updated'
    WHERE document_id = NEW.id
    AND status IN ('active', 'acknowledged')
    AND NEW.expiry_date > CURRENT_DATE + INTERVAL '30 days';

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_compliance_alerts_on_document_change
    AFTER UPDATE ON vehicle_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_compliance_alerts_on_document_change();

-- ============================================
-- 7. Sample Data (Optional - for testing)
-- ============================================

-- Insert sample vehicle documents for testing (uncomment if needed)
-- INSERT INTO vehicle_documents (
--     vehicle_id, document_type, document_number, expiry_date, issuing_authority
-- ) VALUES (
--     (SELECT id FROM fleet_vehicles LIMIT 1),
--     'insurance', 'INS123456', CURRENT_DATE + INTERVAL '25 days', 'Insurance Company Ltd'
-- );

COMMENT ON TABLE vehicle_documents IS 'Stores vehicle compliance documents (insurance, registration, etc.)';
COMMENT ON TABLE compliance_alerts IS 'Tracks compliance alerts for licenses, documents, and maintenance';
COMMENT ON FUNCTION check_document_expiry_alerts() IS 'Checks for expiring vehicle documents and creates alerts';
COMMENT ON FUNCTION check_license_expiry_alerts() IS 'Checks for expiring driver licenses and creates alerts';