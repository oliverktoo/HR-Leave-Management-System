-- Temporarily set both users to use the same email for testing
-- This allows testing with Resend's free tier

UPDATE users_profile 
SET email = 'oliverktoo@gmail.com'
WHERE email IN ('oliverkiptook@gmail.com', 'oliverktoo@gmail.com');

-- Verify the change
SELECT first_name, last_name, email, role 
FROM users_profile 
WHERE email = 'oliverktoo@gmail.com';
