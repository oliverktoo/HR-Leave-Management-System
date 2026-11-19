import React, { useState, useEffect } from 'react';
import { Calendar, Upload, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { getDriverLicense, updateDriverLicense, getExpiringDriverLicenses } from '@/services/complianceService';
import { DriverLicense, UpdateDriverLicenseInput } from '@/types/fleetPhase3';

interface LicenseTrackerProps {
  driverId?: string;
  showAllDrivers?: boolean;
}

export const LicenseTracker: React.FC<LicenseTrackerProps> = ({
  driverId,
  showAllDrivers = false
}) => {
  const [licenses, setLicenses] = useState<DriverLicense[]>([]);
  const [selectedLicense, setSelectedLicense] = useState<DriverLicense | null>(null);
  const [currentDriverId, setCurrentDriverId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expiringLicenses, setExpiringLicenses] = useState<Array<{
    driver_id: string;
    driver_name: string;
    license_number: string | null;
    license_expiry_date: string;
    days_until_expiry: number;
  }>>([]);

  useEffect(() => {
    if (showAllDrivers) {
      loadExpiringLicenses();
    } else if (driverId) {
      loadDriverLicense(driverId);
    }
  }, [driverId, showAllDrivers]);

  const loadDriverLicense = async (id: string) => {
    setIsLoading(true);
    try {
      const license = await getDriverLicense(id);
      if (license) {
        setLicenses([license]);
      }
    } catch (error) {
      console.error('Failed to load driver license information.', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadExpiringLicenses = async () => {
    setIsLoading(true);
    try {
      const expiring = await getExpiringDriverLicenses(30);
      setExpiringLicenses(expiring);
    } catch (error) {
      console.error('Failed to load expiring licenses.', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLicense = async (input: UpdateDriverLicenseInput) => {
    try {
      const updatedLicense = await updateDriverLicense(input);
      if (updatedLicense) {
        setLicenses([updatedLicense]);
        setIsEditDialogOpen(false);
        setCurrentDriverId(null);
        console.log('Driver license updated successfully.');
        if (showAllDrivers) {
          loadExpiringLicenses();
        }
      }
    } catch (error) {
      console.error('Failed to update driver license.', error);
    }
  };

  const getLicenseStatusBadge = (license: DriverLicense) => {
    if (!license.license_expiry_date) {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800">
          No License
        </span>
      );
    }

    const daysUntilExpiry = Math.ceil((new Date(license.license_expiry_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

    if (daysUntilExpiry < 0) {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          <XCircle className="w-3 h-3 mr-1" />
          Expired
        </span>
      );
    } else if (daysUntilExpiry <= 7) {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Expires Soon
        </span>
      );
    } else if (daysUntilExpiry <= 30) {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Expires Soon
        </span>
      );
    } else {
      return (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3 mr-1" />
          Valid
        </span>
      );
    }
  };

  const getDaysUntilExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  };

  if (showAllDrivers) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Driver License Expiry Tracker
          </h2>
        </div>

        <div className="card-body">
          {isLoading ? (
            <div className="text-center py-4">Loading...</div>
          ) : expiringLicenses.length === 0 ? (
            <div className="alert alert-success">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p>No driver licenses expiring in the next 30 days.</p>
              </div>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>License Number</th>
                    <th>Expiry Date</th>
                    <th>Days Until Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringLicenses.map((license) => (
                    <tr key={license.driver_id}>
                      <td>{license.driver_name}</td>
                      <td>{license.license_number || '—'}</td>
                      <td>{new Date(license.license_expiry_date).toLocaleDateString()}</td>
                      <td>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${license.days_until_expiry <= 7 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {license.days_until_expiry < 0 ? `${Math.abs(license.days_until_expiry)} days ago` : `${license.days_until_expiry} days`}
                        </span>
                      </td>
                      <td>
                        {license.days_until_expiry < 0 ? (
                          <span className="status-badge status-rejected">Expired</span>
                        ) : license.days_until_expiry <= 7 ? (
                          <span className="status-badge status-pending">Critical</span>
                        ) : (
                          <span className="status-badge status-warning">Warning</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-outline"
                          onClick={() => {
                            setCurrentDriverId(license.driver_id);
                            loadDriverLicense(license.driver_id);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          Update
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isEditDialogOpen && (
          <LicenseEditForm
            license={licenses[0] || null}
            driverId={currentDriverId || ''}
            onSubmit={handleUpdateLicense}
            onCancel={() => { setIsEditDialogOpen(false); setCurrentDriverId(null); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {licenses.map((license, idx) => (
        <div key={license.license_number || idx} className="bg-white rounded-lg shadow-md">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold flex items-center justify-between">
              <span>Driver License Information</span>
              {getLicenseStatusBadge(license)}
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">License Number</label>
                <p className="mt-1 text-sm text-gray-900">{license.license_number || 'Not provided'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">License Type</label>
                <p className="mt-1 text-sm text-gray-900">{license.license_type || 'Not provided'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Issue Date</label>
                <p className="mt-1 text-sm text-gray-900">
                  {license.license_issue_date ? new Date(license.license_issue_date).toLocaleDateString() : 'Not provided'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Expiry Date</label>
                <p className="mt-1 text-sm text-gray-900">
                  {license.license_expiry_date ? new Date(license.license_expiry_date).toLocaleDateString() : 'Not provided'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Issuing Authority</label>
                <p className="mt-1 text-sm text-gray-900">{license.license_issuing_authority || 'Not provided'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1 text-sm text-gray-900">{license.license_status || 'Not provided'}</p>
              </div>
            </div>

            {license.license_expiry_date && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">Days Until Expiry</label>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getDaysUntilExpiry(license.license_expiry_date)! <= 30 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {getDaysUntilExpiry(license.license_expiry_date)} days
                  </span>
                  {getDaysUntilExpiry(license.license_expiry_date)! <= 30 && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={() => {
                  setSelectedLicense(license);
                  setCurrentDriverId(driverId || null);
                  setIsEditDialogOpen(true);
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                Update License
              </button>
            </div>
          </div>
        </div>
      ))}

      {isEditDialogOpen && (
        <LicenseEditForm
          license={selectedLicense}
          driverId={currentDriverId || driverId || ''}
          onSubmit={handleUpdateLicense}
          onCancel={() => { setIsEditDialogOpen(false); setSelectedLicense(null); }}
        />
      )}
    </div>
  );
};

interface LicenseEditFormProps {
  license: DriverLicense | null;
  driverId: string;
  onSubmit: (input: UpdateDriverLicenseInput) => Promise<void>;
  onCancel: () => void;
}

const LicenseEditForm: React.FC<LicenseEditFormProps> = ({ license, driverId, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<UpdateDriverLicenseInput>({
    user_id: driverId,
    license_number: license?.license_number || '',
    license_type: license?.license_type || undefined,
    license_issue_date: license?.license_issue_date || '',
    license_expiry_date: license?.license_expiry_date || '',
    license_issuing_authority: license?.license_issuing_authority || '',
    license_status: license?.license_status || 'active',
    license_document_url: license?.license_document_url || '',
    license_last_verified: license?.license_last_verified || '',
    license_notes: license?.license_notes || ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        <div className="mt-3">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Update Driver License</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="license_number" className="block text-sm font-medium text-gray-700">License Number</label>
                <input
                  id="license_number"
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_number: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="license_type" className="block text-sm font-medium text-gray-700">License Type</label>
                <select
                  id="license_type"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_type: (e.target.value as DriverLicense['license_type']) || undefined }))}
                >
                  <option value="">Select license type</option>
                  <option value="full">Full License</option>
                  <option value="provisional">Provisional License</option>
                  <option value="learner">Learner License</option>
                  <option value="heavy_vehicle">Heavy Vehicle License</option>
                </select>
              </div>
              <div>
                <label htmlFor="license_issue_date" className="block text-sm font-medium text-gray-700">Issue Date</label>
                <input
                  id="license_issue_date"
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_issue_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_issue_date: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="license_expiry_date" className="block text-sm font-medium text-gray-700">Expiry Date</label>
                <input
                  id="license_expiry_date"
                  type="date"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_expiry_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_expiry_date: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label htmlFor="license_issuing_authority" className="block text-sm font-medium text-gray-700">Issuing Authority</label>
                <input
                  id="license_issuing_authority"
                  type="text"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_issuing_authority}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_issuing_authority: e.target.value }))}
                />
              </div>
              <div>
                <label htmlFor="license_status" className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  id="license_status"
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.license_status}
                  onChange={(e) => setFormData(prev => ({ ...prev, license_status: e.target.value as DriverLicense['license_status'] }))}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="expired">Expired</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="license_document_url" className="block text-sm font-medium text-gray-700">Document URL</label>
              <input
                id="license_document_url"
                type="url"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.license_document_url}
                onChange={(e) => setFormData(prev => ({ ...prev, license_document_url: e.target.value }))}
                placeholder="URL to license document"
              />
            </div>
            <div>
              <label htmlFor="license_last_verified" className="block text-sm font-medium text-gray-700">Last Verified</label>
              <input
                id="license_last_verified"
                type="date"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.license_last_verified}
                onChange={(e) => setFormData(prev => ({ ...prev, license_last_verified: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="license_notes" className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                id="license_notes"
                rows={3}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={formData.license_notes}
                onChange={(e) => setFormData(prev => ({ ...prev, license_notes: e.target.value }))}
                placeholder="Additional notes"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Updating...' : 'Update License'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};