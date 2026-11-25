-- Migration 083: Staff cards show www.footballkenya.org (was www.fkf.co.ke)
-- Only replaces the old default; a website HR has set to something else is left alone.
UPDATE public.staff_card_settings
SET settings = jsonb_set(settings, '{website}', '"www.footballkenya.org"'), updated_at = now()
WHERE settings->>'website' IN ('www.fkf.co.ke', 'fkf.co.ke', 'https://www.fkf.co.ke');

SELECT id, settings->>'website' AS website FROM public.staff_card_settings;
