# HR Document Management System - Setup Guide

Complete setup guide for the employee document upload and management system.

## 📋 Overview

This system allows:
- **Staff**: Upload personal documents (ID, certificates, contracts, etc.)
- **HR Admins**: View, verify, and manage all employee documents
- **HODs**: View documents from their department employees

## 🚀 Step 1: Database Setup

### 1.1 Run the SQL Setup Script

1. Go to Supabase Dashboard SQL Editor:
   ```
   https://supabase.com/dashboard/project/nmvdagfduojwbsxgqkjw/sql
   ```

2. Copy and run the script: `supabase/setup_hr_documents.sql`

This creates:
- `employee_documents` table (document metadata)
- `document_types` table (document categories)
- 12 default document types
- Row Level Security (RLS) policies
- Helper functions

### 1.2 Create Storage Bucket

1. Go to: **Storage** → **Create a new bucket**

2. Configure bucket:
   ```
   Name: hr-documents
   Public: OFF (Private)
   File size limit: 10MB
   Allowed file types: PDF, JPG, PNG, DOC, DOCX
   ```

3. Click **"Create bucket"**

✅ **Note**: Storage policies are automatically created by the SQL script

---

## 📦 Step 2: Verify Installation

### Check Tables

Run in SQL Editor:
```sql
-- Verify tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('employee_documents', 'document_types');

-- Check document types
SELECT * FROM document_types ORDER BY display_name;
```

### Check Storage Bucket

```sql
-- Verify bucket exists
SELECT * FROM storage.buckets WHERE name = 'hr-documents';

-- Check storage policies
SELECT * FROM pg_policies 
WHERE tablename = 'objects' 
AND schemaname = 'storage'
AND policyname LIKE '%hr-documents%';
```

---

## 🎯 Step 3: Using the System

### For Staff Users

1. **Navigate to Documents**:
   - Login to the app
   - Go to: `/documents`

2. **Upload Documents**:
   - Click **"Upload Document"**
   - Select document type (e.g., National ID)
   - Choose file (PDF, JPG, PNG, DOC)
   - Add optional description
   - Set expiry date (if applicable)
   - Click **"Upload"**

3. **View Progress**:
   - See completion percentage
   - Check which required documents are missing
   - Download or delete unverified documents

### For HR Admin

1. **Navigate to Admin Documents**:
   - Login as HR Admin
   - Go to: `/admin/documents`

2. **View All Documents**:
   - See all employee documents
   - Filter by employee, type, or verification status
   - Search by name or document

3. **Verify Documents**:
   - Click ✓ button to verify a document
   - Verified documents cannot be deleted by employees
   - Track expiring documents (30-day warning)

4. **Manage Documents**:
   - Download any document
   - Delete inappropriate or outdated documents
   - View document statistics

---

## 📁 Document Types (Default)

| Type | Display Name | Required | Expiry |
|------|-------------|----------|--------|
| `ID_Card` | National ID/Passport | ✅ | ✅ |
| `Resume_CV` | Resume/CV | ✅ | ❌ |
| `Certificate` | Academic Certificate | ✅ | ❌ |
| `Contract` | Employment Contract | ✅ | ❌ |
| `Tax_Form` | Tax Documents | ❌ | ✅ |
| `Medical_Certificate` | Medical Certificate | ❌ | ✅ |
| `Bank_Details` | Bank Account Details | ✅ | ❌ |
| `Reference_Letter` | Reference Letter | ❌ | ❌ |
| `Police_Clearance` | Police Clearance | ❌ | ✅ |
| `Passport_Photo` | Passport Photo | ✅ | ❌ |
| `Next_of_Kin` | Next of Kin Details | ✅ | ❌ |
| `Other` | Other Document | ❌ | ❌ |

---

## 🔐 Security & Permissions

### Row Level Security (RLS)

**Employees can:**
- ✅ View their own documents
- ✅ Upload their own documents
- ✅ Update/delete unverified documents
- ❌ View other employees' documents
- ❌ Delete verified documents

**HR Admins can:**
- ✅ View ALL documents
- ✅ Upload documents for any employee
- ✅ Verify documents
- ✅ Update any document
- ✅ Delete any document

**HODs can:**
- ✅ View documents from their department
- ❌ Verify or delete documents

### Storage Security

Files are stored in private folders:
```
hr-documents/
  ├── {user_id_1}/
  │   ├── 1234567890_national_id.pdf
  │   └── 1234567891_certificate.pdf
  └── {user_id_2}/
      └── 1234567892_contract.pdf
```

Each user can only access their own folder unless they have HR/HOD permissions.

---

## 🛠️ API Functions

### Frontend Services (documentService.ts)

```typescript
// Get all document types
await getDocumentTypes()

// Upload document
await uploadEmployeeDocument({
  user_id: userId,
  document_type: 'ID_Card',
  document_name: file.name,
  file: file,
  description: 'My national ID',
  expiry_date: '2030-12-31'
})

// Get user's documents
await getUserDocuments(userId)

// Get all documents (HR Admin only)
await getAllDocuments()

// Download document
await getDocumentDownloadUrl(filePath)

// Delete document
await deleteDocument(documentId, filePath)

// Verify document (HR Admin only)
await verifyDocument(documentId)

// Get completion percentage
await getDocumentCompletion(userId)
```

### Database Functions

```sql
-- Get user documents with type info
SELECT * FROM get_user_documents('user-id-here');

-- Get document completion percentage
SELECT * FROM get_document_completion('user-id-here');
```

---

## 📊 Database Schema

### employee_documents Table

```sql
id                UUID PRIMARY KEY
user_id           UUID (FK → users_profile)
document_type     VARCHAR(100) (FK → document_types)
document_name     VARCHAR(255)
file_path         TEXT (storage path)
file_size         BIGINT (bytes)
mime_type         VARCHAR(100)
uploaded_by       UUID (FK → users_profile)
description       TEXT
expiry_date       DATE
is_verified       BOOLEAN
verified_by       UUID (FK → users_profile)
verified_at       TIMESTAMPTZ
created_at        TIMESTAMPTZ
updated_at        TIMESTAMPTZ
```

### document_types Table

```sql
id                  UUID PRIMARY KEY
name                VARCHAR(100) UNIQUE
display_name        VARCHAR(255)
description         TEXT
is_required         BOOLEAN
requires_expiry     BOOLEAN
allowed_mime_types  TEXT[]
max_file_size       BIGINT
is_active           BOOLEAN
created_at          TIMESTAMPTZ
updated_at          TIMESTAMPTZ
```

---

## 🎨 Features

### Staff Interface
- ✅ Document upload with drag & drop
- ✅ Progress tracking (% complete)
- ✅ Required documents checklist
- ✅ Document preview/download
- ✅ Delete unverified documents
- ✅ Expiry date reminders
- ✅ File validation (size, type)

### Admin Interface
- ✅ View all employee documents
- ✅ Filter by employee/type/status
- ✅ Search functionality
- ✅ Bulk verification
- ✅ Document statistics dashboard
- ✅ Expiry warnings
- ✅ Audit trail

---

## 🔧 Troubleshooting

### Issue: "Upload failed - Storage bucket not found"

**Solution:**
1. Verify bucket exists: Storage → Buckets
2. Check bucket name is exactly: `hr-documents`
3. Ensure bucket is PRIVATE (not public)

### Issue: "Permission denied"

**Solution:**
1. Check RLS policies are enabled
2. Verify user is authenticated
3. Run the SQL setup script again

### Issue: "File too large"

**Solution:**
- Max file size is 10MB
- Compress large files before uploading
- Update `max_file_size` in `document_types` table if needed

### Issue: "Invalid file type"

**Solution:**
- Allowed types: PDF, JPG, PNG, DOC, DOCX
- Check `allowed_mime_types` in `document_types` table
- Update array if you need to allow other types

---

## 📈 Usage Statistics

View document statistics in Admin panel:
- Total documents uploaded
- Verified vs pending
- Documents per employee
- Expiring documents
- Completion rates

---

## 🔄 Maintenance

### Clean up expired documents

```sql
-- Find expired documents
SELECT * FROM employee_documents 
WHERE expiry_date < CURRENT_DATE;

-- Delete expired documents (careful!)
DELETE FROM employee_documents 
WHERE expiry_date < CURRENT_DATE 
AND is_verified = false;
```

### Backup documents

Export document metadata:
```sql
COPY (
  SELECT * FROM employee_documents
) TO '/path/to/backup.csv' CSV HEADER;
```

---

## 🆘 Support

If you encounter issues:
1. Check browser console for errors (F12)
2. Verify database tables and storage bucket exist
3. Check RLS policies are active
4. Ensure user has proper role (employee, hr_admin, hod)

---

## ✅ Quick Checklist

- [ ] Run `setup_hr_documents.sql` in Supabase SQL Editor
- [ ] Create `hr-documents` storage bucket (Private)
- [ ] Verify 12 document types exist in database
- [ ] Test upload as regular employee
- [ ] Test verification as HR admin
- [ ] Check document filters work
- [ ] Verify download functionality
- [ ] Test delete permissions

**All done!** 🎉 Your document management system is ready to use.
