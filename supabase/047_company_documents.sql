-- Migration 047: Company Documents (HR-to-all-staff shared documents)
-- HR/Admin can upload policy docs, handbooks, forms etc.
-- All active employees can view and download.

CREATE TABLE IF NOT EXISTS public.company_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  description   text,
  category      text        NOT NULL DEFAULT 'General',
  file_path     text        NOT NULL,
  file_name     text        NOT NULL,
  file_size     bigint      NOT NULL DEFAULT 0,
  mime_type     text        NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by   uuid        REFERENCES public.users_profile(id) ON DELETE SET NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_company_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_company_documents_updated_at ON public.company_documents;
CREATE TRIGGER trg_company_documents_updated_at
  BEFORE UPDATE ON public.company_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_company_documents_updated_at();

-- RLS
ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active documents
CREATE POLICY "company_docs_read" ON public.company_documents
  FOR SELECT TO authenticated
  USING (is_active = true);

-- HR admin and super admin can manage all
CREATE POLICY "company_docs_hr_all" ON public.company_documents
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Storage: create the company-documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-documents',
  'company-documents',
  false,
  52428800,  -- 50 MB limit
  ARRAY['application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg','image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: all authenticated users can read (download)
CREATE POLICY "company_docs_storage_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-documents');

-- Storage RLS: HR admin and super admin can upload
CREATE POLICY "company_docs_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

-- Storage RLS: HR admin and super admin can delete
CREATE POLICY "company_docs_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-documents'
    AND EXISTS (
      SELECT 1 FROM public.users_profile
      WHERE id = auth.uid()
        AND role IN ('hr_admin', 'super_admin')
    )
  );

NOTIFY pgrst, 'reload schema';
