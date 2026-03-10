-- SIMPLE SUPER ADMIN SETUP (No Leave Balances)
-- Just copy and paste this entire block into Supabase SQL Editor and click RUN

-- First fix the audit trigger issue
CREATE OR REPLACE FUNCTION log_audit()
RETURNS TRIGGER AS $$
DECLARE
    user_id_value uuid;
BEGIN
    -- Determine the user ID based on the table and available columns
    CASE TG_TABLE_NAME
        WHEN 'users_profile' THEN
            user_id_value := COALESCE(NEW.id, OLD.id, auth.uid());
        ELSE
            user_id_value := COALESCE(NEW.user_id, OLD.user_id, auth.uid());
    END CASE;

    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        user_id
    ) VALUES (
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        TG_OP,
        CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        user_id_value
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create super admin profile only
DO $$
DECLARE
    v_user_id uuid := 'a16fcdb3-7af0-4885-901a-93630290141c';
    v_hr_dept_id uuid;
BEGIN
    -- Using existing user ID
    RAISE NOTICE 'Using existing user: %', v_user_id;
    
    -- Get or create HR department
    SELECT id INTO v_hr_dept_id FROM departments WHERE name = 'Human Resources' LIMIT 1;
    
    IF v_hr_dept_id IS NULL THEN
        INSERT INTO departments (name, head_of_department_id) VALUES ('Human Resources', v_user_id) RETURNING id INTO v_hr_dept_id;
        RAISE NOTICE 'Created HR department';
    END IF;
    
    -- Create profile
    INSERT INTO users_profile (id, email, first_name, last_name, role, department_id, employee_id, hire_date, is_active)
    VALUES (v_user_id, 'oliverkiptook@gmail.com', 'Oliver', 'Kiptook', 'hr_admin', v_hr_dept_id, 'EMP-ADMIN-001', CURRENT_DATE, true)
    ON CONFLICT (id) DO UPDATE SET role = 'hr_admin', is_active = true;
    
    RAISE NOTICE 'Profile created';
    
    RAISE NOTICE '✅ SUPER ADMIN SETUP COMPLETE!';
    RAISE NOTICE 'Login at: http://localhost:5177/';
    RAISE NOTICE 'Email: oliverkiptook@gmail.com';
    RAISE NOTICE 'Role: HR Admin';
    RAISE NOTICE 'Note: Leave balances can be added later';
END $$;

-- Verify setup
SELECT 'Super Admin Account' as info, email, first_name || ' ' || last_name as name, role, employee_id, is_active 
FROM users_profile 
WHERE email = 'oliverkiptook@gmail.com';

-- Check if HR department exists
SELECT 'HR Department' as info, name, head_of_department_id 
FROM departments 
WHERE name = 'Human Resources';