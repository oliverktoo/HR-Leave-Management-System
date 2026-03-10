-- ================================================
-- DISABLE EMAIL CONFIRMATION FOR NEW USERS
-- ================================================
-- This ensures users can login immediately without email verification
-- Run this in Supabase SQL Editor

-- Note: This script confirms existing unconfirmed users
-- For project-wide settings, you MUST also update Supabase Dashboard settings

-- 1. Auto-confirm all existing unconfirmed users
UPDATE auth.users
SET 
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email_confirmed_at IS NULL;

-- Get count of confirmed users
DO $$
DECLARE
    v_confirmed_count integer;
BEGIN
    SELECT COUNT(*) INTO v_confirmed_count
    FROM auth.users
    WHERE email_confirmed_at IS NOT NULL;
    
    RAISE NOTICE '✅ All users confirmed!';
    RAISE NOTICE 'Total confirmed users: %', v_confirmed_count;
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'IMPORTANT: Update Supabase Dashboard Settings';
    RAISE NOTICE '========================================';
    RAISE NOTICE '1. Go to: Authentication → Settings';
    RAISE NOTICE '2. Scroll to "Email Auth"';
    RAISE NOTICE '3. DISABLE "Enable email confirmations"';
    RAISE NOTICE '4. Click "Save"';
    RAISE NOTICE '';
    RAISE NOTICE 'This ensures NEW users are auto-confirmed';
    RAISE NOTICE '========================================';
END $$;

-- Verify all users are confirmed
SELECT 
    '✅ User Status' as info,
    email,
    email_confirmed_at IS NOT NULL as confirmed,
    is_sso_user,
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;
