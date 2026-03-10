import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  getAllDocuments,
  getDocumentTypes,
  uploadEmployeeDocument,
  getDocumentDownloadUrl,
  deleteDocument,
  verifyDocument,
  validateFile,
  formatFileSize
} from '../../services/documentService';
import { formatEmployeeId } from '../../utils/formatters';
import type { EmployeeDocument, DocumentType } from '../../types';
import '../../styles/documents.css';

export const AdminDocuments = () => {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<EmployeeDocument[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Document Type Management
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeDisplayName, setTypeDisplayName] = useState('');
  const [typeDescription, setTypeDescription] = useState('');
  const [typeRequired, setTypeRequired] = useState(false);
  const [typeRequiresExpiry, setTypeRequiresExpiry] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'types'>('documents');

  // Document Upload for Employees
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedUploadEmployee, setSelectedUploadEmployee] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterVerified, setFilterVerified] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [documents, searchTerm, filterType, filterVerified, selectedEmployee]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docsResult, typesResult, employeesResult] = await Promise.all([
        getAllDocuments(),
        getDocumentTypes(),
        supabase.from('users_profile').select('id, email, first_name, last_name, employee_id, role').order('first_name')
      ]);

      if (docsResult.data) setDocuments(docsResult.data);
      if (typesResult.data) setDocumentTypes(typesResult.data);
      
      console.log('Employees result:', employeesResult);
      if (employeesResult.data) {
        console.log('Setting allEmployees with:', employeesResult.data);
        setAllEmployees(employeesResult.data);
      } else if (employeesResult.error) {
        console.error('Error fetching employees:', employeesResult.error);
        setError('Failed to load employee list');
      }
    } catch (err) {
      console.error('Error in loadData:', err);
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...documents];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(doc =>
        doc.document_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        doc.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        `${doc.user?.first_name} ${doc.user?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(doc => doc.document_type === filterType);
    }

    // Verified filter
    if (filterVerified !== 'all') {
      const isVerified = filterVerified === 'verified';
      filtered = filtered.filter(doc => doc.is_verified === isVerified);
    }

    // Employee filter
    if (selectedEmployee) {
      filtered = filtered.filter(doc => doc.user_id === selectedEmployee);
    }

    setFilteredDocuments(filtered);
  };

  const handleVerify = async (doc: EmployeeDocument) => {
    if (!confirm(`Verify ${doc.document_name}?`)) return;

    const { error: verifyError } = await verifyDocument(doc.id);

    if (verifyError) {
      setError('Failed to verify document');
      return;
    }

    setSuccess('Document verified successfully!');
    loadData();
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDownload = async (filePath: string) => {
    const { data: url, error: downloadError } = await getDocumentDownloadUrl(filePath);

    if (downloadError || !url) {
      setError('Failed to download document');
      return;
    }

    window.open(url, '_blank');
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    if (!confirm(`Delete ${doc.document_name}? This action cannot be undone.`)) return;

    const { error: deleteError } = await deleteDocument(doc.id, doc.file_path);

    if (deleteError) {
      setError('Failed to delete document');
      return;
    }

    setSuccess('Document deleted successfully!');
    loadData();
    setTimeout(() => setSuccess(''), 3000);
  };

  const getStats = () => {
    const total = documents.length;
    const verified = documents.filter(d => d.is_verified).length;
    const unverified = total - verified;
    const uniqueEmployees = new Set(documents.map(d => d.user_id)).size;

    return { total, verified, unverified, uniqueEmployees };
  };

  const getUniqueEmployees = () => {
    const employeeMap = new Map();
    documents.forEach(doc => {
      if (doc.user && !employeeMap.has(doc.user_id)) {
        employeeMap.set(doc.user_id, doc.user);
      }
    });
    return Array.from(employeeMap.values());
  };

  const handleAddDocType = () => {
    setEditingType(null);
    setTypeName('');
    setTypeDisplayName('');
    setTypeDescription('');
    setTypeRequired(false);
    setTypeRequiresExpiry(false);
    setShowTypeModal(true);
  };

  const handleEditDocType = (docType: DocumentType) => {
    setEditingType(docType);
    setTypeName(docType.name);
    setTypeDisplayName(docType.display_name);
    setTypeDescription(docType.description || '');
    setTypeRequired(docType.is_required);
    setTypeRequiresExpiry(docType.requires_expiry);
    setShowTypeModal(true);
  };

  const handleSaveDocType = async () => {
    if (!typeDisplayName.trim()) {
      setError('Display name is required');
      return;
    }

    const name = typeName || typeDisplayName.replace(/\s+/g, '_');

    try {
      const { error: saveError } = await supabase
        .from('document_types')
        .upsert({
          id: editingType?.id,
          name,
          display_name: typeDisplayName,
          description: typeDescription,
          is_required: typeRequired,
          requires_expiry: typeRequiresExpiry,
          is_active: true
        });

      if (saveError) throw saveError;

      setSuccess(`Document type ${editingType ? 'updated' : 'created'} successfully!`);
      setShowTypeModal(false);
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to save document type');
    }
  };

  const handleToggleTypeStatus = async (docType: DocumentType) => {
    try {
      const { error: updateError } = await supabase
        .from('document_types')
        .update({ is_active: !docType.is_active })
        .eq('id', docType.id);

      if (updateError) throw updateError;

      setSuccess(`Document type ${docType.is_active ? 'deactivated' : 'activated'}`);
      loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to update document type status');
    }
  };

  const handleOpenUploadModal = () => {
    console.log('Opening upload modal. Available employees:', allEmployees.length, allEmployees);
    setSelectedUploadEmployee('');
    setUploadDocType('');
    setUploadFile(null);
    setUploadDescription('');
    setUploadExpiryDate('');
    setError('');
    setShowUploadModal(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const docType = documentTypes.find(dt => dt.name === uploadDocType);
    if (!docType) {
      setError('Please select document type first');
      return;
    }

    const validationError = validateFile(
      file, 
      docType.max_file_size, 
      docType.allowed_mime_types
    );
    
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setUploadFile(file);
  };

  const handleUploadDocument = async () => {
    if (!selectedUploadEmployee || !uploadDocType || !uploadFile) {
      setError('Please fill all required fields');
      return;
    }

    const docType = documentTypes.find(dt => dt.name === uploadDocType);
    if (docType?.requires_expiry && !uploadExpiryDate) {
      setError('Expiry date is required for this document type');
      return;
    }

    setUploading(true);
    setError('');

    const { error: uploadError } = await uploadEmployeeDocument({
      user_id: selectedUploadEmployee,
      document_type: uploadDocType,
      document_name: uploadFile.name,
      file: uploadFile,
      description: uploadDescription,
      expiry_date: uploadExpiryDate || undefined
    });

    setUploading(false);

    if (uploadError) {
      setError(uploadError.message || 'Failed to upload document');
      return;
    }

    setSuccess('Document uploaded successfully!');
    setShowUploadModal(false);
    loadData();
    setTimeout(() => setSuccess(''), 3000);
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="loading-spinner"></div>
        <p>Loading documents...</p>
      </div>
    );
  }

  const stats = getStats();
  const employees = getUniqueEmployees();

  return (
    <div className="admin-documents-container">
      <div className="page-header">
        <div>
          <h1>📁 Employee Documents</h1>
          <p>Manage and verify all employee documentation</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            📄 Documents
          </button>
          <button
            className={`tab-button ${activeTab === 'types' ? 'active' : ''}`}
            onClick={() => setActiveTab('types')}
          >
            ⚙️ Document Types
          </button>
        </div>
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

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <>
          {/* Stats Cards */}
          <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📄</div>
          <div className="stat-content">
            <h3>{stats.total}</h3>
            <p>Total Documents</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <h3>{stats.verified}</h3>
            <p>Verified</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-content">
            <h3>{stats.unverified}</h3>
            <p>Pending Verification</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <h3>{stats.uniqueEmployees}</h3>
            <p>Employees</p>
          </div>
        </div>
      </div>

      {/* Upload Document Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        <button 
          className="btn btn-primary" 
          onClick={handleOpenUploadModal}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '12px 24px',
            fontSize: '1rem',
            fontWeight: 500
          }}
        >
          <span>📤</span> Upload Employee Document
        </button>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <input
            type="text"
            placeholder="Search documents or employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="filter-select"
          >
            <option value="">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.first_name} {emp.last_name} ({emp.email})
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Document Types</option>
            {documentTypes.map(dt => (
              <option key={dt.id} value={dt.name}>
                {dt.display_name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <select
            value={filterVerified}
            onChange={(e) => setFilterVerified(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified Only</option>
            <option value="unverified">Unverified Only</option>
          </select>
        </div>
      </div>

      {/* Documents Table */}
      <div className="documents-table-container">
        <table className="documents-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Document Type</th>
              <th>File Name</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>Expires</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-message">
                  No documents found
                </td>
              </tr>
            ) : (
              filteredDocuments.map(doc => {
                const docType = documentTypes.find(dt => dt.name === doc.document_type);
                const isExpiringSoon = doc.expiry_date && 
                  new Date(doc.expiry_date) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                
                return (
                  <tr key={doc.id}>
                    <td>
                      <div className="employee-cell">
                        <strong>{doc.user?.first_name} {doc.user?.last_name}</strong>
                        <span className="employee-id">{formatEmployeeId(doc.user?.employee_id || '')}</span>
                      </div>
                    </td>
                    <td>
                      <span className="doc-type-badge">
                        {docType?.display_name || doc.document_type}
                      </span>
                    </td>
                    <td className="file-name">{doc.document_name}</td>
                    <td>{formatFileSize(doc.file_size)}</td>
                    <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                    <td>
                      {doc.expiry_date ? (
                        <span className={isExpiringSoon ? 'expiry-warning' : ''}>
                          {new Date(doc.expiry_date).toLocaleDateString()}
                          {isExpiringSoon && ' ⚠️'}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {doc.is_verified ? (
                        <span className="badge badge-success">✓ Verified</span>
                      ) : (
                        <span className="badge badge-warning">⏳ Pending</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button
                          className="btn-icon"
                          onClick={() => handleDownload(doc.file_path)}
                          title="Download"
                        >
                          📥
                        </button>
                        {!doc.is_verified && (
                          <button
                            className="btn-icon"
                            onClick={() => handleVerify(doc)}
                            title="Verify"
                          >
                            ✓
                          </button>
                        )}
                        <button
                          className="btn-icon danger"
                          onClick={() => handleDelete(doc)}
                          title="Delete"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

      {/* Document Types Tab */}
      {activeTab === 'types' && (
        <div className="document-types-section">
          <div className="section-header">
            <h2>Document Type Management</h2>
            <button className="btn btn-primary" onClick={handleAddDocType}>
              <span>➕</span> Add Document Type
            </button>
          </div>

          <div className="types-grid">
            {documentTypes.map(docType => (
              <div key={docType.id} className={`type-card ${!docType.is_active ? 'inactive' : ''}`}>
                <div className="type-header">
                  <h3>{docType.display_name}</h3>
                  <div className="type-badges">
                    {docType.is_required && <span className="badge badge-warning">Required</span>}
                    {docType.requires_expiry && <span className="badge badge-info">Has Expiry</span>}
                    {!docType.is_active && <span className="badge badge-secondary">Inactive</span>}
                  </div>
                </div>
                
                <p className="type-description">{docType.description || 'No description'}</p>
                
                <div className="type-meta">
                  <span><strong>System Name:</strong> {docType.name}</span>
                  <span><strong>Max Size:</strong> {formatFileSize(docType.max_file_size)}</span>
                </div>

                <div className="type-actions">
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleEditDocType(docType)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className={`btn btn-sm ${docType.is_active ? 'btn-warning' : 'btn-success'}`}
                    onClick={() => handleToggleTypeStatus(docType)}
                  >
                    {docType.is_active ? '🔒 Deactivate' : '✅ Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Document Type Modal */}
      {showTypeModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowTypeModal(false)}
          style={{
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
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
              boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              zIndex: 10000
            }}
          >
            <div 
              className="modal-header"
              style={{
                background: 'linear-gradient(to bottom, #f9fafb, #ffffff)',
                borderBottom: '2px solid #e5e7eb',
                padding: '20px 24px',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px'
              }}
            >
              <h3 style={{ color: '#111827', margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                {editingType ? '✏️ Edit Document Type' : '➕ Add Document Type'}
              </h3>
              <button 
                className="modal-close" 
                onClick={() => setShowTypeModal(false)}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  width: '40px',
                  height: '40px',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >✕</button>
            </div>

            <div className="modal-body" style={{ padding: '24px', background: '#ffffff' }}>
              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Display Name *
                </label>
                <input
                  type="text"
                  value={typeDisplayName}
                  onChange={(e) => setTypeDisplayName(e.target.value)}
                  className="form-control"
                  placeholder="e.g., National ID Card"
                  required
                  style={{ color: '#111827', background: '#ffffff' }}
                />
              </div>

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  System Name (Optional)
                </label>
                <input
                  type="text"
                  value={typeName}
                  onChange={(e) => setTypeName(e.target.value)}
                  className="form-control"
                  placeholder="e.g., National_ID (auto-generated if left empty)"
                  style={{ color: '#111827', background: '#ffffff' }}
                />
                <small style={{ color: '#6b7280' }}>Used internally. Leave empty to auto-generate from display name.</small>
              </div>

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Description
                </label>
                <textarea
                  value={typeDescription}
                  onChange={(e) => setTypeDescription(e.target.value)}
                  className="form-control"
                  rows={3}
                  placeholder="Brief description of this document type..."
                  style={{ color: '#111827', background: '#ffffff' }}
                />
              </div>

              <div className="form-group form-checkbox">
                <label className="checkbox-label" style={{ color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={typeRequired}
                    onChange={(e) => setTypeRequired(e.target.checked)}
                  />
                  <span>Mark as Required (Mandatory for all employees)</span>
                </label>
              </div>

              <div className="form-group form-checkbox">
                <label className="checkbox-label" style={{ color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={typeRequiresExpiry}
                    onChange={(e) => setTypeRequiresExpiry(e.target.checked)}
                  />
                  <span>Requires Expiry Date (e.g., for IDs, certificates)</span>
                </label>
              </div>
            </div>

            <div 
              className="modal-footer"
              style={{
                background: '#f9fafb',
                borderTop: '2px solid #e5e7eb',
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px'
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={() => setShowTypeModal(false)}
                style={{
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveDocType}
                disabled={!typeDisplayName.trim()}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: typeDisplayName.trim() ? 'pointer' : 'not-allowed',
                  opacity: typeDisplayName.trim() ? 1 : 0.5,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                {editingType ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && (
        <div 
          className="modal-overlay" 
          onClick={() => setShowUploadModal(false)}
          style={{
            background: 'rgba(0, 0, 0, 0.92)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
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
              boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              zIndex: 10000
            }}
          >
            <div 
              className="modal-header"
              style={{
                background: 'linear-gradient(to bottom, #f9fafb, #ffffff)',
                borderBottom: '2px solid #e5e7eb',
                padding: '20px 24px',
                borderTopLeftRadius: '12px',
                borderTopRightRadius: '12px'
              }}
            >
              <h3 style={{ color: '#111827', margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                📤 Upload Employee Document
              </h3>
              <button 
                className="modal-close" 
                onClick={() => setShowUploadModal(false)}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  width: '40px',
                  height: '40px',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
              >✕</button>
            </div>

            <div className="modal-body" style={{ padding: '24px', background: '#ffffff' }}>
              {error && (
                <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                  <span>⚠️</span> {error}
                </div>
              )}

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Select Employee *
                </label>
                <select
                  value={selectedUploadEmployee}
                  onChange={(e) => setSelectedUploadEmployee(e.target.value)}
                  className="form-control"
                  required
                  style={{ color: '#111827', background: '#ffffff' }}
                >
                  <option value="">Choose an employee... ({allEmployees.length} available)</option>
                  {allEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} - {emp.email} ({formatEmployeeId(emp.employee_id || '')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Document Type *
                </label>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  className="form-control"
                  required
                  style={{ color: '#111827', background: '#ffffff' }}
                >
                  <option value="">Select document type...</option>
                  {documentTypes.filter(dt => dt.is_active).map(dt => (
                    <option key={dt.id} value={dt.name}>
                      {dt.display_name} {dt.is_required && '(Required)'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Select File *
                </label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="form-control"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  style={{ color: '#111827', background: '#ffffff' }}
                />
                {uploadFile && (
                  <div style={{ marginTop: '8px', color: '#059669', fontSize: '0.875rem' }}>
                    ✓ Selected: {uploadFile.name} ({formatFileSize(uploadFile.size)})
                  </div>
                )}
                <small style={{ color: '#6b7280', display: 'block', marginTop: '4px' }}>
                  Accepted: PDF, JPG, PNG, DOC, DOCX (Max 10MB)
                </small>
              </div>

              {uploadDocType && documentTypes.find(dt => dt.name === uploadDocType)?.requires_expiry && (
                <div className="form-group">
                  <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    value={uploadExpiryDate}
                    onChange={(e) => setUploadExpiryDate(e.target.value)}
                    className="form-control"
                    min={new Date().toISOString().split('T')[0]}
                    style={{ color: '#111827', background: '#ffffff' }}
                  />
                </div>
              )}

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Description (Optional)
                </label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  className="form-control"
                  rows={3}
                  placeholder="Add any notes about this document..."
                  style={{ color: '#111827', background: '#ffffff' }}
                />
              </div>
            </div>

            <div 
              className="modal-footer"
              style={{
                background: '#f9fafb',
                borderTop: '2px solid #e5e7eb',
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px'
              }}
            >
              <button
                className="btn btn-secondary"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
                style={{
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.5 : 1,
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleUploadDocument}
                disabled={!selectedUploadEmployee || !uploadDocType || !uploadFile || uploading}
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '6px',
                  fontWeight: 500,
                  cursor: (!selectedUploadEmployee || !uploadDocType || !uploadFile || uploading) ? 'not-allowed' : 'pointer',
                  opacity: (!selectedUploadEmployee || !uploadDocType || !uploadFile || uploading) ? 0.5 : 1,
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                  transition: 'all 0.2s'
                }}
              >
                {uploading ? 'Uploading...' : '📤 Upload Document'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
