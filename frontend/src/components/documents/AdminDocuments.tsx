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
  formatFileSize,
  updateDocumentTypeStaffVisibility,
  updateDocumentTypeRequired,
  getCompanyDocuments,
  uploadCompanyDocument,
  getCompanyDocumentUrl,
  deleteCompanyDocument,
  COMPANY_DOC_CATEGORIES,
  type CompanyDocument,
} from '../../services/documentService';
import { formatEmployeeId } from '../../utils/formatters';
import type { EmployeeDocument, DocumentType } from '../../types';
import '../../styles/documents.css';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';

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
  const [activeTab, setActiveTab] = useState<'documents' | 'types' | 'staff_settings' | 'compliance' | 'company'>('documents');

  // Company documents state
  const [companyDocs, setCompanyDocs] = useState<CompanyDocument[]>([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [showCompanyUpload, setShowCompanyUpload] = useState(false);
  const [companyTitle, setCompanyTitle] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [companyCategory, setCompanyCategory] = useState<string>('Policy');
  const [companyFile, setCompanyFile] = useState<File | null>(null);
  const [companyUploading, setCompanyUploading] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState<string | null>(null);
  const [savingRequired, setSavingRequired] = useState<string | null>(null);

  // Document preview modal
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Compliance tab
  const [complianceSearch, setComplianceSearch] = useState('');
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Document Upload for Employees
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [selectedUploadEmployee, setSelectedUploadEmployee] = useState<string>('');
  const [uploadDocType, setUploadDocType] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocLabel, setUploadDocLabel] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadExpiryDate, setUploadExpiryDate] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterVerified, setFilterVerified] = useState('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');

  useEffect(() => {
    loadData();
    loadCompanyDocs();
  }, []);

  const loadCompanyDocs = async () => {
    setCompanyLoading(true);
    const { data } = await getCompanyDocuments();
    if (data) setCompanyDocs(data);
    setCompanyLoading(false);
  };

  const handleCompanyUpload = async () => {
    if (!companyTitle.trim() || !companyFile) {
      setError('Title and file are required');
      return;
    }
    setCompanyUploading(true);
    const { data, error: uploadError } = await uploadCompanyDocument(
      companyTitle, companyDescription, companyCategory, companyFile
    );
    setCompanyUploading(false);
    if (uploadError) {
      setError(`Upload failed: ${uploadError.message}`);
      return;
    }
    if (data) setCompanyDocs(prev => [data, ...prev]);
    setSuccess('Document published to all staff');
    setShowCompanyUpload(false);
    setCompanyTitle(''); setCompanyDescription(''); setCompanyFile(null); setCompanyCategory('Policy');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCompanyView = async (doc: CompanyDocument) => {
    const { data: url, error: urlError } = await getCompanyDocumentUrl(doc.file_path);
    if (urlError || !url) { setError('Could not generate download link'); return; }
    window.open(url, '_blank');
  };

  const handleCompanyDelete = async (doc: CompanyDocument) => {
    if (!confirm(`Remove "${doc.title}" from all staff?`)) return;
    const { error: delError } = await deleteCompanyDocument(doc);
    if (delError) { setError('Failed to remove document'); return; }
    setCompanyDocs(prev => prev.filter(d => d.id !== doc.id));
    setSuccess('Document removed');
    setTimeout(() => setSuccess(''), 3000);
  };

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
      if (typesResult.data) setDocumentTypes(typesResult.data.sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)));
      
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

  const handleToggleStaffVisibility = async (docType: DocumentType) => {
    setSavingVisibility(docType.id);
    const { error } = await updateDocumentTypeStaffVisibility(docType.id, !docType.show_to_staff);
    if (error) {
      setError('Failed to update staff visibility');
    } else {
      setDocumentTypes(prev =>
        prev.map(dt => dt.id === docType.id ? { ...dt, show_to_staff: !dt.show_to_staff } : dt)
      );
    }
    setSavingVisibility(null);
  };

  const handleToggleRequired = async (docType: DocumentType) => {
    setSavingRequired(docType.id);
    const { error } = await updateDocumentTypeRequired(docType.id, !docType.is_required);
    if (error) {
      setError('Failed to update mandatory status');
    } else {
      setDocumentTypes(prev =>
        prev.map(dt => dt.id === docType.id ? { ...dt, is_required: !dt.is_required } : dt)
      );
    }
    setSavingRequired(null);
  };

  const handlePreview = async (doc: EmployeeDocument) => {
    setPreviewDoc(doc);
    setPreviewUrl(null);
    setPreviewLoading(true);
    const { data: url } = await getDocumentDownloadUrl(doc.file_path);
    setPreviewUrl(url || null);
    setPreviewLoading(false);
  };

  const closePreview = () => {
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  // Build per-employee compliance data from loaded documents + required types
  const getComplianceData = () => {
    const requiredTypes = documentTypes.filter(dt => dt.is_required);
    return allEmployees.map(emp => {
      const empDocs = documents.filter(d => d.user_id === emp.id);
      const submittedTypes = new Set(empDocs.map(d => d.document_type));
      const submitted = requiredTypes.filter(dt => submittedTypes.has(dt.name));
      const missing   = requiredTypes.filter(dt => !submittedTypes.has(dt.name));
      const pct = requiredTypes.length > 0 ? Math.round((submitted.length / requiredTypes.length) * 100) : 100;
      return { emp, submitted, missing, total: requiredTypes.length, pct, totalUploaded: empDocs.length };
    }).sort((a, b) => a.pct - b.pct); // worst compliance first
  };

  const handleOpenUploadModal = () => {
    console.log('Opening upload modal. Available employees:', allEmployees.length, allEmployees);
    setSelectedUploadEmployee('');
    setUploadDocType('');
    setUploadFile(null);
    setUploadDocLabel('');
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

    documentTypes.find(dt => dt.name === uploadDocType); // existence check, result unused

    setUploading(true);
    setError('');

    const { error: uploadError } = await uploadEmployeeDocument({
      user_id: selectedUploadEmployee,
      document_type: uploadDocType,
      document_name: uploadDocLabel.trim() || uploadFile.name,
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
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main" style={{ padding: '2rem' }}>
    <div className="admin-documents-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-900)', margin: 0 }}>📁 Employee Documents</h1>
            <p>Manage and verify all employee documentation</p>
          </div>
          <NotificationBell />
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
          <button
            className={`tab-button ${activeTab === 'staff_settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff_settings')}
          >
            👁️ Staff Upload Settings
          </button>
          <button
            className={`tab-button ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => setActiveTab('compliance')}
          >
            📊 Staff Compliance
          </button>
          <button
            className={`tab-button ${activeTab === 'company' ? 'active' : ''}`}
            onClick={() => setActiveTab('company')}
          >
            🏢 Company Documents
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
            {Array.from(new Set(documentTypes.map(dt => dt.category))).map(cat => (
              <optgroup key={cat} label={cat}>
                {documentTypes.filter(dt => dt.category === cat).map(dt => (
                  <option key={dt.id} value={dt.name}>{dt.display_name}</option>
                ))}
              </optgroup>
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
                          onClick={() => handlePreview(doc)}
                          title="View"
                        >
                          👁️
                        </button>
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

          {Array.from(new Set(documentTypes.map(dt => dt.category))).map(cat => (
            <div key={cat} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', paddingBottom: '0.4rem', borderBottom: '2px solid #e2e8f0' }}>
                {cat}
              </h3>
              <div className="types-grid">
                {documentTypes.filter(dt => dt.category === cat).map(docType => (
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
                      <label
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500, color: docType.is_required ? '#b45309' : '#64748b' }}
                        title="Toggle whether this document is mandatory for all employees"
                      >
                        <div
                          onClick={() => savingRequired !== docType.id && handleToggleRequired(docType)}
                          style={{
                            width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                            background: docType.is_required ? '#f59e0b' : '#d1d5db',
                            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                            opacity: savingRequired === docType.id ? 0.5 : 1
                          }}
                        >
                          <div style={{
                            position: 'absolute', top: 2, left: docType.is_required ? 18 : 2,
                            width: 16, height: 16, borderRadius: '50%', background: 'white',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s'
                          }} />
                        </div>
                        Mandatory
                      </label>
                      <button className="btn btn-sm btn-secondary" onClick={() => handleEditDocType(docType)}>
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
          ))}
        </div>
      )}

      {/* Staff Upload Settings Tab */}
      {activeTab === 'staff_settings' && (
        <div>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ margin: '0 0 0.4rem' }}>Staff Upload Settings</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
              Toggle which document types are visible to staff in their <strong>My Documents</strong> upload section.
              Unchecked types are hidden from staff but remain accessible to HR for admin uploads.
            </p>
          </div>

          {/* Summary badges */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <span style={{ background: '#d1fae5', color: '#065f46', padding: '4px 12px', borderRadius: 9999, fontSize: '0.85rem', fontWeight: 600 }}>
              ✅ {documentTypes.filter(dt => dt.show_to_staff).length} visible to staff
            </span>
            <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 12px', borderRadius: 9999, fontSize: '0.85rem', fontWeight: 600 }}>
              🚫 {documentTypes.filter(dt => !dt.show_to_staff).length} hidden from staff
            </span>
            <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 12px', borderRadius: 9999, fontSize: '0.85rem', fontWeight: 600 }}>
              ⚠️ {documentTypes.filter(dt => dt.is_required).length} mandatory
            </span>
          </div>

          {Array.from(new Set(documentTypes.map(dt => dt.category))).map(cat => (
            <div key={cat} style={{ marginBottom: '1.5rem', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              {/* Category header */}
              <div style={{ background: '#f8fafc', padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{cat}</span>
                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                  <span>{documentTypes.filter(dt => dt.category === cat && dt.show_to_staff).length}/{documentTypes.filter(dt => dt.category === cat).length} shown to staff</span>
                  <span>{documentTypes.filter(dt => dt.category === cat && dt.is_required).length}/{documentTypes.filter(dt => dt.category === cat).length} mandatory</span>
                </div>
              </div>

              {/* Document type rows */}
              <div style={{ padding: '0.5rem 0' }}>
                {documentTypes.filter(dt => dt.category === cat).map(dt => (
                  <div
                    key={dt.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                      padding: '0.65rem 1rem',
                      background: dt.show_to_staff ? 'white' : '#fafafa',
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s'
                    }}
                  >
                    {/* Show to staff toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                      <div
                        onClick={() => savingVisibility !== dt.id && handleToggleStaffVisibility(dt)}
                        title="Show to staff in My Documents"
                        style={{
                          width: 40, height: 22, borderRadius: 11, marginTop: 2,
                          background: dt.show_to_staff ? '#22c55e' : '#d1d5db',
                          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                          opacity: savingVisibility === dt.id ? 0.5 : 1
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 3, left: dt.show_to_staff ? 21 : 3,
                          width: 16, height: 16, borderRadius: '50%', background: 'white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.62rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>Staff visible</span>
                    </div>

                    {/* Mandatory toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                      <div
                        onClick={() => savingRequired !== dt.id && handleToggleRequired(dt)}
                        title="Mark as mandatory — shows in compliance tracker"
                        style={{
                          width: 40, height: 22, borderRadius: 11, marginTop: 2,
                          background: dt.is_required ? '#f59e0b' : '#d1d5db',
                          position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                          opacity: savingRequired === dt.id ? 0.5 : 1
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 3, left: dt.is_required ? 21 : 3,
                          width: 16, height: 16, borderRadius: '50%', background: 'white',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.62rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>Mandatory</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>
                          {dt.display_name}
                        </span>
                        {dt.is_required && (
                          <span style={{ fontSize: '0.7rem', background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 9999 }}>
                            Mandatory
                          </span>
                        )}
                        {dt.show_to_staff ? (
                          <span style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 9999 }}>
                            Visible to staff
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', background: '#f1f5f9', color: '#94a3b8', padding: '1px 6px', borderRadius: 9999 }}>
                            Hidden from staff
                          </span>
                        )}
                      </div>
                      {dt.description && (
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                          {dt.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Staff Compliance Tab */}
      {activeTab === 'compliance' && (() => {
        const complianceData = getComplianceData();
        const filtered = complianceData.filter(row =>
          `${row.emp.first_name} ${row.emp.last_name} ${row.emp.email}`
            .toLowerCase().includes(complianceSearch.toLowerCase())
        );
        const compliant    = complianceData.filter(r => r.pct === 100).length;
        const nonCompliant = complianceData.filter(r => r.pct < 100).length;

        return (
          <div>
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.35rem' }}>Staff Document Compliance</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                Tracks how many required documents each employee has submitted.
              </p>
            </div>

            {/* Summary */}
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{ background: '#d1fae5', padding: '0.6rem 1.25rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#065f46' }}>{compliant}</div>
                <div style={{ fontSize: '0.78rem', color: '#065f46' }}>Fully compliant</div>
              </div>
              <div style={{ background: '#fee2e2', padding: '0.6rem 1.25rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#991b1b' }}>{nonCompliant}</div>
                <div style={{ fontSize: '0.78rem', color: '#991b1b' }}>Missing documents</div>
              </div>
              <div style={{ background: '#f1f5f9', padding: '0.6rem 1.25rem', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b' }}>{documentTypes.filter(dt => dt.is_required).length}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Required doc types</div>
              </div>
            </div>

            <input
              type="text"
              placeholder="Search employee…"
              value={complianceSearch}
              onChange={e => setComplianceSearch(e.target.value)}
              className="search-input"
              style={{ marginBottom: '1rem', maxWidth: 320 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filtered.map(row => {
                const isExpanded = expandedEmployee === row.emp.id;
                const barColor   = row.pct === 100 ? '#22c55e' : row.pct >= 60 ? '#f59e0b' : '#ef4444';

                return (
                  <div key={row.emp.id} style={{ border: `1px solid ${row.pct === 100 ? '#bbf7d0' : row.pct >= 60 ? '#fde68a' : '#fecaca'}`, borderRadius: '10px', overflow: 'hidden', background: 'white' }}>
                    {/* Row header */}
                    <button
                      onClick={() => setExpandedEmployee(isExpanded ? null : row.emp.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      {/* Avatar */}
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#4338ca', flexShrink: 0, fontSize: '0.875rem' }}>
                        {row.emp.first_name?.[0]}{row.emp.last_name?.[0]}
                      </div>

                      {/* Name + progress */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <strong style={{ color: '#1e293b', fontSize: '0.9rem' }}>{row.emp.first_name} {row.emp.last_name}</strong>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{row.emp.email}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e2e8f0', maxWidth: 200 }}>
                            <div style={{ width: `${row.pct}%`, height: '100%', borderRadius: 3, background: barColor, transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: barColor, whiteSpace: 'nowrap' }}>
                            {row.submitted.length}/{row.total} required
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            ({row.totalUploaded} total uploaded)
                          </span>
                        </div>
                      </div>

                      {/* Status badge */}
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '3px 10px', borderRadius: 9999, whiteSpace: 'nowrap', background: row.pct === 100 ? '#d1fae5' : row.pct >= 60 ? '#fef3c7' : '#fee2e2', color: row.pct === 100 ? '#065f46' : row.pct >= 60 ? '#92400e' : '#991b1b' }}>
                        {row.pct === 100 ? '✅ Complete' : `${row.missing.length} missing`}
                      </span>
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {/* Expanded: missing + submitted docs */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem', background: '#f8fafc' }}>
                        {row.missing.length > 0 && (
                          <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991b1b', marginBottom: '0.4rem' }}>
                              ❌ Missing required documents ({row.missing.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              {row.missing.map(dt => (
                                <span key={dt.id} style={{ fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 9999 }}>
                                  {dt.display_name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {row.submitted.length > 0 && (
                          <div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#065f46', marginBottom: '0.4rem' }}>
                              ✅ Submitted required documents ({row.submitted.length})
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              {row.submitted.map(dt => (
                                <span key={dt.id} style={{ fontSize: '0.78rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 9999 }}>
                                  {dt.display_name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {row.missing.length === 0 && row.submitted.length === 0 && (
                          <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0 }}>No required documents configured.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No employees found.</div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Company Documents Tab */}
      {activeTab === 'company' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem' }}>Company Documents</h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>
                Upload policy documents, handbooks, forms and circulars visible to all staff.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setShowCompanyUpload(true)}>
              ➕ Upload Document
            </button>
          </div>

          {/* Upload Modal */}
          {showCompanyUpload && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: 520, padding: '2rem', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <h3 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem' }}>📤 Publish Document to All Staff</h3>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Title *</label>
                  <input
                    className="form-input"
                    value={companyTitle}
                    onChange={e => setCompanyTitle(e.target.value)}
                    placeholder="e.g. Leave Policy 2025"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Category</label>
                  <select className="form-input" value={companyCategory} onChange={e => setCompanyCategory(e.target.value)}>
                    {COMPANY_DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={companyDescription}
                    onChange={e => setCompanyDescription(e.target.value)}
                    placeholder="Brief description (optional)"
                    style={{ resize: 'vertical' }}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label">File *</label>
                  <input
                    type="file"
                    className="form-input"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
                    onChange={e => setCompanyFile(e.target.files?.[0] || null)}
                  />
                  {companyFile && (
                    <small style={{ color: '#64748b' }}>
                      {companyFile.name} ({formatFileSize(companyFile.size)})
                    </small>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => setShowCompanyUpload(false)} disabled={companyUploading}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={handleCompanyUpload} disabled={companyUploading || !companyFile || !companyTitle.trim()}>
                    {companyUploading ? 'Publishing…' : '📤 Publish to All Staff'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {companyLoading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Loading…</div>
          ) : companyDocs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', border: '2px dashed #e2e8f0', borderRadius: '12px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🏢</div>
              <p style={{ margin: 0, fontWeight: 600 }}>No company documents published yet</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>Upload policies, handbooks, or forms for all staff to access.</p>
            </div>
          ) : (
            <div>
              {/* Group by category */}
              {Array.from(new Set(companyDocs.map(d => d.category))).map(cat => (
                <div key={cat} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', paddingBottom: '0.35rem', borderBottom: '2px solid #e2e8f0' }}>
                    {cat}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {companyDocs.filter(d => d.category === cat).map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.875rem 1rem' }}>
                        <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                          {doc.mime_type?.includes('pdf') ? '📕' : doc.mime_type?.includes('word') || doc.mime_type?.includes('document') ? '📘' : doc.mime_type?.includes('sheet') || doc.mime_type?.includes('excel') ? '📗' : '📄'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{doc.title}</div>
                          {doc.description && (
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.1rem' }}>{doc.description}</div>
                          )}
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                            {doc.file_name} · {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {doc.uploader && ` · Uploaded by ${doc.uploader.first_name} ${doc.uploader.last_name}`}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleCompanyView(doc)}
                          >
                            👁 View
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleCompanyDelete(doc)}
                          >
                            🗑 Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div
          onClick={closePreview}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'white', borderRadius: '14px', width: '90%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.5)' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <span style={{ fontSize: '1.25rem' }}>{previewDoc.mime_type.includes('pdf') ? '📄' : previewDoc.mime_type.includes('image') ? '🖼️' : '📎'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewDoc.document_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  {previewDoc.user?.first_name} {previewDoc.user?.last_name} · {documentTypes.find(dt => dt.name === previewDoc.document_type)?.display_name || previewDoc.document_type} · {formatFileSize(previewDoc.file_size)}
                  {previewDoc.is_verified && <span style={{ marginLeft: 8, color: '#059669' }}>✓ Verified</span>}
                </div>
              </div>
              <button
                onClick={() => previewUrl && window.open(previewUrl, '_blank')}
                style={{ padding: '6px 14px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.825rem', fontWeight: 600 }}
              >
                📥 Download
              </button>
              <button
                onClick={closePreview}
                style={{ width: 34, height: 34, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '1.25rem', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >✕</button>
            </div>

            {/* Preview body */}
            <div style={{ flex: 1, overflow: 'hidden', background: '#1e1e1e', minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewLoading ? (
                <div style={{ color: '#94a3b8', textAlign: 'center' }}>
                  <div className="loading-spinner" style={{ margin: '0 auto 0.75rem' }} />
                  <p>Loading preview…</p>
                </div>
              ) : !previewUrl ? (
                <div style={{ color: '#ef4444', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.5rem' }}>⚠️</p>
                  <p>Could not load preview</p>
                </div>
              ) : previewDoc.mime_type.includes('pdf') ? (
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '75vh', border: 'none' }}
                  title={previewDoc.document_name}
                />
              ) : previewDoc.mime_type.includes('image') ? (
                <img
                  src={previewUrl}
                  alt={previewDoc.document_name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>
                  <p style={{ fontSize: '2rem' }}>📎</p>
                  <p style={{ fontWeight: 600, color: '#e2e8f0' }}>Preview not available for this file type</p>
                  <p style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>Word/Excel documents cannot be previewed in the browser.</p>
                  <button
                    onClick={() => window.open(previewUrl!, '_blank')}
                    style={{ padding: '8px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    📥 Download to View
                  </button>
                </div>
              )}
            </div>
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
                  <option value="">Select document type…</option>
                  {Array.from(new Set(documentTypes.filter(dt => dt.is_active).map(dt => dt.category))).map(cat => (
                    <optgroup key={cat} label={cat}>
                      {documentTypes.filter(dt => dt.is_active && dt.category === cat).map(dt => (
                        <option key={dt.id} value={dt.name}>
                          {dt.display_name}{dt.is_required ? ' *' : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ color: '#374151', fontWeight: 500, marginBottom: '8px', display: 'block' }}>
                  Document Label <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={uploadDocLabel}
                  onChange={e => setUploadDocLabel(e.target.value)}
                  className="form-control"
                  placeholder="e.g. Bachelor's Degree, KCSE Certificate… (defaults to file name)"
                  maxLength={120}
                  style={{ color: '#111827', background: '#ffffff' }}
                />
                <small style={{ color: '#6b7280', display: 'block', marginTop: '4px' }}>
                  Use a descriptive label when uploading multiple files of the same type
                </small>
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
                    Expiry Date <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
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
      </div>
    </div>
  );
};
