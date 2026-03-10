-- Migration: 001_initial_schema.sql
-- Description: Create core tables for Leave Management System
-- Date: 2025-11-15

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================
-- TABLE: departments
-- ==============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  head_of_department_id UUID, -- Will reference users_profile, added after table creation
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_departments_active ON departments(is_active);

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

CREATE INDEX idx_leave_types_active ON leave_types(is_active);

-- ==============================================
-- TABLE: users_profile
-- ==============================================
CREATE TABLE IF NOT EXISTS users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id VARCHAR(20) UNIQUE NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'employee',
  job_title VARCHAR(100),
  hire_date DATE,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_role CHECK (role IN ('employee', 'hod', 'hr_admin'))
);

CREATE INDEX idx_users_profile_department ON users_profile(department_id);
CREATE INDEX idx_users_profile_role ON users_profile(role);
CREATE INDEX idx_users_profile_active ON users_profile(is_active);
CREATE INDEX idx_users_profile_email ON users_profile(email);

-- Add foreign key for HOD after users_profile is created
ALTER TABLE departments 
ADD CONSTRAINT fk_departments_hod 
FOREIGN KEY (head_of_department_id) 
REFERENCES users_profile(id) ON DELETE SET NULL;

-- ==============================================
-- TABLE: leave_balances
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  annual_allocation DECIMAL(5,1) NOT NULL DEFAULT 0,
  used_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  pending_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  carryforward_days DECIMAL(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_year_valid CHECK (year >= 2020 AND year <= 2100),
  CONSTRAINT chk_allocation_non_negative CHECK (annual_allocation >= 0),
  CONSTRAINT chk_used_non_negative CHECK (used_days >= 0),
  CONSTRAINT chk_pending_non_negative CHECK (pending_days >= 0),
  CONSTRAINT chk_carryforward_non_negative CHECK (carryforward_days >= 0),
  CONSTRAINT uq_user_leave_year UNIQUE (user_id, leave_type_id, year)
);

CREATE INDEX idx_leave_balances_user ON leave_balances(user_id);
CREATE INDEX idx_leave_balances_year ON leave_balances(year);
CREATE INDEX idx_leave_balances_user_year ON leave_balances(user_id, year);

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

CREATE INDEX idx_public_holidays_date ON public_holidays(date);

-- ==============================================
-- TABLE: leave_requests
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days DECIMAL(5,1) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewer_comments TEXT,
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_status CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT chk_dates_valid CHECK (end_date >= start_date),
  CONSTRAINT chk_total_days_positive CHECK (total_days > 0)
);

CREATE INDEX idx_leave_requests_user ON leave_requests(user_id);
CREATE INDEX idx_leave_requests_status ON leave_requests(status);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_reviewer ON leave_requests(reviewed_by);

-- ==============================================
-- TABLE: leave_request_history
-- ==============================================
CREATE TABLE IF NOT EXISTS leave_request_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  performed_by UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT chk_action CHECK (action IN ('submitted', 'pending', 'approved', 'rejected', 'cancelled'))
);

CREATE INDEX idx_leave_history_request ON leave_request_history(leave_request_id);
CREATE INDEX idx_leave_history_performed_by ON leave_request_history(performed_by);

-- ==============================================
-- TABLE: notifications
-- ==============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  related_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ==============================================
-- TABLE: audit_logs
-- ==============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);

-- ==============================================
-- FUNCTION: Update updated_at timestamp
-- ==============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update_updated_at trigger to relevant tables
CREATE TRIGGER trg_departments_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leave_types_updated_at
BEFORE UPDATE ON leave_types
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_users_profile_updated_at
BEFORE UPDATE ON users_profile
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leave_balances_updated_at
BEFORE UPDATE ON leave_balances
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_leave_requests_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_public_holidays_updated_at
BEFORE UPDATE ON public_holidays
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
