-- Migration 020: P9 historical imports table
-- Stores prior-year imported P9 data so all authorised users can access it,
-- instead of it being locked to the browser that uploaded it (localStorage).

CREATE TABLE IF NOT EXISTS p9_historical_imports (
  id            SERIAL PRIMARY KEY,
  year          INTEGER NOT NULL UNIQUE,           -- tax year, e.g. 2024
  data          JSONB   NOT NULL DEFAULT '[]',     -- array of AnnualEmployeeSummary
  filename      TEXT,                              -- original CSV filename
  uploaded_by   UUID REFERENCES auth.users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_p9_historical_imports_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p9_historical_imports_updated_at ON p9_historical_imports;
CREATE TRIGGER trg_p9_historical_imports_updated_at
  BEFORE UPDATE ON p9_historical_imports
  FOR EACH ROW EXECUTE FUNCTION update_p9_historical_imports_updated_at();

-- RLS
ALTER TABLE p9_historical_imports ENABLE ROW LEVEL SECURITY;

-- Read: super_admin and hr_admin can view all historical imports
CREATE POLICY "p9_imports_select" ON p9_historical_imports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'hr_admin', 'finance', 'ceo', 'auditor')
    )
  );

-- Insert/Update: only super_admin and hr_admin can upload
CREATE POLICY "p9_imports_upsert" ON p9_historical_imports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'hr_admin', 'finance', 'ceo', 'auditor')
    )
  );

CREATE POLICY "p9_imports_update" ON p9_historical_imports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'hr_admin', 'finance', 'ceo', 'auditor')
    )
  );

-- Delete: only super_admin and hr_admin can clear
CREATE POLICY "p9_imports_delete" ON p9_historical_imports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'hr_admin', 'finance', 'ceo', 'auditor')
    )
  );
