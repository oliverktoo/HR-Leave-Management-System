-- Fix for audit log trigger error
-- Run this to fix the log_audit function

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