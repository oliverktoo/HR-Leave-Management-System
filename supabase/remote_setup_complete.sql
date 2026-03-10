-- Complete Remote Supabase Setup Script
-- Copy and paste this entire script into your Supabase SQL Editor
-- This will set up all tables, data, and admin user

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- TABLE: departments
-- ==============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  head_of_department_id UUID,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

-- ==============================================
-- TABLE: leave_types
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  max_days_per_year INTEGER NOT NULL,
  requires_documentation BOOLEAN DEFAULT false,
  min_notice_days INTEGER DEFAULT 0,
  max_consecutive_days INTEGER,
  allow_carryforward BOOLEAN DEFAULT false,
  max_carryforward_days INTEGER DEFAULT 0,
  color_code VARCHAR(7) DEFAULT '#4F46E5',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_max_days_positive CHECK (max_days_per_year > 0),
  CONSTRAINT chk_notice_days_non_negative CHECK (min_notice_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_types_active ON leave_types(is_active);

-- ==============================================
-- TABLE: users_profile
-- ==============================================
CREATE TABLE IF NOT EXISTS users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  phone VARCHAR(20),
  department_id UUID REFERENCES departments(id),
  job_title VARCHAR(100),
  role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('employee', 'hod', 'hr_admin')),
  hire_date DATE,
  supervisor_id UUID REFERENCES users_profile(id),
  is_active BOOLEAN DEFAULT true,
  profile_picture_url TEXT,
  emergency_contact_name VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  address TEXT,
  date_of_birth DATE,
  national_id VARCHAR(20),
  bank_account_number VARCHAR(30),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_profile_department ON users_profile(department_id);
CREATE INDEX IF NOT EXISTS idx_users_profile_role ON users_profile(role);
CREATE INDEX IF NOT EXISTS idx_users_profile_active ON users_profile(is_active);
CREATE INDEX IF NOT EXISTS idx_users_profile_employee_id ON users_profile(employee_id);

-- ==============================================
-- TABLE: public_holidays
-- ==============================================
CREATE TABLE IF NOT EXISTS public_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_recurring BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(date);

-- ==============================================
-- TABLE: leave_balances
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  allocated_days DECIMAL(4,1) DEFAULT 0,
  used_days DECIMAL(4,1) DEFAULT 0,
  pending_days DECIMAL(4,1) DEFAULT 0,
  carried_forward_days DECIMAL(4,1) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, leave_type_id, year),
  CONSTRAINT chk_allocated_days_non_negative CHECK (allocated_days >= 0),
  CONSTRAINT chk_used_days_non_negative CHECK (used_days >= 0),
  CONSTRAINT chk_pending_days_non_negative CHECK (pending_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_user ON leave_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balances_year ON leave_balances(year);

-- ==============================================
-- TABLE: leave_requests
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested DECIMAL(4,1) NOT NULL,
  reason TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approved_by UUID REFERENCES users_profile(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  emergency_contact VARCHAR(100),
  emergency_phone VARCHAR(20),
  handover_notes TEXT,
  documentation_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_dates_valid CHECK (start_date <= end_date),
  CONSTRAINT chk_days_positive CHECK (days_requested > 0)
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);

-- ==============================================
-- TABLE: leave_request_audit
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_request_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_by UUID REFERENCES users_profile(id),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_leave_request_audit_request ON leave_request_audit(leave_request_id);
CREATE INDEX IF NOT EXISTS idx_leave_request_audit_action ON leave_request_audit(action);

-- ==============================================
-- TRIGGERS FOR UPDATED_AT
-- ==============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
DROP TRIGGER IF EXISTS update_departments_updated_at ON departments;
CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_types_updated_at ON leave_types;
CREATE TRIGGER update_leave_types_updated_at
    BEFORE UPDATE ON leave_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_users_profile_updated_at ON users_profile;
CREATE TRIGGER update_users_profile_updated_at
    BEFORE UPDATE ON users_profile
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_public_holidays_updated_at ON public_holidays;
CREATE TRIGGER update_public_holidays_updated_at
    BEFORE UPDATE ON public_holidays
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_balances_updated_at ON leave_balances;
CREATE TRIGGER update_leave_balances_updated_at
    BEFORE UPDATE ON leave_balances
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON leave_requests;
CREATE TRIGGER update_leave_requests_updated_at
    BEFORE UPDATE ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- AUDIT TRIGGER FOR LEAVE REQUESTS
-- ==============================================
CREATE OR REPLACE FUNCTION audit_leave_request_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert audit record for updates
    IF TG_OP = 'UPDATE' THEN
        INSERT INTO leave_request_audit (
            leave_request_id, 
            action, 
            old_values, 
            new_values,
            changed_by,
            notes
        ) VALUES (
            NEW.id,
            'UPDATE',
            to_jsonb(OLD),
            to_jsonb(NEW),
            NEW.approved_by,
            CASE 
                WHEN OLD.status != NEW.status THEN 'Status changed from ' || OLD.status || ' to ' || NEW.status
                ELSE 'Record updated'
            END
        );
        RETURN NEW;
    END IF;

    -- Insert audit record for inserts
    IF TG_OP = 'INSERT' THEN
        INSERT INTO leave_request_audit (
            leave_request_id, 
            action, 
            new_values,
            changed_by,
            notes
        ) VALUES (
            NEW.id,
            'INSERT',
            to_jsonb(NEW),
            NEW.user_id,
            'Leave request created'
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_leave_requests ON leave_requests;
CREATE TRIGGER audit_leave_requests
    AFTER INSERT OR UPDATE ON leave_requests
    FOR EACH ROW
    EXECUTE FUNCTION audit_leave_request_changes();

-- ==============================================
-- ROW LEVEL SECURITY POLICIES
-- ==============================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_request_audit ENABLE ROW LEVEL SECURITY;

-- Users can view their own profile and profiles in their department
DROP POLICY IF EXISTS "users_profile_select_policy" ON users_profile;
CREATE POLICY "users_profile_select_policy" ON users_profile
    FOR SELECT USING (
        auth.uid() = id 
        OR auth.jwt() ->> 'role' = 'hr_admin'
        OR (
            auth.jwt() ->> 'role' = 'hod' 
            AND department_id IN (
                SELECT department_id FROM users_profile WHERE id = auth.uid()
            )
        )
    );

-- Users can update their own profile, HR admins can update any
DROP POLICY IF EXISTS "users_profile_update_policy" ON users_profile;
CREATE POLICY "users_profile_update_policy" ON users_profile
    FOR UPDATE USING (
        auth.uid() = id 
        OR auth.jwt() ->> 'role' = 'hr_admin'
    );

-- HR admins can insert new users
DROP POLICY IF EXISTS "users_profile_insert_policy" ON users_profile;
CREATE POLICY "users_profile_insert_policy" ON users_profile
    FOR INSERT WITH CHECK (auth.jwt() ->> 'role' = 'hr_admin');

-- Leave requests policies
DROP POLICY IF EXISTS "leave_requests_select_policy" ON leave_requests;
CREATE POLICY "leave_requests_select_policy" ON leave_requests
    FOR SELECT USING (
        auth.uid() = user_id
        OR auth.jwt() ->> 'role' = 'hr_admin'
        OR (
            auth.jwt() ->> 'role' = 'hod' 
            AND user_id IN (
                SELECT id FROM users_profile 
                WHERE department_id IN (
                    SELECT department_id FROM users_profile WHERE id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "leave_requests_insert_policy" ON leave_requests;
CREATE POLICY "leave_requests_insert_policy" ON leave_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "leave_requests_update_policy" ON leave_requests;
CREATE POLICY "leave_requests_update_policy" ON leave_requests
    FOR UPDATE USING (
        auth.uid() = user_id
        OR auth.jwt() ->> 'role' = 'hr_admin'
        OR (
            auth.jwt() ->> 'role' = 'hod' 
            AND user_id IN (
                SELECT id FROM users_profile 
                WHERE department_id IN (
                    SELECT department_id FROM users_profile WHERE id = auth.uid()
                )
            )
        )
    );

-- Leave balances policies
DROP POLICY IF EXISTS "leave_balances_select_policy" ON leave_balances;
CREATE POLICY "leave_balances_select_policy" ON leave_balances
    FOR SELECT USING (
        auth.uid() = user_id
        OR auth.jwt() ->> 'role' = 'hr_admin'
        OR (
            auth.jwt() ->> 'role' = 'hod' 
            AND user_id IN (
                SELECT id FROM users_profile 
                WHERE department_id IN (
                    SELECT department_id FROM users_profile WHERE id = auth.uid()
                )
            )
        )
    );

-- Admin-only policies for system tables
DROP POLICY IF EXISTS "departments_policy" ON departments;
CREATE POLICY "departments_policy" ON departments
    FOR ALL USING (auth.jwt() ->> 'role' = 'hr_admin');

DROP POLICY IF EXISTS "leave_types_select_policy" ON leave_types;
CREATE POLICY "leave_types_select_policy" ON leave_types
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "leave_types_modify_policy" ON leave_types;
CREATE POLICY "leave_types_modify_policy" ON leave_types
    FOR ALL USING (auth.jwt() ->> 'role' = 'hr_admin');

DROP POLICY IF EXISTS "public_holidays_select_policy" ON public_holidays;
CREATE POLICY "public_holidays_select_policy" ON public_holidays
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "public_holidays_modify_policy" ON public_holidays;
CREATE POLICY "public_holidays_modify_policy" ON public_holidays
    FOR ALL USING (auth.jwt() ->> 'role' = 'hr_admin');

-- ==============================================
-- SEED DATA
-- ==============================================

-- Insert Departments
INSERT INTO departments (id, name, description, is_active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Human Resources', 'HR Department managing employee relations', true),
  ('00000000-0000-0000-0000-000000000002', 'IT', 'Information Technology Department', true),
  ('00000000-0000-0000-0000-000000000003', 'Finance', 'Finance and Accounting Department', true),
  ('00000000-0000-0000-0000-000000000004', 'Operations', 'Operations and Logistics Department', true),
  ('00000000-0000-0000-0000-000000000005', 'Marketing', 'Marketing and Communications Department', true)
ON CONFLICT (id) DO NOTHING;

-- Insert Leave Types
INSERT INTO leave_types (id, name, description, max_days_per_year, requires_documentation, min_notice_days, max_consecutive_days, allow_carryforward, max_carryforward_days, color_code, is_active) VALUES
  ('00000000-0000-0000-0000-000000000011', 'Annual Leave', 'Regular annual vacation leave', 21, false, 7, 14, true, 5, '#4F46E5', true),
  ('00000000-0000-0000-0000-000000000012', 'Sick Leave', 'Leave for illness or medical appointments', 14, true, 0, 7, false, 0, '#EF4444', true),
  ('00000000-0000-0000-0000-000000000013', 'Maternity Leave', 'Maternity leave for new mothers', 90, true, 30, 90, false, 0, '#EC4899', true),
  ('00000000-0000-0000-0000-000000000014', 'Paternity Leave', 'Paternity leave for new fathers', 10, true, 14, 10, false, 0, '#3B82F6', true),
  ('00000000-0000-0000-0000-000000000015', 'Compassionate Leave', 'Leave for family emergencies or bereavement', 5, true, 0, 5, false, 0, '#6B7280', true),
  ('00000000-0000-0000-0000-000000000016', 'Study Leave', 'Leave for educational purposes', 10, true, 30, 10, false, 0, '#10B981', true)
ON CONFLICT (id) DO NOTHING;

-- Insert Public Holidays for 2025
INSERT INTO public_holidays (date, name, description, is_recurring) VALUES
  ('2025-01-01', 'New Year''s Day', 'New Year celebration', true),
  ('2025-04-18', 'Good Friday', 'Christian holiday', false),
  ('2025-04-21', 'Easter Monday', 'Christian holiday', false),
  ('2025-05-01', 'Labour Day', 'International Workers'' Day', true),
  ('2025-06-01', 'Madaraka Day', 'Self-governance celebration', true),
  ('2025-10-10', 'Huduma Day', 'Public service day', true),
  ('2025-10-20', 'Mashujaa Day', 'Heroes'' Day', true),
  ('2025-12-12', 'Jamhuri Day', 'Independence Day', true),
  ('2025-12-25', 'Christmas Day', 'Christian holiday', true),
  ('2025-12-26', 'Boxing Day', 'Day after Christmas', true)
ON CONFLICT (date) DO NOTHING;

-- ==============================================
-- CREATE ADMIN USER
-- ==============================================

-- Create admin auth user (you'll need to do this manually in Supabase Auth)
-- Email: admin@fkf.com
-- Password: Admin123!@#

-- First, you need to create the auth user manually in Supabase Dashboard
-- Then run this to create the profile:

-- Create admin user profile (run this after creating the auth user)
-- Replace 'YOUR_AUTH_USER_ID' with the actual UUID from auth.users
/*
INSERT INTO users_profile (
    id,
    employee_id,
    email,
    first_name,
    last_name,
    department_id,
    job_title,
    role,
    hire_date,
    is_active
) VALUES (
    'YOUR_AUTH_USER_ID', -- Replace with actual auth.users ID
    'EMP001',
    'admin@fkf.com',
    'System',
    'Administrator',
    '00000000-0000-0000-0000-000000000001',
    'HR Administrator',
    'hr_admin',
    '2024-01-01',
    true
);
*/

-- ==============================================
-- HELPER FUNCTIONS
-- ==============================================

-- Drop existing function if it exists and recreate
DROP FUNCTION IF EXISTS calculate_working_days(date, date);

-- Function to calculate working days between dates
CREATE OR REPLACE FUNCTION calculate_working_days(start_date DATE, end_date DATE)
RETURNS INTEGER AS $$
DECLARE
    working_days INTEGER := 0;
    current_date DATE := start_date;
BEGIN
    WHILE current_date <= end_date LOOP
        -- Skip weekends (Saturday = 6, Sunday = 0)
        IF EXTRACT(DOW FROM current_date) NOT IN (0, 6) THEN
            -- Skip public holidays
            IF NOT EXISTS (SELECT 1 FROM public_holidays WHERE date = current_date) THEN
                working_days := working_days + 1;
            END IF;
        END IF;
        current_date := current_date + 1;
    END LOOP;
    
    RETURN working_days;
END;
$$ LANGUAGE plpgsql;

-- Drop existing function if it exists and recreate
DROP FUNCTION IF EXISTS get_leave_balance(uuid, uuid, integer);

-- Function to get user's remaining leave balance
CREATE OR REPLACE FUNCTION get_leave_balance(p_user_id UUID, p_leave_type_id UUID, p_year INTEGER)
RETURNS DECIMAL AS $$
DECLARE
    balance DECIMAL;
BEGIN
    SELECT 
        COALESCE(allocated_days, 0) + COALESCE(carried_forward_days, 0) - COALESCE(used_days, 0) - COALESCE(pending_days, 0)
    INTO balance
    FROM leave_balances 
    WHERE user_id = p_user_id 
    AND leave_type_id = p_leave_type_id 
    AND year = p_year;
    
    RETURN COALESCE(balance, 0);
END;
$$ LANGUAGE plpgsql;

-- ==============================================
-- COMPLETION MESSAGE
-- ==============================================
DO $$
BEGIN
    RAISE NOTICE 'Database setup completed successfully!';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Go to Authentication > Users in your Supabase dashboard';
    RAISE NOTICE '2. Create a new user with email: admin@fkf.com';
    RAISE NOTICE '3. Copy the user ID and update the users_profile table';
    RAISE NOTICE '4. Your application should now be ready to use!';
END $$;