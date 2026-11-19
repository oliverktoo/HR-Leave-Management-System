-- Migration 066: Document Notifications
-- ─────────────────────────────────────────────────────────────────────────────
-- Two notification events:
--
--   A. employee_documents INSERT
--      → HR/admin uploaded a personal document for an employee.
--        Notify that employee (only when the uploader is not the employee themselves).
--
--   B. company_documents INSERT
--      → A new policy/handbook document was published.
--        Notify all active employees (bulk insert via subquery).
--
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A. Personal employee document uploaded ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_employee_document_upload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uploader_name TEXT;
BEGIN
  -- Only notify when HR/admin uploaded it (not the employee themselves)
  IF NEW.uploaded_by = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT first_name || ' ' || last_name INTO v_uploader_name
  FROM   public.users_profile
  WHERE  id = NEW.uploaded_by;

  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  VALUES (
    NEW.user_id,
    'New Document Added to Your Profile',
    COALESCE(v_uploader_name, 'HR') || ' uploaded "' || NEW.document_name ||
      '" (' || NEW.document_type || ') to your employee profile.',
    'document',
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_document_notify ON public.employee_documents;
CREATE TRIGGER trg_employee_document_notify
  AFTER INSERT ON public.employee_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_employee_document_upload();

-- ── B. Company-wide document published ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_company_document_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uploader_name TEXT;
BEGIN
  -- Only fire when document is published (is_active = true on INSERT)
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT first_name || ' ' || last_name INTO v_uploader_name
  FROM   public.users_profile
  WHERE  id = NEW.uploaded_by;

  -- Bulk-notify all active employees (excluding the uploader)
  INSERT INTO public.notifications (user_id, title, message, type, is_read)
  SELECT
    up.id,
    'New Document Available: ' || NEW.title,
    COALESCE(v_uploader_name, 'HR') || ' published a new document: "' || NEW.title || '"' ||
      CASE WHEN NEW.category <> 'General' THEN ' (' || NEW.category || ')' ELSE '' END ||
      '. Check the Documents section.',
    'document',
    false
  FROM public.users_profile up
  WHERE up.is_active = true
    AND up.id <> COALESCE(NEW.uploaded_by, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_document_notify ON public.company_documents;
CREATE TRIGGER trg_company_document_notify
  AFTER INSERT ON public.company_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_company_document_published();

NOTIFY pgrst, 'reload schema';
