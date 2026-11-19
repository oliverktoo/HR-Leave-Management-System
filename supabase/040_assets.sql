-- Migration 040: Asset Management
-- Track org assets (laptops, phones, keys, etc.) issued to employees

CREATE TABLE IF NOT EXISTS public.assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag     TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL
                  CHECK (category IN (
                    'laptop', 'phone', 'tablet', 'vehicle_key',
                    'access_card', 'uniform', 'equipment', 'furniture', 'other'
                  )),
  make          TEXT,
  model         TEXT,
  serial_number TEXT,
  status        TEXT NOT NULL DEFAULT 'available'
                  CHECK (status IN ('available', 'assigned', 'maintenance', 'disposed', 'lost')),
  purchase_date DATE,
  purchase_cost NUMERIC(12,2),
  notes         TEXT,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_status   ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category ON public.assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_tag      ON public.assets(asset_tag);

CREATE TABLE IF NOT EXISTS public.asset_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id            UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by         UUID NOT NULL REFERENCES auth.users(id),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at         TIMESTAMPTZ,
  condition_on_issue  TEXT NOT NULL DEFAULT 'good'
                        CHECK (condition_on_issue IN ('new', 'good', 'fair', 'poor')),
  condition_on_return TEXT
                        CHECK (condition_on_return IN ('good', 'fair', 'poor', 'damaged', 'lost')),
  notes               TEXT,
  return_notes        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_assign_asset ON public.asset_assignments(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_assign_user  ON public.asset_assignments(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_assets" ON public.assets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

CREATE POLICY "hr_manage_assignments" ON public.asset_assignments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid() AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Staff can see assets assigned to them
CREATE POLICY "staff_own_assignments" ON public.asset_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
