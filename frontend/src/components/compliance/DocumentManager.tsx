import React, { useState, useEffect } from 'react';
import { FileText, Upload, Eye, Trash2, AlertTriangle, CheckCircle, Clock, XCircle, Plus } from 'lucide-react';
import {
  getVehicleDocuments,
  createVehicleDocument,
  updateVehicleDocument,
  deleteVehicleDocument,
  uploadDocumentFile
} from '@/services/complianceService';
import { VehicleDocument, CreateVehicleDocumentInput, UpdateVehicleDocumentInput, VehicleDocumentFilters } from '@/types/fleetPhase3';

interface DocumentManagerProps {
  vehicleId?: string;
  showAllVehicles?: boolean;
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
  vehicleId,
  showAllVehicles = false
}) => {
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<VehicleDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<VehicleDocument | null>(null);
  const [filters, setFilters] = useState<VehicleDocumentFilters>({});

  useEffect(() => {
    loadDocuments();
  }, [vehicleId, showAllVehicles]);

  useEffect(() => {
    applyFilters();
  }, [documents, filters]);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const docs = await getVehicleDocuments(vehicleId ? { vehicle_id: vehicleId } : undefined);
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to load vehicle documents.', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...documents];

    if (filters.document_type) {
      filtered = filtered.filter(doc => doc.document_type === filters.document_type);
    }
    if (filters.document_status) {
      filtered = filtered.filter(doc => doc.document_status === filters.document_status);
    }
    if (filters.expiry_before) {
      const before = filters.expiry_before;
      filtered = filtered.filter(doc => doc.expiry_date && doc.expiry_date <= before);
    }
    if (filters.expiry_after) {
      const after = filters.expiry_after;
      filtered = filtered.filter(doc => doc.expiry_date && doc.expiry_date >= after);
    }

    setFilteredDocuments(filtered);
  };

  const handleCreateDocument = async (input: CreateVehicleDocumentInput | UpdateVehicleDocumentInput) => {
    try {
      const newDoc = await createVehicleDocument(input as CreateVehicleDocumentInput);
      setDocuments(prev => [...prev, newDoc]);
      setIsCreateDialogOpen(false);
      console.log('Vehicle document created successfully.');
    } catch (error) {
      console.error('Failed to create vehicle document.', error);
    }
  };

  const handleUpdateDocument = async (input: CreateVehicleDocumentInput | UpdateVehicleDocumentInput) => {
    try {
      const updatedDoc = await updateVehicleDocument(input as UpdateVehicleDocumentInput);
      setDocuments(prev => prev.map(doc => doc.id === (input as UpdateVehicleDocumentInput).id ? updatedDoc : doc));
      setIsEditDialogOpen(false);
      console.log('Vehicle document updated successfully.');
    } catch (error) {
      console.error('Failed to update vehicle document.', error);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await deleteVehicleDocument(id);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      console.log('Vehicle document deleted successfully.');
    } catch (error) {
      console.error('Failed to delete vehicle document.', error);
    }
  };

  const getDocumentStatusBadge = (doc: VehicleDocument) => {
    if (!doc.expiry_date) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">No Expiry</span>;
    }

    const daysUntilExpiry = Math.ceil((new Date(doc.expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    if (daysUntilExpiry < 0) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Expired</span>;
    } else if (daysUntilExpiry <= 7) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800"><AlertTriangle className="w-3 h-3 mr-1" />Expires Soon</span>;
    } else if (daysUntilExpiry <= 30) {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Expires Soon</span>;
    } else {
      return <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Valid</span>;
    }
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'registration':
        return '📋';
      case 'insurance':
        return '🛡️';
      case 'inspection':
        return '🔍';
      case 'maintenance':
        return '🔧';
      case 'permit':
        return '📄';
      default:
        return '📄';
    }
  };

  const getDaysUntilExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  };

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span className="inline-flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Vehicle Document Manager
          </span>
        </h2>
        <button
          className="btn btn-primary"
          onClick={() => setIsCreateDialogOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Document
        </button>
      </div>

      <div className="card-body">
        {showAllVehicles && (
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <label className="form-label">Document Type</label>
              <input
                list="document-types"
                className="form-input"
                value={filters.document_type || ''}
                onChange={(e) => setFilters((prev: VehicleDocumentFilters) => ({ ...prev, document_type: (e.target.value as VehicleDocument['document_type']) || undefined }))}
                placeholder="Type or select a document type"
              />
              <datalist id="document-types">
                <option value="registration" />
                <option value="insurance" />
                <option value="inspection" />
                <option value="maintenance" />
                <option value="permit" />
              </datalist>
            </div>
            <div className="flex-1">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.document_status || ''}
                onChange={(e) => setFilters((prev: VehicleDocumentFilters) => ({ ...prev, document_status: (e.target.value as VehicleDocument['document_status']) || undefined }))}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="pending">Pending</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-4">Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="alert alert-success">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-green-600" />
              <p>{documents.length === 0 ? 'No documents found.' : 'No documents match the current filters.'}</p>
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Document Number</th>
                  {showAllVehicles && <th>Vehicle</th>}
                  <th>Issue Date</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td className="flex items-center gap-2">
                      <span>{getDocumentTypeIcon(doc.document_type)}</span>
                      <span className="capitalize">{doc.document_type}</span>
                    </td>
                    <td>{doc.document_number}</td>
                    {showAllVehicles && (
                      <td>
                        {doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model} (${doc.vehicle.plate_number})` : 'Unknown'}
                      </td>
                    )}
                    <td>{doc.issue_date ? new Date(doc.issue_date).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{doc.expiry_date ? new Date(doc.expiry_date).toLocaleDateString() : 'N/A'}</span>
                        {doc.expiry_date && getDaysUntilExpiry(doc.expiry_date)! <= 30 && (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDaysUntilExpiry(doc.expiry_date)! <= 7 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {getDaysUntilExpiry(doc.expiry_date)} days
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {getDocumentStatusBadge(doc)}
                        <span className="status-badge status-info">{doc.document_status}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {doc.document_url && (
                          <button className="text-indigo-600 hover:text-indigo-900" onClick={() => window.open(doc.document_url, '_blank')}>
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="text-indigo-600 hover:text-indigo-900"
                          onClick={() => {
                            setSelectedDocument(doc);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-900" onClick={() => handleDeleteDocument(doc.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Document Modal */}
      {isCreateDialogOpen && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="card-header">
              <h3 className="card-title">Add Vehicle Document</h3>
            </div>
            <div className="card-body">
              <DocumentForm
                vehicleId={vehicleId}
                onSubmit={handleCreateDocument}
                onCancel={() => setIsCreateDialogOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {isEditDialogOpen && selectedDocument && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="card-header">
              <h3 className="card-title">Edit Vehicle Document</h3>
            </div>
            <div className="card-body">
              <DocumentForm
                document={selectedDocument}
                onSubmit={handleUpdateDocument}
                onCancel={() => setIsEditDialogOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DocumentFormProps {
  vehicleId?: string;
  document?: VehicleDocument;
  onSubmit: (input: CreateVehicleDocumentInput | UpdateVehicleDocumentInput) => Promise<void>;
  onCancel: () => void;
}

interface DocFormState {
  id?: string;
  vehicle_id: string;
  document_type: string;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  issuing_authority: string;
  document_status: string;
  document_url: string;
  verification_notes: string;
}

const DocumentForm: React.FC<DocumentFormProps> = ({ vehicleId, document, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<DocFormState>({
    ...(document ? { id: document.id } : {}),
    vehicle_id: vehicleId || document?.vehicle_id || '',
    document_type: document?.document_type || '',
    document_number: document?.document_number || '',
    issue_date: document?.issue_date || '',
    expiry_date: document?.expiry_date || '',
    issuing_authority: document?.issuing_authority || '',
    document_status: document?.document_status || 'active',
    document_url: document?.document_url || '',
    verification_notes: document?.verification_notes || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const handleFileUpload = async () => {
    if (!uploadedFile || !formData.vehicle_id) return;

    try {
      const result = await uploadDocumentFile(uploadedFile, formData.vehicle_id);
      if (result.success) {
        setFormData(prev => ({ ...prev, document_url: result.document_url ?? '' }));
        console.log('Document uploaded successfully.');
      } else {
        console.error('Failed to upload document.', result.error);
      }
    } catch (error) {
      console.error('Failed to upload document.', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        ...(formData.id ? { id: formData.id } : {}),
        vehicle_id: formData.vehicle_id,
        document_type: formData.document_type as VehicleDocument['document_type'],
        document_number: formData.document_number || undefined,
        issue_date: formData.issue_date || undefined,
        expiry_date: formData.expiry_date,
        issuing_authority: formData.issuing_authority || undefined,
        document_status: formData.document_status as VehicleDocument['document_status'],
        document_url: formData.document_url || undefined,
        verification_notes: formData.verification_notes || undefined
      };
      await onSubmit(payload as CreateVehicleDocumentInput | UpdateVehicleDocumentInput);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="form-group">
          <label htmlFor="document_type" className="form-label">
            Document Type *
          </label>
          <input
            id="document_type"
            list="document-types"
            value={formData.document_type}
            onChange={(e) => setFormData(prev => ({ ...prev, document_type: e.target.value }))}
            className="form-input"
            placeholder="Type or select a document type"
            required
          />
          <datalist id="document-types">
            <option value="registration" />
            <option value="insurance" />
            <option value="inspection" />
            <option value="maintenance" />
            <option value="permit" />
          </datalist>
        </div>

        <div className="form-group">
          <label htmlFor="document_number" className="form-label">
            Document Number *
          </label>
          <input
            id="document_number"
            type="text"
            className="form-input"
            value={formData.document_number}
            onChange={(e) => setFormData(prev => ({ ...prev, document_number: e.target.value }))}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="issue_date" className="form-label">
            Issue Date
          </label>
          <input
            id="issue_date"
            type="date"
            className="form-input"
            value={formData.issue_date}
            onChange={(e) => setFormData(prev => ({ ...prev, issue_date: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="expiry_date" className="form-label">
            Expiry Date
          </label>
          <input
            id="expiry_date"
            type="date"
            className="form-input"
            value={formData.expiry_date}
            onChange={(e) => setFormData(prev => ({ ...prev, expiry_date: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="issuing_authority" className="form-label">
            Issuing Authority
          </label>
          <input
            id="issuing_authority"
            type="text"
            className="form-input"
            value={formData.issuing_authority}
            onChange={(e) => setFormData(prev => ({ ...prev, issuing_authority: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="document_status" className="form-label">
            Status
          </label>
          <select
            id="document_status"
            value={formData.document_status}
            onChange={(e) => setFormData(prev => ({ ...prev, document_status: e.target.value }))}
            className="form-select"
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="document_url" className="block text-sm font-medium text-gray-700">
          Document URL
        </label>
        <div className="flex gap-2 mt-1">
          <input
            id="document_url"
            type="url"
            className="flex-1 border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            value={formData.document_url}
            onChange={(e) => setFormData(prev => ({ ...prev, document_url: e.target.value }))}
            placeholder="URL to document or upload file below"
          />
        </div>
      </div>

      <div>
        <label htmlFor="file_upload" className="block text-sm font-medium text-gray-700">
          Upload Document
        </label>
        <div className="flex gap-2 mt-1">
          <input
            id="file_upload"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
            className="border border-gray-300 rounded-md py-2 px-3"
          />
          <button
            type="button"
            onClick={handleFileUpload}
            disabled={!uploadedFile}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="verification_notes" className="block text-sm font-medium text-gray-700">
          Verification Notes
        </label>
        <input
          id="verification_notes"
          type="text"
          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          value={(formData as any).verification_notes || ''}
          onChange={(e) => setFormData(prev => ({ ...prev, verification_notes: e.target.value }))}
          placeholder="Additional verification notes"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : (document ? 'Update Document' : 'Create Document')}
        </button>
      </div>
    </form>
  );
};