-- Update users_profile table to include full_name column and make employee_id optional
-- This allows for more flexible user management

-- Add full_name column
ALTER TABLE users_profile 
ADD COLUMN IF NOT EXISTS full_name VARCHAR(100);

-- Add opening_balance column to leave_balances if not exists
ALTER TABLE leave_balances 
ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(5,1) NOT NULL DEFAULT 0;

-- Update constraint to include opening_balance
ALTER TABLE leave_balances 
DROP CONSTRAINT IF EXISTS chk_opening_non_negative;

ALTER TABLE leave_balances 
ADD CONSTRAINT chk_opening_non_negative CHECK (opening_balance >= 0);

-- Make employee_id optional for easier user creation
ALTER TABLE users_profile 
ALTER COLUMN employee_id DROP NOT NULL;

-- Create or update trigger to populate full_name from first_name + last_name
CREATE OR REPLACE FUNCTION update_full_name()
RETURNS TRIGGER AS $$
BEGIN
  -- If full_name is provided, split into first_name and last_name
  IF NEW.full_name IS NOT NULL AND NEW.full_name != '' THEN
    IF NEW.first_name IS NULL OR NEW.last_name IS NULL THEN
      -- Split full_name into first and last names
      NEW.first_name = SPLIT_PART(NEW.full_name, ' ', 1);
      NEW.last_name = CASE 
        WHEN ARRAY_LENGTH(STRING_TO_ARRAY(NEW.full_name, ' '), 1) > 1 
        THEN TRIM(SUBSTRING(NEW.full_name FROM LENGTH(SPLIT_PART(NEW.full_name, ' ', 1)) + 2))
        ELSE ''
      END;
    END IF;
  -- If first_name and last_name are provided, create full_name
  ELSIF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
    NEW.full_name = NEW.first_name || ' ' || NEW.last_name;
  END IF;
  
  -- Auto-generate employee_id if not provided
  IF NEW.employee_id IS NULL OR NEW.employee_id = '' THEN
    NEW.employee_id = 'FKF' || TO_CHAR(NEW.created_at, 'YYYYMMDD') || '-' ||
                     LPAD(EXTRACT(EPOCH FROM NEW.created_at)::INTEGER % 10000, 4, '0');
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_full_name ON users_profile;
CREATE TRIGGER trigger_update_full_name
  BEFORE INSERT OR UPDATE ON users_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_full_name();

-- Update existing records to have full_name
UPDATE users_profile 
SET full_name = first_name || ' ' || last_name 
WHERE full_name IS NULL AND first_name IS NOT NULL AND last_name IS NOT NULL;

-- Create index on full_name for searching
CREATE INDEX IF NOT EXISTS idx_users_profile_full_name ON users_profile(full_name);

-- Add computed column for available_days in leave_balances view
CREATE OR REPLACE VIEW leave_balances_view AS
SELECT 
  lb.*,
  (lb.opening_balance + lb.annual_allocation - lb.used_days - lb.pending_days) AS available_days,
  up.full_name,
  up.email,
  up.department_id,
  d.name as department_name,
  lt.name as leave_type_name,
  lt.color as leave_type_color
FROM leave_balances lb
JOIN users_profile up ON lb.user_id = up.id
JOIN departments d ON up.department_id = d.id
JOIN leave_types lt ON lb.leave_type_id = lt.id
WHERE up.is_active = true;

-- Grant permissions on the view
GRANT SELECT ON leave_balances_view TO authenticated;