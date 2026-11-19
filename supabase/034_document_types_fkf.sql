-- Migration 034: FKF Comprehensive Staff File Document Types
-- Replaces the basic 12 document types with the full 39-type FKF staff file
-- structure across 10 categories per FKF HR Department requirements.
-- Existing uploaded documents are preserved — old type records are deactivated.

-- 1. Add category and sort_order columns
ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS category    text    NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS sort_order  integer NOT NULL DEFAULT 99;

-- 2. Deactivate all legacy basic types (keeps existing docs readable but off the upload form)
UPDATE public.document_types
SET is_active = false
WHERE name IN (
  'ID_Card','Resume_CV','Certificate','Contract','Tax_Form',
  'Medical_Certificate','Bank_Details','Reference_Letter',
  'Police_Clearance','Passport_Photo','Next_of_Kin','Other'
);

-- 3. Insert all FKF document types
-- Using ON CONFLICT DO NOTHING so re-running is safe.

-- ── CATEGORY 1: Personal Identification & Verification ────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('national_id',       'National ID / Passport',
   'Certified copy of National Identity Card (both sides) or valid passport biodata page.',
   'Personal Identification & Verification', true,  true,  101),
  ('kra_pin_cert',      'KRA PIN Certificate',
   'Kenya Revenue Authority PIN certificate. Required for PAYE processing.',
   'Personal Identification & Verification', true,  false, 102),
  ('nssf_registration', 'NSSF Registration Card',
   'National Social Security Fund membership card or registration certificate.',
   'Personal Identification & Verification', true,  false, 103),
  ('shif_registration', 'SHIF Registration Card',
   'Social Health Insurance Fund (formerly NHIF) registration card or number.',
   'Personal Identification & Verification', true,  false, 104),
  ('good_conduct_cert', 'Certificate of Good Conduct',
   'DCI Certificate of Good Conduct — valid within 6 months of issue.',
   'Personal Identification & Verification', true,  true,  105),
  ('passport_photo',    'Passport-Size Photographs',
   '2 recent colour passport-size photographs for ID badge and personnel file.',
   'Personal Identification & Verification', true,  false, 106)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 2: Academic & Professional Qualifications ───────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('academic_certificates',       'Academic Certificates',
   'Certified copies of KCSE, diploma, degree and postgraduate certificates.',
   'Academic & Professional Qualifications', true,  false, 201),
  ('academic_transcripts',        'Academic Transcripts',
   'Official transcripts for all degrees and diplomas (for verification).',
   'Academic & Professional Qualifications', false, false, 202),
  ('professional_certifications', 'Professional Certifications & Licenses',
   'ICPAK, LSK, IHRM, CAF/FIFA licenses, practicing certificates, coaching licenses.',
   'Academic & Professional Qualifications', false, true,  203),
  ('cpd_records',                 'CPD Records',
   'Continuing Professional Development log (Finance, Legal, HR, Medical roles).',
   'Academic & Professional Qualifications', false, false, 204)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 3: Employment History & References ──────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('curriculum_vitae',         'Curriculum Vitae (CV)',
   'Updated CV as submitted during recruitment. Refreshed annually.',
   'Employment History & References', true,  false, 301),
  ('reference_letters',        'Reference Letters',
   'Minimum 2 professional references from previous employers or recognized contacts.',
   'Employment History & References', false, false, 302),
  ('previous_employment_docs', 'Previous Employment Documentation',
   'Last employment contract, resignation/termination letter, or certificate of service.',
   'Employment History & References', false, false, 303),
  ('tax_compliance_cert',      'Tax Compliance Certificate',
   'KRA tax compliance certificate for new hires from formal employment.',
   'Employment History & References', false, false, 304)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 4: FKF Contract & Policy ────────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('employment_contract',      'Signed Employment Contract',
   'Original signed FKF employment contract including JD, terms, grade, and salary.',
   'FKF Contract & Policy', true,  false, 401),
  ('job_description_signed',   'Job Description (Signed)',
   'Role-specific JD signed by employee and line manager. Updated at each role change.',
   'FKF Contract & Policy', true,  false, 402),
  ('offer_letter',             'Offer Letter & Acceptance',
   'Original offer letter and signed letter of acceptance from employee.',
   'FKF Contract & Policy', true,  false, 403),
  ('probation_review_form',    'Probation Review Form',
   'Completed probation assessment with confirmation or extension notice.',
   'FKF Contract & Policy', false, false, 404),
  ('code_of_conduct',          'Code of Conduct Declaration',
   'Signed acknowledgment of FKF Code of Conduct. Annual renewal required.',
   'FKF Contract & Policy', true,  false, 405),
  ('conflict_of_interest',     'Conflict of Interest Declaration',
   'Annual declaration per FKF Conflict of Interest Policy (mandatory G1–G4).',
   'FKF Contract & Policy', true,  false, 406),
  ('confidentiality_agreement','Confidentiality & NDA',
   'Signed NDA — particularly for Commercial, Legal, Finance, and HR roles.',
   'FKF Contract & Policy', false, false, 407)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 5: Financial & Payroll ──────────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('bank_account_details',    'Bank Account Details',
   'Bank name, branch, account number, and verified bank letter or stamped deposit slip.',
   'Financial & Payroll', true,  false, 501),
  ('payroll_deduction_auth',  'Payroll Deduction Authorizations',
   'SACCO deductions, loan repayments, or any other standing payroll deductions.',
   'Financial & Payroll', false, false, 502),
  ('pension_nomination',      'Pension / Provident Fund Nomination',
   'Beneficiary nomination form with name, ID, and percentage allocation.',
   'Financial & Payroll', false, false, 503)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 6: Next of Kin & Emergency Contacts ─────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('next_of_kin_form',        'Next of Kin Form',
   'Full name, relationship, ID number, and contact details for emergencies.',
   'Next of Kin & Emergency Contacts', true,  false, 601),
  ('beneficiary_nomination',  'Beneficiary Nomination Form',
   'Names, ID numbers, and percentage allocation for insurance or end-of-service benefits.',
   'Next of Kin & Emergency Contacts', false, false, 602)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 7: Medical & Insurance ──────────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('pre_employment_medical',     'Pre-Employment Medical Certificate',
   'From a recognized medical facility — valid within 3 months of employment start. Mandatory for all.',
   'Medical & Insurance', true,  true,  701),
  ('medical_history_form',       'Medical History Form',
   'Self-declared health information for emergency preparedness (especially for traveling staff).',
   'Medical & Insurance', false, false, 702),
  ('medical_insurance_enrollment','Group Medical Insurance Enrollment',
   'Enrollment form with dependents details (spouse, children) and birth/marriage certificates.',
   'Medical & Insurance', false, false, 703),
  ('life_insurance_form',        'Group Life & Personal Accident Insurance',
   'Enrollment and beneficiary nomination for group life and personal accident cover.',
   'Medical & Insurance', false, false, 704)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 8: Performance & Development ────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('performance_appraisal',        'Performance Appraisal Records',
   'Annual (April) and mid-year (October) appraisal forms — added annually to staff file.',
   'Performance & Development', false, false, 801),
  ('training_records',             'Training & Development Records',
   'Certificates from FKF-sponsored training, CPD log, and course completion records.',
   'Performance & Development', false, false, 802),
  ('performance_improvement_plan', 'Performance Improvement Plan',
   'Active or past PIPs with sign-off and outcome reports.',
   'Performance & Development', false, false, 803)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 9: Leave & Attendance ───────────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('leave_application_forms',  'Leave Application Forms',
   'Filed chronologically — annual, sick, compassionate, maternity/paternity.',
   'Leave & Attendance', false, false, 901),
  ('medical_cert_sick_leave',  'Medical Certificates (Sick Leave)',
   'Medical certificates for sick leave exceeding 3 days — filed with leave applications.',
   'Leave & Attendance', false, false, 902),
  ('leave_balance_statement',  'Leave Balance Statement',
   'Annual leave balance statement generated by FKF HR.',
   'Leave & Attendance', false, false, 903)
ON CONFLICT (name) DO NOTHING;

-- ── CATEGORY 10: Disciplinary & Grievance ────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('warning_letter',           'Warning Letters',
   'Verbal, written, or final warnings filed with employee acknowledgment signature.',
   'Disciplinary & Grievance', false, false, 1001),
  ('grievance_record',         'Grievance Records',
   'Formal grievance submissions and outcomes filed chronologically.',
   'Disciplinary & Grievance', false, false, 1002),
  ('separation_documentation', 'Separation Documentation',
   'Resignation letter, exit interview, clearance form, or termination letter.',
   'Disciplinary & Grievance', false, false, 1003)
ON CONFLICT (name) DO NOTHING;

-- ── Other ─────────────────────────────────────────────────────────────────────
INSERT INTO public.document_types
  (name, display_name, description, category, is_required, requires_expiry, sort_order) VALUES
  ('other_document', 'Other Document',
   'Any other document not covered by the above categories.',
   'Other', false, false, 9999)
ON CONFLICT (name) DO NOTHING;

-- 4. Update sort_order on existing (now inactive) legacy types so they sink to bottom
UPDATE public.document_types
SET sort_order = 9998, category = 'Legacy'
WHERE name IN (
  'ID_Card','Resume_CV','Certificate','Contract','Tax_Form',
  'Medical_Certificate','Bank_Details','Reference_Letter',
  'Police_Clearance','Passport_Photo','Next_of_Kin','Other'
);

NOTIFY pgrst, 'reload schema';

-- Verification
SELECT category, COUNT(*) as types, COUNT(*) FILTER (WHERE is_required) as required
FROM public.document_types
WHERE is_active = true
GROUP BY category
ORDER BY MIN(sort_order);
