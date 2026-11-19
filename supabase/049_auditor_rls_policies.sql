-- Migration 049: Grant auditor role read-only access across all major tables
-- Auditor can SELECT everything HR Admin can see, but cannot INSERT/UPDATE/DELETE.

-- ─── employee_documents ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all documents" ON public.employee_documents;
CREATE POLICY "Auditor can view all documents"
ON public.employee_documents FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── hr-documents storage bucket ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all hr-documents" ON storage.objects;
CREATE POLICY "Auditor can view all hr-documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-documents'
  AND EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── leave_requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all leave requests" ON public.leave_requests;
CREATE POLICY "Auditor can view all leave requests"
ON public.leave_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── leave_balances ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all leave balances" ON public.leave_balances;
CREATE POLICY "Auditor can view all leave balances"
ON public.leave_balances FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── attendance_records ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all attendance" ON public.attendance_records;
CREATE POLICY "Auditor can view all attendance"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── users_profile ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view all profiles" ON public.users_profile;
CREATE POLICY "Auditor can view all profiles"
ON public.users_profile FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── payroll_runs ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view payroll runs" ON public.payroll_runs;
CREATE POLICY "Auditor can view payroll runs"
ON public.payroll_runs FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── payroll_lines ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view payroll lines" ON public.payroll_lines;
CREATE POLICY "Auditor can view payroll lines"
ON public.payroll_lines FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── salary_grades ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view salary grades" ON public.salary_grades;
CREATE POLICY "Auditor can view salary grades"
ON public.salary_grades FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── fleet_vehicles ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view vehicles" ON public.fleet_vehicles;
CREATE POLICY "Auditor can view vehicles"
ON public.fleet_vehicles FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── trip_requests ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view trip requests" ON public.trip_requests;
CREATE POLICY "Auditor can view trip requests"
ON public.trip_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── fuel_records ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view fuel records" ON public.fuel_records;
CREATE POLICY "Auditor can view fuel records"
ON public.fuel_records FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── maintenance_records ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view maintenance records" ON public.maintenance_records;
CREATE POLICY "Auditor can view maintenance records"
ON public.maintenance_records FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── disciplinary_cases ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view disciplinary cases" ON public.disciplinary_cases;
CREATE POLICY "Auditor can view disciplinary cases"
ON public.disciplinary_cases FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── assets ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view assets" ON public.assets;
CREATE POLICY "Auditor can view assets"
ON public.assets FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

DROP POLICY IF EXISTS "Auditor can view asset assignments" ON public.asset_assignments;
CREATE POLICY "Auditor can view asset assignments"
ON public.asset_assignments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── employee_benefits ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view benefits" ON public.employee_benefits;
CREATE POLICY "Auditor can view benefits"
ON public.employee_benefits FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── employee_training ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view training" ON public.employee_training;
CREATE POLICY "Auditor can view training"
ON public.employee_training FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── employee_skills ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view skills" ON public.employee_skills;
CREATE POLICY "Auditor can view skills"
ON public.employee_skills FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── departments (for joins) ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view departments" ON public.departments;
CREATE POLICY "Auditor can view departments"
ON public.departments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

-- ─── ooo_requests ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Auditor can view ooo requests" ON public.ooo_requests;
CREATE POLICY "Auditor can view ooo requests"
ON public.ooo_requests FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.users_profile WHERE id = auth.uid() AND role = 'auditor')
);

NOTIFY pgrst, 'reload schema';
