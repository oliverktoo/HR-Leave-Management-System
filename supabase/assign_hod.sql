-- Quick fix to assign Oliver as Head of HR Department
-- Run this to complete the setup

UPDATE departments 
SET head_of_department_id = 'a16fcdb3-7af0-4885-901a-93630290141c'
WHERE name = 'Human Resources';

-- Verify the update
SELECT 
    'Updated HR Department' as info, 
    name, 
    head_of_department_id,
    CASE 
        WHEN head_of_department_id = 'a16fcdb3-7af0-4885-901a-93630290141c' THEN '✅ Oliver assigned as HOD'
        ELSE '❌ Not assigned'
    END as status
FROM departments 
WHERE name = 'Human Resources';

-- Verify complete admin setup
SELECT 
    'Complete Admin Setup' as info,
    up.email,
    up.first_name || ' ' || up.last_name as full_name,
    up.role,
    d.name as department,
    CASE 
        WHEN d.head_of_department_id = up.id THEN '✅ HOD of ' || d.name
        ELSE '❌ Not HOD'
    END as hod_status
FROM users_profile up
LEFT JOIN departments d ON up.department_id = d.id
WHERE up.email = 'oliverkiptook@gmail.com';