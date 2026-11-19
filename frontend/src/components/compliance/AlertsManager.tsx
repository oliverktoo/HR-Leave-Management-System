import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, Filter, RefreshCw, Bell, X } from 'lucide-react';
import {
  getComplianceAlerts,
  acknowledgeAlert,
  resolveAlert,
  generateComplianceAlerts
} from '@/services/complianceService';
import { ComplianceAlert, ComplianceAlertFilters } from '@/types/fleetPhase3';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 bg-red-50',
  high: 'border-orange-500 bg-orange-50',
  medium: 'border-yellow-500 bg-yellow-50',
  low: 'border-blue-500 bg-blue-50'
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800'
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-red-100 text-red-800',
  acknowledged: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-800'
};

export const AlertsManager: React.FC = () => {
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [resolutionNote, setResolutionNote] = useState<{ id: string; note: string } | null>(null);
  const [filters, setFilters] = useState<ComplianceAlertFilters>({ status: 'active' });
  const [showFilters, setShowFilters] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, [filters]);

  const loadAlerts = async () => {
    setIsLoading(true);
    try {
      const data = await getComplianceAlerts(filters);
      setAlerts(data);
    } catch (error) {
      console.error('Failed to load compliance alerts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id);
      showFeedback('Alert acknowledged.');
      loadAlerts();
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolve = async (id: string, note?: string) => {
    try {
      await resolveAlert(id, note);
      setResolutionNote(null);
      showFeedback('Alert resolved.');
      loadAlerts();
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  const handleGenerateAlerts = async () => {
    setIsGenerating(true);
    try {
      const result = await generateComplianceAlerts();
      showFeedback(`Generated ${result.alerts_created} new alert${result.alerts_created !== 1 ? 's' : ''}.`);
      loadAlerts();
    } catch (error) {
      console.error('Failed to generate alerts:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const criticalCount = alerts.filter(a => a.alert_priority === 'critical').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="card-title">Compliance Alerts</h2>
          {!isLoading && (
            <p className="text-muted text-sm">
              {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
              {activeCount > 0 && ` — ${activeCount} active`}
              {criticalCount > 0 && `, ${criticalCount} critical`}
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-outline"
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          <button className="btn btn-outline" onClick={loadAlerts}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerateAlerts}
            disabled={isGenerating}
          >
            <Bell className="w-4 h-4 mr-2" />
            {isGenerating ? 'Generating...' : 'Run Compliance Check'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className="alert alert-success flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          {feedback}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="card card-body">
          <div className="flex gap-4 flex-wrap">
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status || ''}
                onChange={e => setFilters((f: ComplianceAlertFilters) => ({ ...f, status: (e.target.value as ComplianceAlert['status']) || undefined }))}
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Priority</label>
              <select
                className="form-select"
                value={filters.alert_priority || ''}
                onChange={e => setFilters((f: ComplianceAlertFilters) => ({ ...f, alert_priority: (e.target.value as ComplianceAlert['alert_priority']) || undefined }))}
              >
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Type</label>
              <select
                className="form-select"
                value={filters.alert_type || ''}
                onChange={e => setFilters((f: ComplianceAlertFilters) => ({ ...f, alert_type: (e.target.value as ComplianceAlert['alert_type']) || undefined }))}
              >
                <option value="">All types</option>
                <option value="license_expiry">License Expiry</option>
                <option value="vehicle_document_expiry">Document Expiry</option>
                <option value="maintenance_due">Maintenance Due</option>
                <option value="insurance_expiry">Insurance Expiry</option>
                <option value="registration_expiry">Registration Expiry</option>
                <option value="service_overdue">Service Overdue</option>
              </select>
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label className="form-label">Due Before</label>
              <input
                type="date"
                className="form-input"
                value={filters.due_before || ''}
                onChange={e => setFilters((f: ComplianceAlertFilters) => ({ ...f, due_before: e.target.value || undefined }))}
              />
            </div>
            <div className="flex items-end">
              <button
                className="btn btn-outline"
                onClick={() => setFilters({ status: 'active' })}
              >
                <X className="w-4 h-4 mr-1" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolution note modal */}
      {resolutionNote && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="card-header">
              <h3 className="card-title">Resolve Alert</h3>
            </div>
            <div className="card-body space-y-4">
              <div className="form-group">
                <label className="form-label">Resolution Notes (optional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={resolutionNote.note}
                  onChange={e => setResolutionNote(r => r ? { ...r, note: e.target.value } : r)}
                  placeholder="Describe how this was resolved..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn btn-outline" onClick={() => setResolutionNote(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => handleResolve(resolutionNote.id, resolutionNote.note || undefined)}>
                  Mark Resolved
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted">Loading alerts...</div>
      ) : alerts.length === 0 ? (
        <div className="alert alert-success flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          <p>No alerts match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <div
              key={alert.id}
              className={`border-l-4 p-4 rounded-r-md ${PRIORITY_COLORS[alert.alert_priority] || 'border-gray-300 bg-gray-50'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${PRIORITY_BADGE[alert.alert_priority]}`}>
                      {alert.alert_priority}
                    </span>
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full capitalize ${STATUS_BADGE[alert.status]}`}>
                      {alert.status}
                    </span>
                    <span className="text-xs text-gray-500 capitalize">
                      {alert.alert_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h4 className="font-medium text-sm mb-1">{alert.title}</h4>
                  {alert.description && (
                    <p className="text-sm text-gray-600 mb-2">{alert.description}</p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                    {(alert as any).vehicle && (
                      <span>
                        🚗 {(alert as any).vehicle.make} {(alert as any).vehicle.model} ({(alert as any).vehicle.plate_number})
                      </span>
                    )}
                    {(alert as any).driver && (
                      <span>👤 {(alert as any).driver.first_name} {(alert as any).driver.last_name}</span>
                    )}
                    {alert.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Due: {new Date(alert.due_date).toLocaleDateString()}
                        {alert.days_until_due !== null && alert.days_until_due !== undefined && (
                          <span className={alert.days_until_due <= 0 ? 'text-red-600 font-medium' : ''}>
                            {alert.days_until_due <= 0
                              ? ` (${Math.abs(alert.days_until_due)} days overdue)`
                              : ` (${alert.days_until_due} days)`}
                          </span>
                        )}
                      </span>
                    )}
                    {alert.resolution_notes && (
                      <span className="text-green-700">Note: {alert.resolution_notes}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {alert.status === 'active' && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleAcknowledge(alert.id)}
                    >
                      Acknowledge
                    </button>
                  )}
                  {(alert.status === 'active' || alert.status === 'acknowledged') && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setResolutionNote({ id: alert.id, note: '' })}
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
