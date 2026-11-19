-- Migration 021: Staff card settings table
-- Stores per-card overrides and global card design settings.

CREATE TABLE IF NOT EXISTS staff_card_settings (
  id            SERIAL PRIMARY KEY,
  settings      JSONB NOT NULL DEFAULT '{}',  -- org name, logo URL, accent colour, validity years, etc.
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed one row
INSERT INTO staff_card_settings (id, settings)
VALUES (1, '{
  "org_name": "Football Kenya Federation",
  "org_abbreviation": "FKF",
  "accent_color": "#1d4ed8",
  "validity_years": 2,
  "website": "www.fkf.co.ke",
  "emergency_number": "+254 000 000000"
}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE staff_card_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_card_settings_select" ON staff_card_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('super_admin','hr_admin'))
);
CREATE POLICY "staff_card_settings_update" ON staff_card_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('super_admin','hr_admin'))
);
