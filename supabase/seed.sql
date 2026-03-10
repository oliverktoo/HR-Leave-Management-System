-- Seed Data for Leave Management System
-- This file contains initial data for development and testing

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

-- Insert Public Holidays for 2025 (Kenya Example)
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

-- Note: User profiles, leave balances, and requests should be created through the application
-- as they require proper authentication and trigger execution
