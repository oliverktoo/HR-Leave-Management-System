import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import {
  getUserDocuments,
  getDocumentTypes,
  uploadEmployeeDocument,
  getDocumentDownloadUrl,
  getDocumentCompletion,
  validateFile,
  formatFileSize,
  getCompanyDocuments,
  getCompanyDocumentUrl,
  type CompanyDocument,
} from '../../services/documentService';
import type { EmployeeDocument, DocumentType, DocumentCompletion } from '../../types';
import '../../styles/documents.css';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

// Category icons mapping
const CATEGORY_ICONS: Record<string, string> = {
  'Personal Identification & Verification': '🪪',
  'Academic & Professional Qualifications': '🎓',
  'Employment History & References':        '📋',
  'FKF Contract & Policy':                  '📝',
  'Financial & Payroll':                    '💰',
  'Next of Kin & Emergency Contacts':       '🆘',
  'Medical & Insurance':                    '🏥',
  'Performance & Development':              '📈',
  'Leave & Attendance':                     '📅',
  'Disciplinary & Grievance':               '⚖️',
  'Other':                                  '📄',
};

export const StaffDocuments = () => {
  const { user } = useAuth();
  const [documents, setDocuments]       = useState<EmployeeDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]); // show_to_staff only — for upload form
  const [allDocumentTypes, setAllDocumentTypes] = useState<DocumentType[]>([]); // all active — for displaying HR-uploaded docs
  const [completion, setCompletion]     = useState<DocumentCompletion | null>(null);
  const [loading, setLoading]           = useState(true);
  const [uploading, setUploading]       = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([]);
  const [companyDocsLoading, setCompanyDocsLoading] = useState(true);

  // Upload form state
  const [selectedType, setSelectedType] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentLabel, setDocumentLabel] = useState('');
  const [description, setDescription]   = useState('');
  const [expiryDate, setExpiryDate]     = useState('');

  useEffect(() => {
    if (user?.id) loadData();
    loadCompanyDocs();
  }, [user?.id]);

  const loadCompanyDocs = async () => {
    setCompanyDocsLoading(true);
    const { data } = await getCompanyDocuments();
    if (data) setCompanyDocs(data);
    setCompanyDocsLoading(false);
  };

  const handleViewCompanyDoc = async (doc: CompanyDocument) => {
    const { data: url, error } = await getCompanyDocumentUrl(doc.file_path);
    if (error || !url) { setError('Could not open document'); return; }
    window.open(url, '_blank');
  };

  const loadData = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [docsResult, typesResult, allTypesResult, completionResult] = await Promise.all([
        getUserDocuments(user.id),
        getDocumentTypes(true),   // show_to_staff only — for upload form dropdown
        getDocumentTypes(false),  // all active types — for displaying HR-uploaded docs
        getDocumentCompletion(user.id).catch(() => ({ data: null, error: null })),
      ]);
      if (docsResult.error) throw docsResult.error;
      if (docsResult.data)       setDocuments(docsResult.data);
      if (typesResult.data)      setDocumentTypes(typesResult.data.sort((a, b) => a.sort_order - b.sort_order));
      if (allTypesResult.data)   setAllDocumentTypes(allTypesResult.data.sort((a, b) => a.sort_order - b.sort_order));
      if (completionResult.data) setCompletion(completionResult.data);
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setSelectedFile(null); return; }

    const defaultAllowedTypes = [
      'application/pdf', 'image/jpeg', 'image/jpg', 'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const selectedDocType = documentTypes.find(dt => dt.name === selectedType);
    const allowedTypes    = selectedDocType?.allowed_mime_types || defaultAllowedTypes;
    const maxSize         = selectedDocType?.max_file_size || 10485760;

    const validationError = validateFile(file, maxSize, allowedTypes);
    if (validationError) {
      setError(validationError);
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
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
      document_name: documentLabel.trim() || selectedFile.name,
      file: selectedFile,
      description,
      expiry_date: expiryDate || undefined
    });

    setUploading(false);
    if (uploadError) { setError(uploadError.message || 'Failed to upload document'); return; }

    setSuccess('Document uploaded successfully!');
    setShowUploadModal(false);
    resetUploadForm();
    loadData();
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDownload = async (filePath: string) => {
    const { data: url, error: downloadError } = await getDocumentDownloadUrl(filePath);
    if (downloadError || !url) { setError('Failed to download document'); return; }
    window.open(url, '_blank');
  };

  const resetUploadForm = () => {
    setSelectedType(''); setSelectedFile(null);
    setDocumentLabel(''); setDescription(''); setExpiryDate(''); setError('');
  };

  const uploadedTypeNames = new Set(documents.map(d => d.document_type));

  // Use allDocumentTypes for display so HR-uploaded docs of any type are visible.
  // Only show a category if: it has show_to_staff types OR the employee has uploaded docs in it.
  const displayTypes = allDocumentTypes.filter(dt =>
    dt.show_to_staff || uploadedTypeNames.has(dt.name)
  );

  const categoriesOrdered = Array.from(
    new Map(displayTypes.map(dt => [dt.category, dt.category])).keys()
  );

  // Required doc stats per category (still based on allDocumentTypes required flag)
  const categoryStats = (cat: string) => {
    const types    = displayTypes.filter(dt => dt.category === cat && dt.is_required);
    const uploaded = types.filter(dt => uploadedTypeNames.has(dt.name));
    return { total: types.length, uploaded: uploaded.length };
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
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
    <div className="documents-container">
      <div className="documents-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>My Documents</h1>
        <NotificationBell />
        <button
          className="btn btn-primary"
          onClick={() => { resetUploadForm(); setShowUploadModal(true); }}
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

      {/* Policy notice */}
      <div style={{
        background: '#e0f2fe', border: '1px solid #bae6fd', borderRadius: '8px',
        padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'start', gap: '0.75rem'
      }}>
        <span style={{ fontSize: '1.25rem' }}>ℹ️</span>
        <div>
          <strong style={{ color: '#0369a1', display: 'block', marginBottom: '0.25rem' }}>
            Important Document Policy
          </strong>
          <p style={{ color: '#0c4a6e', margin: 0, fontSize: '0.875rem' }}>
            Uploaded documents are permanent employee records. To replace or remove a document
            please contact HR administration. Only HR can delete documents to maintain proper record keeping.
          </p>
        </div>
      </div>

      {/* Overall completion bar */}
      {completion && (
        <div className="completion-card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0 }}>Document Completion</h3>
            <span style={{ fontWeight: 700, color: (completion.completion_percentage ?? 0) >= 100 ? '#059669' : '#f59e0b' }}>
              {(completion.completion_percentage ?? 0).toFixed(0)}%
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${completion.completion_percentage ?? 0}%` }} />
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
            {completion.completed} of {completion.total_required} required documents uploaded
          </p>
        </div>
      )}

      {/* Category sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
        {categoriesOrdered.map(cat => {
          const catTypes   = displayTypes.filter(dt => dt.category === cat);
          const stats      = categoryStats(cat);
          const isOpen     = activeCategory === cat;
          const icon       = CATEGORY_ICONS[cat] || '📄';
          const allDone    = stats.total > 0 && stats.uploaded === stats.total;
          const hasMissing = stats.total > 0 && stats.uploaded < stats.total;

          return (
            <div key={cat} style={{
              border: `1px solid ${hasMissing ? '#fde68a' : '#e2e8f0'}`,
              borderRadius: '10px', overflow: 'hidden',
              background: 'white'
            }}>
              {/* Category header */}
              <button
                onClick={() => setActiveCategory(isOpen ? null : cat)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.875rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                  textAlign: 'left'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                <span style={{ flex: 1, fontWeight: 600, color: '#1e293b' }}>{cat}</span>
                {stats.total > 0 && (
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 9999,
                    background: allDone ? '#d1fae5' : hasMissing ? '#fef3c7' : '#f1f5f9',
                    color: allDone ? '#065f46' : hasMissing ? '#92400e' : '#64748b'
                  }}>
                    {allDone ? '✓ Complete' : `${stats.uploaded}/${stats.total} required`}
                  </span>
                )}
                <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {/* Expanded items */}
              {isOpen && (
                <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {catTypes.map(dt => {
                    const userDocs = documents.filter(d => d.document_type === dt.name);
                    const uploaded = userDocs.length > 0;
                    return (
                      <div key={dt.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                        padding: '0.75rem', borderRadius: '8px',
                        background: uploaded ? '#f0fdf4' : dt.is_required ? '#fffbeb' : '#f8fafc',
                        border: `1px solid ${uploaded ? '#bbf7d0' : dt.is_required ? '#fde68a' : '#e2e8f0'}`
                      }}>
                        <span style={{ fontSize: '1.1rem', marginTop: '1px' }}>
                          {uploaded ? '✅' : dt.is_required ? '⚠️' : '○'}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>{dt.display_name}</strong>
                            {dt.is_required && !uploaded && (
                              <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 9999 }}>Required</span>
                            )}
                            {dt.requires_expiry && (
                              <span style={{ fontSize: '0.7rem', color: '#6b7280', background: '#f3f4f6', padding: '1px 6px', borderRadius: 9999 }}>Has expiry</span>
                            )}
                            {userDocs.length > 1 && (
                              <span style={{ fontSize: '0.7rem', color: '#1d4ed8', background: '#dbeafe', padding: '1px 6px', borderRadius: 9999 }}>
                                {userDocs.length} files
                              </span>
                            )}
                          </div>
                          {dt.description && (
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>{dt.description}</p>
                          )}
                          {/* All uploaded files for this type */}
                          {userDocs.map((doc, idx) => (
                            <div key={doc.id} style={{
                              marginTop: '0.5rem', display: 'flex', alignItems: 'center',
                              gap: '0.5rem', background: 'white', padding: '0.4rem 0.6rem',
                              borderRadius: '6px', border: '1px solid #d1fae5'
                            }}>
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8', minWidth: '18px' }}>
                                {userDocs.length > 1 ? `${idx + 1}.` : (doc.mime_type?.includes('pdf') ? '📄' : '🖼️')}
                              </span>
                              <span style={{ flex: 1, fontSize: '0.8rem', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {doc.document_name}
                              </span>
                              {doc.is_verified && (
                                <span style={{ fontSize: '0.7rem', color: '#059669', background: '#d1fae5', padding: '1px 6px', borderRadius: 9999 }}>Verified</span>
                              )}
                              {doc.expiry_date && (
                                <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                                  Exp: {new Date(doc.expiry_date).toLocaleDateString()}
                                </span>
                              )}
                              <button
                                onClick={() => handleDownload(doc.file_path)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: '0.8rem', padding: '2px 4px' }}
                                title="Download"
                              >
                                📥
                              </button>
                            </div>
                          ))}
                        </div>
                        {/* Always show upload button — multiple uploads allowed per type */}
                        <button
                          className="btn btn-sm btn-secondary"
                          style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}
                          onClick={() => {
                            setSelectedType(dt.name);
                            setDocumentLabel('');
                            setShowUploadModal(true);
                          }}
                        >
                          {uploaded ? '➕ Add' : '📤 Upload'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowUploadModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: '16px', maxWidth: '600px', width: '90%',
              boxShadow: '0 25px 80px rgba(0,0,0,0.4)', border: '2px solid #e5e7eb', zIndex: 10000,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '1.5rem', borderBottom: '2px solid #e5e7eb',
              background: 'linear-gradient(to bottom,#f9fafb,#fff)', borderRadius: '16px 16px 0 0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#111827', fontWeight: 700, fontSize: '1.25rem', margin: 0 }}>Upload Document</h3>
                <button
                  onClick={() => { setShowUploadModal(false); resetUploadForm(); }}
                  style={{
                    width: 36, height: 36, background: '#f3f4f6', border: '1px solid #d1d5db',
                    borderRadius: '8px', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280'
                  }}
                >✕</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {error && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b' }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Document Type *</label>
                <select
                  value={selectedType}
                  onChange={e => { setSelectedType(e.target.value); setError(''); }}
                  className="form-select"
                  required
                >
                  <option value="">Select document type…</option>
                  {/* Group by category */}
                  {Array.from(new Set(documentTypes.map(dt => dt.category))).map(cat => (
                    <optgroup key={cat} label={`${CATEGORY_ICONS[cat] || '📄'} ${cat}`}>
                      {documentTypes.filter(dt => dt.category === cat).map(dt => (
                        <option key={dt.id} value={dt.name}>
                          {dt.display_name}{dt.is_required ? ' *' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <small style={{ color: '#6b7280', fontSize: '0.8rem' }}>* = required document</small>
              </div>

              {selectedType && (() => {
                const dt = documentTypes.find(d => d.name === selectedType);
                const existingCount = documents.filter(d => d.document_type === selectedType).length;
                return (
                  <>
                    {dt?.description && (
                      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', padding: '0.6rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.825rem', color: '#0369a1' }}>
                        {dt.description}
                      </div>
                    )}
                    {existingCount > 0 && (
                      <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#92400e' }}>
                        You already have {existingCount} file{existingCount > 1 ? 's' : ''} under this type. Adding another is allowed — use the label below to distinguish them.
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="form-group">
                <label className="form-label">Document Label <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="text"
                  value={documentLabel}
                  onChange={e => setDocumentLabel(e.target.value)}
                  className="form-control"
                  placeholder={selectedType && documents.filter(d => d.document_type === selectedType).length > 0
                    ? 'e.g. Bachelor\'s Degree, Master\'s Certificate…'
                    : 'Leave blank to use the file name'}
                  maxLength={120}
                />
                <small style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                  Give this file a descriptive name so it's easy to identify later
                </small>
              </div>

              <div className="form-group">
                <label className="form-label">File *</label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="form-control"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  required
                />
                {selectedFile ? (
                  <p style={{ marginTop: '0.4rem', color: '#059669', fontSize: '0.875rem' }}>
                    ✓ {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                ) : (
                  <p style={{ marginTop: '0.4rem', color: '#6b7280', fontSize: '0.8rem' }}>
                    Accepted: PDF, JPG, PNG, DOC, DOCX — max 10 MB
                  </p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Notes (Optional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="form-control"
                  rows={2}
                  placeholder="Any notes about this document…"
                />
              </div>

              {selectedType && documentTypes.find(dt => dt.name === selectedType)?.requires_expiry && (
                <div className="form-group">
                  <label className="form-label">Expiry Date <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '0.85em' }}>(optional)</span></label>
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={e => setExpiryDate(e.target.value)}
                    className="form-control"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '1.25rem 1.5rem', borderTop: '2px solid #e5e7eb', background: '#f9fafb',
              display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderRadius: '0 0 16px 16px'
            }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowUploadModal(false); resetUploadForm(); }}
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={uploading || !selectedType || !selectedFile}
              >
                {uploading ? '⏳ Uploading…' : '📤 Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Company Documents ─────────────────────────────────────── */}
      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e2e8f0' }}>
          <span style={{ fontSize: '1.25rem' }}>🏢</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>Company Documents</h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Policies, handbooks, and forms published by HR for all staff</p>
          </div>
        </div>

        {companyDocsLoading ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>Loading…</div>
        ) : companyDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '10px' }}>
            No company documents have been published yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {companyDocs.map(doc => (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.875rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
              >
                <div style={{ fontSize: '1.6rem', flexShrink: 0 }}>
                  {doc.mime_type?.includes('pdf') ? '📕' : doc.mime_type?.includes('word') || doc.mime_type?.includes('document') ? '📘' : doc.mime_type?.includes('sheet') || doc.mime_type?.includes('excel') ? '📗' : '📄'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{doc.title}</div>
                  {doc.description && (
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.1rem' }}>{doc.description}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: 9999, fontWeight: 500 }}>
                      {doc.category}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {new Date(doc.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => handleViewCompanyDoc(doc)}
                  style={{ flexShrink: 0 }}
                >
                  👁 View
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
      </div>
    </div>
  );
};
