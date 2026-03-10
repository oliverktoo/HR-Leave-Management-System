import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  getUserDocuments,
  getDocumentTypes,
  uploadEmployeeDocument,
  getDocumentDownloadUrl,
  getDocumentCompletion,
  validateFile,
  formatFileSize
} from '../../services/documentService';
import type { EmployeeDocument, DocumentType, DocumentCompletion } from '../../types';
import '../../styles/documents.css';

export const StaffDocuments = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [completion, setCompletion] = useState<DocumentCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload form state
  const [selectedType, setSelectedType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const [docsResult, typesResult, completionResult] = await Promise.all([
        getUserDocuments(user.id),
        getDocumentTypes(),
        getDocumentCompletion(user.id)
      ]);

      if (docsResult.data) setDocuments(docsResult.data);
      if (typesResult.data) setDocumentTypes(typesResult.data);
      if (completionResult.data) setCompletion(completionResult.data);
    } catch (err) {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    console.log('File selected:', {
      name: file.name,
      type: file.type,
      size: file.size,
      selectedDocumentType: selectedType
    });

    const selectedDocType = documentTypes.find(dt => dt.name === selectedType);
    
    // Default allowed types - expanded to include common formats
    const defaultAllowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    const allowedTypes = selectedDocType?.allowed_mime_types || defaultAllowedTypes;
    const maxSize = selectedDocType?.max_file_size || 10485760; // 10MB default
    
    console.log('Validating file with:', { allowedTypes, maxSize });
    
    const validationError = validateFile(file, maxSize, allowedTypes);

    if (validationError) {
      console.error('File validation error:', validationError);
      setError(validationError);
      setSelectedFile(null);
      // Clear the file input
      e.target.value = '';
      return;
    }

    console.log('File validation passed');
    setError('');
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!user?.id || !selectedType || !selectedFile) {
      setError('Please select document type and file');
      return;
    }

    setUploading(true);
    setError('');

    const { error: uploadError } = await uploadEmployeeDocument({
      user_id: user.id,
      document_type: selectedType,
      document_name: selectedFile.name,
      file: selectedFile,
      description,
      expiry_date: expiryDate || undefined
    });

    setUploading(false);

    if (uploadError) {
      setError(uploadError.message || 'Failed to upload document');
      return;
    }

    setSuccess('Document uploaded successfully!');
    setShowUploadModal(false);
    resetUploadForm();
    loadData();

    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDownload = async (filePath: string) => {
    const { data: url, error: downloadError } = await getDocumentDownloadUrl(filePath);
    
    if (downloadError || !url) {
      setError('Failed to download document');
      return;
    }

    // Open in new tab
    window.open(url, '_blank');
  };

  // Note: handleDelete function removed - employees cannot delete their own documents
  // Only HR admins can delete documents via the AdminDocuments component
  // This maintains proper record keeping and document management

  const resetUploadForm = () => {
    setSelectedType('');
    setSelectedFile(null);
    setDescription('');
    setExpiryDate('');
    setError('');
  };

  const getUploadedDocTypes = () => {
    return documents.map(d => d.document_type);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading your documents...</p>
      </div>
    );
  }

  return (
    <div className="documents-container">
      <div className="documents-header">
        <h2>My Documents</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            resetUploadForm();
            setShowUploadModal(true);
          }}
        >
          <span>📤</span> Upload Document
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️</span> {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span>✓</span> {success}
          <button onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      {/* Info Alert about document policy */}
      <div className="alert alert-info" style={{
        background: '#e0f2fe',
        border: '1px solid #bae6fd',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'start',
        gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
        <div style={{ flex: 1 }}>
          <strong style={{ color: '#0369a1', display: 'block', marginBottom: '0.25rem' }}>
            Important Document Policy
          </strong>
          <p style={{ color: '#0c4a6e', margin: 0, fontSize: '0.875rem' }}>
            Uploaded documents are permanent employee records. If you need to replace or remove a document, 
            please contact HR administration. Only HR can manage document deletions to maintain proper record keeping.
          </p>
        </div>
      </div>

      {/* Document Completion Progress */}
      {completion && (
        <div className="completion-card">
          <h3>Document Completion</h3>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${completion.completion_percentage}%` }}
            ></div>
          </div>
          <p>
            {completion.completed} of {completion.total_required} required documents uploaded
            ({completion.completion_percentage.toFixed(0)}%)
          </p>
        </div>
      )}

      {/* Required Documents Checklist */}
      <div className="documents-checklist">
        <h3>Required Documents</h3>
        <div className="checklist-grid">
          {documentTypes
            .filter(dt => dt.is_required)
            .map(docType => {
              const isUploaded = getUploadedDocTypes().includes(docType.name);
              return (
                <div key={docType.id} className={`checklist-item ${isUploaded ? 'complete' : 'incomplete'}`}>
                  <span className="checklist-icon">{isUploaded ? '✓' : '○'}</span>
                  <div className="checklist-content">
                    <strong>{docType.display_name}</strong>
                    <p>{docType.description}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Uploaded Documents List */}
      <div className="documents-list">
        <h3>Uploaded Documents ({documents.length})</h3>
        {documents.length === 0 ? (
          <div className="empty-state">
            <p>📄 No documents uploaded yet</p>
            <p>Start by uploading your required documents</p>
          </div>
        ) : (
          <div className="documents-grid">
            {documents.map(doc => {
              const docType = documentTypes.find(dt => dt.name === doc.document_type);
              return (
                <div key={doc.id} className="document-card">
                  <div className="document-header">
                    <div className="document-icon">
                      {doc.mime_type.includes('pdf') ? '📄' : '🖼️'}
                    </div>
                    <div className="document-info">
                      <h4>{doc.document_name}</h4>
                      <span className="document-type">{docType?.display_name || doc.document_type}</span>
                    </div>
                    {doc.is_verified && (
                      <span className="badge badge-success">✓ Verified</span>
                    )}
                  </div>

                  <div className="document-meta">
                    <p><strong>Size:</strong> {formatFileSize(doc.file_size)}</p>
                    <p><strong>Uploaded:</strong> {new Date(doc.created_at).toLocaleDateString()}</p>
                    {doc.expiry_date && (
                      <p><strong>Expires:</strong> {new Date(doc.expiry_date).toLocaleDateString()}</p>
                    )}
                    {doc.description && <p><strong>Note:</strong> {doc.description}</p>}
                  </div>

                  <div className="document-actions">
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleDownload(doc.file_path)}
                    >
                      📥 Download
                    </button>
                    {/* Delete button removed - only HR admins can delete via AdminDocuments */}
                    {/* Documents are permanent records once uploaded */}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowUploadModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            className="modal-content" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '16px',
              maxWidth: '600px',
              width: '90%',
              boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)',
              border: '2px solid #e5e7eb',
              zIndex: 10000
            }}
          >
            <div className="modal-header" style={{
              padding: '1.5rem',
              borderBottom: '2px solid #e5e7eb',
              background: 'linear-gradient(to bottom, #f9fafb, #ffffff)'
            }}>
              <h3 style={{ color: '#111827', fontWeight: '700', fontSize: '1.5rem', margin: 0 }}>Upload Document</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowUploadModal(false)}
                style={{
                  width: '40px',
                  height: '40px',
                  background: '#f3f4f6',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '1.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >✕</button>
            </div>

            <div className="modal-body" style={{ padding: '2rem 1.5rem', background: 'white' }}>
              {error && (
                <div className="alert alert-danger" style={{ 
                  marginBottom: '1rem',
                  padding: '0.75rem 1rem',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#991b1b'
                }}>
                  {error}
                </div>
              )}
              
              <div className="form-group">
                <label>Document Type *</label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setError('');
                  }}
                  className="form-control"
                  required
                >
                  <option value="">Select document type...</option>
                  {documentTypes.map(dt => (
                    <option key={dt.id} value={dt.name}>
                      {dt.display_name} {dt.is_required && '*'}
                    </option>
                  ))}
                </select>
                {!selectedType && (
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Please select a document type first
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>File *</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="form-control"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  required
                />
                {selectedFile && (
                  <p className="file-info" style={{ 
                    marginTop: '0.5rem',
                    color: '#059669',
                    fontSize: '0.875rem'
                  }}>
                    ✓ Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
                {!selectedFile && (
                  <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Accepted formats: PDF, JPG, PNG, DOC, DOCX (Max 10MB)
                  </p>
                )}
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="form-control"
                  rows={3}
                  placeholder="Add any notes about this document..."
                />
              </div>

              {selectedType && documentTypes.find(dt => dt.name === selectedType)?.requires_expiry && (
                <div className="form-group">
                  <label>Expiry Date</label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="form-control"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}
            </div>

            <div className="modal-footer" style={{
              padding: '1.5rem',
              borderTop: '2px solid #e5e7eb',
              background: '#f9fafb',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '1rem'
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#e5e7eb',
                  color: '#374151',
                  border: '2px solid #d1d5db',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  minWidth: '120px'
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || !selectedType || !selectedFile}
                title={
                  uploading ? 'Uploading...' :
                  !selectedType ? 'Please select a document type' :
                  !selectedFile ? 'Please select a file' :
                  'Click to upload document'
                }
                style={{
                  padding: '0.75rem 1.5rem',
                  background: uploading || !selectedType || !selectedFile ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: uploading || !selectedType || !selectedFile ? 'not-allowed' : 'pointer',
                  minWidth: '120px',
                  opacity: uploading || !selectedType || !selectedFile ? 0.7 : 1,
                  boxShadow: uploading || !selectedType || !selectedFile ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                {uploading ? '⏳ Uploading...' : '📤 Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
