-- Migration 039: Internal Announcements / Communications
-- HR can post org-wide or department-targeted announcements

CREATE TABLE IF NOT EXISTS public.announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  target       TEXT NOT NULL DEFAULT 'all'
                 CHECK (target IN ('all', 'department', 'role')),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  target_role  TEXT,
  is_pinned    BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  expires_at   TIMESTAMPTZ,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active   ON public.announcements(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_dept     ON public.announcements(department_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created  ON public.announcements(created_by);

-- Track which users have acknowledged/read each announcement
CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_reads_user ON public.announcement_reads(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.announcements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads  ENABLE ROW LEVEL SECURITY;

-- HR admin / super_admin full access on announcements
CREATE POLICY "hr_manage_announcements" ON public.announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Any authenticated user can read active announcements that target them
CREATE POLICY "staff_read_announcements" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (
      target = 'all'
      OR (
        target = 'department'
        AND department_id = (
          SELECT department_id FROM public.users_profile WHERE id = auth.uid()
        )
      )
      OR (
        target = 'role'
        AND target_role = (
          SELECT role FROM public.users_profile WHERE id = auth.uid()
        )
      )
    )
  );

-- Users manage their own reads
CREATE POLICY "staff_own_reads" ON public.announcement_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- HR can see read stats
CREATE POLICY "hr_view_reads" ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );
