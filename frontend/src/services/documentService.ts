import { supabase } from '../lib/supabaseClient';
import type { EmployeeDocument, DocumentType, DocumentUploadData, DocumentCompletion, ServiceResponse } from '../types';

/**
 * Document Service
 * Handles all document storage and management operations
 */

const STORAGE_BUCKET = 'hr-documents';

// ============================================================================
// Document Type Operations
// ============================================================================

export const getDocumentTypes = async (): Promise<ServiceResponse<DocumentType[]>> => {
  try {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .eq('is_active', true)
      .order('display_name');

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching document types:', error);
    return { data: null, error: error as Error };
  }
};

// ============================================================================
// Employee Document Operations
// ============================================================================

export const uploadEmployeeDocument = async (
  uploadData: DocumentUploadData
): Promise<ServiceResponse<EmployeeDocument>> => {
  try {
    const { user_id, document_type, document_name, file, description, expiry_date } = uploadData;

    // 1. Upload file to storage
    const fileName = `${user_id}/${Date.now()}_${file.name}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (storageError) throw storageError;

    // 2. Get current user for uploaded_by
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // 3. Save document metadata
    const { data: docData, error: docError } = await supabase
      .from('employee_documents')
      .insert({
        user_id,
        document_type,
        document_name,
        file_path: storageData.path,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
        description,
        expiry_date
      })
      .select()
      .single();

    if (docError) throw docError;

    return { data: docData, error: null };
  } catch (error) {
    console.error('Error uploading document:', error);
    return { data: null, error: error as Error };
  }
};

export const getUserDocuments = async (userId: string): Promise<ServiceResponse<EmployeeDocument[]>> => {
  try {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch related data separately
    if (data && data.length > 0) {
      // Get document types
      const { data: docTypes } = await supabase
        .from('document_types')
        .select('*');

      // Get user profiles
      const userIds = new Set<string>();
      data.forEach(doc => {
        userIds.add(doc.user_id);
        userIds.add(doc.uploaded_by);
        if (doc.verified_by) userIds.add(doc.verified_by);
      });

      const { data: users } = await supabase
        .from('users_profile')
        .select('id, first_name, last_name, email, employee_id, department_id')
        .in('id', Array.from(userIds));

      // Combine data
      const enrichedData = data.map(doc => ({
        ...doc,
        document_type_info: docTypes?.find(dt => dt.name === doc.document_type),
        user: users?.find(u => u.id === doc.user_id),
        uploader: users?.find(u => u.id === doc.uploaded_by),
        verifier: doc.verified_by ? users?.find(u => u.id === doc.verified_by) : undefined
      }));

      return { data: enrichedData, error: null };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching user documents:', error);
    return { data: null, error: error as Error };
  }
};

export const getAllDocuments = async (): Promise<ServiceResponse<EmployeeDocument[]>> => {
  try {
    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Fetch related data separately
    if (data && data.length > 0) {
      // Get document types
      const { data: docTypes } = await supabase
        .from('document_types')
        .select('*');

      // Get user profiles
      const userIds = new Set<string>();
      data.forEach(doc => {
        userIds.add(doc.user_id);
        userIds.add(doc.uploaded_by);
        if (doc.verified_by) userIds.add(doc.verified_by);
      });

      const { data: users } = await supabase
        .from('users_profile')
        .select('id, first_name, last_name, email, employee_id, department_id')
        .in('id', Array.from(userIds));

      // Combine data
      const enrichedData = data.map(doc => ({
        ...doc,
        document_type_info: docTypes?.find(dt => dt.name === doc.document_type),
        user: users?.find(u => u.id === doc.user_id),
        uploader: users?.find(u => u.id === doc.uploaded_by),
        verifier: doc.verified_by ? users?.find(u => u.id === doc.verified_by) : undefined
      }));

      return { data: enrichedData, error: null };
    }

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching all documents:', error);
    return { data: null, error: error as Error };
  }
};

export const getDocumentDownloadUrl = async (filePath: string): Promise<ServiceResponse<string>> => {
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) throw error;
    if (!data?.signedUrl) throw new Error('Failed to generate download URL');

    return { data: data.signedUrl, error: null };
  } catch (error) {
    console.error('Error generating download URL:', error);
    return { data: null, error: error as Error };
  }
};

export const deleteDocument = async (documentId: string, filePath: string): Promise<ServiceResponse<void>> => {
  try {
    // 1. Delete from storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([filePath]);

    if (storageError) throw storageError;

    // 2. Delete from database
    const { error: dbError } = await supabase
      .from('employee_documents')
      .delete()
      .eq('id', documentId);

    if (dbError) throw dbError;

    return { data: undefined, error: null };
  } catch (error) {
    console.error('Error deleting document:', error);
    return { data: null, error: error as Error };
  }
};

export const verifyDocument = async (documentId: string): Promise<ServiceResponse<EmployeeDocument>> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('employee_documents')
      .update({
        is_verified: true,
        verified_by: user.id,
        verified_at: new Date().toISOString()
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error verifying document:', error);
    return { data: null, error: error as Error };
  }
};

export const getDocumentCompletion = async (userId: string): Promise<ServiceResponse<DocumentCompletion>> => {
  try {
    const { data, error } = await supabase
      .rpc('get_document_completion', { p_user_id: userId });

    if (error) throw error;
    return { data: data?.[0] || { total_required: 0, completed: 0, completion_percentage: 0 }, error: null };
  } catch (error) {
    console.error('Error fetching document completion:', error);
    return { data: null, error: error as Error };
  }
};

// ============================================================================
// File Validation Helpers
// ============================================================================

export const validateFile = (file: File, maxSize: number = 10485760, allowedTypes: string[]): string | null => {
  // Check file size (default 10MB)
  if (file.size > maxSize) {
    return `File size must be less than ${(maxSize / 1048576).toFixed(0)}MB`;
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    console.warn('File validation failed:', {
      fileName: file.name,
      fileType: file.type,
      allowedTypes
    });
    return `Invalid file type (${file.type}). Please upload PDF, JPG, PNG, DOC, or DOCX files`;
  }

  return null;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};
