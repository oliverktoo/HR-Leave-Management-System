-- Migration 036: Add show_to_staff flag to document_types
-- Controls which document types are visible to staff in their upload section.
-- HR Admin can configure this per type via the Staff Upload Settings tab.

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS show_to_staff boolean NOT NULL DEFAULT true;

-- Required documents default ON; performance/disciplinary/leave types default OFF
-- (these are typically HR-managed, not self-uploaded by staff)
UPDATE public.document_types SET show_to_staff = false
WHERE name IN (
  'performance_appraisal',
  'performance_improvement_plan',
  'warning_letter',
  'grievance_record',
  'separation_documentation',
  'leave_application_forms',
  'leave_balance_statement'
);

COMMENT ON COLUMN public.document_types.show_to_staff IS
  'When true, staff can see and upload this document type in My Documents.';

NOTIFY pgrst, 'reload schema';
