-- Migration 045: Training & Development Records

-- Training course catalog (global, managed by HR)
CREATE TABLE IF NOT EXISTS public.training_courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  provider      TEXT,
  category      TEXT NOT NULL DEFAULT 'general'
                  CHECK (category IN ('technical','soft_skills','compliance','leadership','health_safety','it','finance','general','other')),
  duration_hours NUMERIC(5,2),
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-employee training records (can be catalog course or external course)
CREATE TABLE IF NOT EXISTS public.employee_training (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.training_courses(id) ON DELETE SET NULL,
  course_title    TEXT NOT NULL,           -- copy or override for external courses
  provider        TEXT,
  training_date   DATE NOT NULL,
  completion_date DATE,
  status          TEXT NOT NULL DEFAULT 'enrolled'
                    CHECK (status IN ('enrolled','in_progress','completed','failed','cancelled')),
  score           NUMERIC(5,2),            -- optional assessment score (out of 100)
  certificate_url TEXT,
  cost            NUMERIC(12,2),
  cost_currency   TEXT DEFAULT 'KES',
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skills matrix — per employee skill entries
CREATE TABLE IF NOT EXISTS public.employee_skills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill_name       TEXT NOT NULL,
  skill_category   TEXT NOT NULL DEFAULT 'general'
                     CHECK (skill_category IN ('technical','soft_skills','language','certification','other')),
  proficiency      SMALLINT NOT NULL DEFAULT 3
                     CHECK (proficiency BETWEEN 1 AND 5),
  certified        BOOLEAN NOT NULL DEFAULT false,
  certification_body TEXT,
  expiry_date      DATE,
  notes            TEXT,
  assessed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assessed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_emp_training_user ON public.employee_training(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_training_status ON public.employee_training(status);
CREATE INDEX IF NOT EXISTS idx_emp_skills_user ON public.employee_skills(user_id);

ALTER TABLE public.training_courses   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_training  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_skills    ENABLE ROW LEVEL SECURITY;

-- training_courses: all read, hr_admin full write
CREATE POLICY "training_courses_read_all" ON public.training_courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "training_courses_hr_write" ON public.training_courses FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role IN ('hr_admin','super_admin')));

-- employee_training: hr_admin full, employee reads own
CREATE POLICY "emp_training_hr" ON public.employee_training FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role IN ('hr_admin','super_admin')));
CREATE POLICY "emp_training_own" ON public.employee_training FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- employee_skills: hr_admin full, employee reads own
CREATE POLICY "emp_skills_hr" ON public.employee_skills FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role IN ('hr_admin','super_admin')));
CREATE POLICY "emp_skills_own" ON public.employee_skills FOR SELECT TO authenticated
  USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
