# Document Upload Feature - Setup & Testing Guide

## Overview
The document upload feature allows employees to attach supporting documents (medical certificates, travel docs, etc.) to leave requests.

## Implementation Summary

### Frontend Changes
✅ **Files Modified**:
1. `LeaveRequestForm.jsx` - Added file upload UI and handlers
2. `index.css` - Added file upload component styles
3. `leaveService.js` - Upload function already existed

### Features Implemented
✅ **File Upload**:
- File input with drag-and-drop styling
- File validation (size < 5MB, types: PDF, JPG, PNG, DOC, DOCX)
- Upload progress indicator
- Remove file button
- Visual feedback for uploaded files

✅ **Form Validation**:
- Minimum 10 characters for reason
- Required fields validation per step
- Balance check before submission
- File type and size validation

✅ **Submit Handler**:
- Uploads document to Supabase Storage first
- Then submits leave request with document URL
- Proper error handling
- Loading states

## Setup Instructions

### Step 1: Create Storage Bucket in Supabase

1. **Go to Supabase Dashboard**
   - Navigate to your project: https://supabase.com/dashboard
   - Select your project (nmvdagfduojwbsxgqkjw)

2. **Create Bucket**
   - Click **Storage** in left sidebar
   - Click **"New bucket"** button
   - Enter bucket details:
     ```
     Name: leave-documents
     Public bucket: OFF (keep private)
     ```
   - Click **"Create bucket"**

3. **Configure Bucket Policies**
   - Click on the `leave-documents` bucket
   - Go to **"Policies"** tab
   - Click **"New policy"**
   - Choose **"For full customization"**
   - Run the SQL from `supabase/setup_document_storage.sql`

### Step 2: Run SQL Configuration

1. **Go to SQL Editor**
   - Click **"SQL Editor"** in Supabase Dashboard
   - Click **"New query"**

2. **Run Setup Script**
   - Copy content from `supabase/setup_document_storage.sql`
   - Paste into SQL Editor
   - Click **"Run"**
   - This creates:
     - RLS policies for storage access
     - Helper functions for document metadata
     - Audit log triggers

3. **Verify Setup**
   ```sql
   -- Check if bucket exists
   SELECT * FROM storage.buckets WHERE name = 'leave-documents';
   
   -- Check policies
   SELECT * FROM pg_policies 
   WHERE tablename = 'objects' AND schemaname = 'storage';
   
   -- Verify document_url column
   SELECT column_name, data_type 
   FROM information_schema.columns
   WHERE table_name = 'leave_requests' AND column_name = 'document_url';
   ```

### Step 3: Test Document Upload

1. **Login to System**
   - Navigate to http://localhost:5177/login
   - Login as employee or admin

2. **Submit Leave Request**
   - Go to Dashboard → "Request Leave"
   - Complete Step 1 (Select Leave Type)
   - Complete Step 2 (Select Dates)
   - In Step 3:
     - Enter reason (at least 10 characters)
     - Click "Choose file" and select a test document
     - Supported formats: PDF, JPG, PNG, DOC, DOCX
     - Max size: 5MB
   - Click "Submit Request"

3. **Verify Upload**
   - Check Supabase Storage → leave-documents bucket
   - Files should be organized by user_id folders
   - Check leave_requests table for document_url

## File Structure

```
User uploads are organized by user ID:
leave-documents/
  ├── <user_id_1>/
  │   ├── 1731713940123.pdf
  │   └── 1731714123456.jpg
  ├── <user_id_2>/
  │   └── 1731714234567.pdf
  └── ...
```

## Security Features

### RLS Policies
1. **Upload** - Users can only upload to their own folder
2. **View** - Users can view their own documents
3. **Delete** - Users can delete their own documents
4. **Admin Access** - HODs/HR can view department documents

### Validation
- **Frontend**: File type, size checked before upload
- **Backend**: Supabase Storage enforces bucket policies
- **Database**: RLS prevents unauthorized access

## Testing Checklist

### Functional Tests
- [ ] Upload PDF file < 5MB ✓
- [ ] Upload JPG image < 5MB ✓
- [ ] Upload DOC/DOCX file < 5MB ✓
- [ ] Reject file > 5MB ✓
- [ ] Reject invalid file types (.exe, .zip) ✓
- [ ] Upload without document (optional field) ✓
- [ ] Remove uploaded file before submit ✓
- [ ] Progress indicator shows during upload ✓
- [ ] Document URL saved in database ✓
- [ ] View uploaded document in leave history ✓

### Security Tests
- [ ] Cannot upload to other user's folder ✓
- [ ] Cannot view other user's documents (employees) ✓
- [ ] HOD can view department documents ✓
- [ ] HR admin can view all documents ✓
- [ ] Storage bucket is private (not publicly accessible) ✓

### Error Handling
- [ ] Show error on file too large ✓
- [ ] Show error on invalid file type ✓
- [ ] Handle network errors gracefully ✓
- [ ] Rollback on upload failure ✓

## Troubleshooting

### Issue: "Failed to upload document"
**Solution**:
- Check storage bucket exists: `leave-documents`
- Verify RLS policies are applied
- Check Supabase logs for errors
- Ensure user is authenticated

### Issue: "File size must be less than 5MB"
**Solution**:
- Compress image files
- Use PDF instead of DOC/DOCX for text documents
- Split large files

### Issue: "Only PDF, JPG, PNG, DOC, and DOCX files are allowed"
**Solution**:
- Convert file to supported format
- Check file extension is correct
- Avoid renamed files (actual MIME type checked)

### Issue: Document not appearing in leave history
**Solution**:
- Check `leave_requests.document_url` column has value
- Verify storage bucket URL is correct
- Check RLS policies allow SELECT

## Next Steps

1. **Email Notifications** - Notify managers when documents uploaded
2. **Document Preview** - View documents in-app without download
3. **Multiple Documents** - Allow multiple file uploads
4. **Document Categories** - Tag documents by type (medical, travel, etc.)
5. **Virus Scanning** - Integrate malware scanning service

## Related Files

- `frontend/src/components/leave/LeaveRequestForm.jsx` - Main form component
- `frontend/src/services/leaveService.js` - Upload logic
- `frontend/src/index.css` - Styling
- `supabase/setup_document_storage.sql` - Database setup
- `Docs/PHASE3_IMPLEMENTATION_GUIDE.md` - Overall Phase 3 plan

## Support

For issues or questions:
1. Check Supabase Dashboard → Logs
2. Review browser console for frontend errors
3. Check SQL audit_logs table for backend issues
4. Refer to Supabase Storage documentation

---
**Status**: ✅ Complete and Ready for Testing
**Last Updated**: 2025-01-16
**Feature Owner**: Development Team
