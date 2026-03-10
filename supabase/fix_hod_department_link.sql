-- Fix HOD department link
-- This updates the departments table to set head_of_department_id for Oliver's Infrastructure department

-- First, check current state
SELECT 
    d.id as department_id,
    d.name as department_name,
    d.head_of_department_id,
    up.email as hod_email,
    up.first_name || ' ' || up.last_name as hod_name
FROM departments d
LEFT JOIN users_profile up ON d.head_of_department_id = up.id
WHERE d.id = '00000000-0000-0000-0000-000000000002';

-- Update Infrastructure department to link to Oliver as HOD
UPDATE departments
SET head_of_department_id = '6c0e92ce-91a0-41de-8f95-75c80d5021b4'
WHERE id = '00000000-0000-0000-0000-000000000002'
  AND name = 'Infrastructure';

-- Verify the update
SELECT 
    d.id as department_id,
    d.name as department_name,
    d.head_of_department_id,
    up.email as hod_email,
    up.first_name || ' ' || up.last_name as hod_name,
    up.role as hod_role
FROM departments d
LEFT JOIN users_profile up ON d.head_of_department_id = up.id
WHERE d.id = '00000000-0000-0000-0000-000000000002';

-- Show all departments and their HODs
SELECT 
    d.id as department_id,
    d.name as department_name,
    d.head_of_department_id,
    up.email as hod_email,
    up.first_name || ' ' || up.last_name as hod_name,
    up.role
FROM departments d
LEFT JOIN users_profile up ON d.head_of_department_id = up.id
ORDER BY d.name;
