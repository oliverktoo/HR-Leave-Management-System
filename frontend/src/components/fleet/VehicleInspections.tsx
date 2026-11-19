// Vehicle Inspections Component
// Create and manage pre-trip, post-trip, periodic, and incident inspections

import { useState, useEffect } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getVehicleInspections,
  createVehicleInspection,
} from '../../services/fleetPhase2Service';
import { getVehicles } from '../../services/fleetService';
import {
  VehicleInspection,
  CreateInspectionInput,
  InspectionType,
  InspectionStatus,
  InspectionChecklist,
  InspectionsFilters,
} from '../../types/fleetPhase2';
import { FleetVehicle } from '../../types/fleet';

const DEFAULT_CHECKLIST_ITEMS = [
  'tyres', 'brakes', 'lights', 'mirrors', 'fuel_level',
  'engine_oil', 'coolant', 'windshield', 'wipers', 'horn',
  'seat_belts', 'first_aid_kit', 'fire_extinguisher', 'reflectors',
];

const CHECKLIST_LABELS: Record<string, string> = {
  tyres: 'Tyres',
  brakes: 'Brakes',
  lights: 'Lights (headlights, tail, indicators)',
  mirrors: 'Mirrors',
  fuel_level: 'Fuel Level',
  engine_oil: 'Engine Oil',
  coolant: 'Coolant Level',
  windshield: 'Windshield (no cracks)',
  wipers: 'Windshield Wipers',
  horn: 'Horn',
  seat_belts: 'Seat Belts',
  first_aid_kit: 'First Aid Kit',
  fire_extinguisher: 'Fire Extinguisher',
  reflectors: 'Reflectors / Warning Triangles',
};

const blankChecklist = (): InspectionChecklist => {
  const c: InspectionChecklist = {};
  DEFAULT_CHECKLIST_ITEMS.forEach(item => { c[item] = { status: 'pass' }; });
  return c;
};

export function VehicleInspections() {
  const [inspections, setInspections] = useState<VehicleInspection[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Filters
  const [filterVehicle, setFilterVehicle] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [inspectionType, setInspectionType] = useState<InspectionType>('pre_trip');
  const [odometer, setOdometer] = useState('');
  const [checklist, setChecklist] = useState<InspectionChecklist>(blankChecklist);
  const [issuesFound, setIssuesFound] = useState('');
  const [damageReported, setDamageReported] = useState(false);
  const [damageDescription, setDamageDescription] = useState('');
  const [requiresMaintenance, setRequiresMaintenance] = useState(false);
  const [maintenancePriority, setMaintenancePriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [notes, setNotes] = useState('');

  // Detail modal
  const [selectedInspection, setSelectedInspection] = useState<VehicleInspection | null>(null);

  useEffect(() => { loadData(); }, [filterVehicle, filterType, filterStatus]);

  const loadData = async () => {
    try {
      setLoading(true);
      const filters: InspectionsFilters = {};
      if (filterVehicle) filters.vehicle_id = filterVehicle;
      if (filterType) filters.inspection_type = filterType as InspectionType;
      if (filterStatus) filters.overall_status = filterStatus as InspectionStatus;
      const [inspData, vehData] = await Promise.all([getVehicleInspections(filters), getVehicles()]);
      setInspections(inspData);
      setVehicles(vehData);
    } catch (err) {
      setError('Failed to load inspections');
    } finally {
      setLoading(false);
    }
  };

  const computeOverallStatus = (): InspectionStatus => {
    const items = Object.values(checklist);
    if (items.some(i => i.status === 'fail')) return 'fail';
    if (items.some(i => i.notes?.trim()) || issuesFound.trim()) return 'pass_with_notes';
    return 'pass';
  };

  const handleChecklistChange = (item: string, status: 'pass' | 'fail' | 'na') => {
    setChecklist(prev => ({ ...prev, [item]: { ...prev[item], status } }));
  };

  const handleSubmit = async () => {
    if (!vehicleId || !odometer) {
      setError('Please select a vehicle and enter the odometer reading');
      return;
    }
    try {
      setProcessing(true); setError(null);
      const input: CreateInspectionInput = {
        vehicle_id: vehicleId,
        inspection_type: inspectionType,
        odometer_reading: parseFloat(odometer),
        checklist,
        overall_status: computeOverallStatus(),
        issues_found: issuesFound.trim()
          ? issuesFound.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
        damage_reported: damageReported,
        damage_description: damageDescription || undefined,
        requires_maintenance: requiresMaintenance,
        maintenance_priority: requiresMaintenance ? maintenancePriority : undefined,
        notes: notes || undefined,
      };
      await createVehicleInspection(input);
      setSuccess('Inspection submitted successfully');
      resetForm();
      loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit inspection');
    } finally {
      setProcessing(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setVehicleId(''); setInspectionType('pre_trip'); setOdometer('');
    setIssuesFound(''); setDamageReported(false); setDamageDescription('');
    setRequiresMaintenance(false); setMaintenancePriority('normal'); setNotes('');
    setChecklist(blankChecklist());
  };

  const statusBadge = (status: InspectionStatus) => {
    const map: Record<InspectionStatus, { label: string; cls: string }> = {
      pass:            { label: '✓ Pass',          cls: 'badge-success' },
      pass_with_notes: { label: '⚠ Pass w/ Notes', cls: 'badge-warning' },
      fail:            { label: '✗ Fail',           cls: 'badge-danger' },
    };
    const s = map[status] || { label: status, cls: 'badge-secondary' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const typeBadge = (type: InspectionType) => {
    const map: Record<InspectionType, { label: string; cls: string }> = {
      pre_trip:  { label: 'Pre-Trip',  cls: 'badge-info' },
      post_trip: { label: 'Post-Trip', cls: 'badge-secondary' },
      periodic:  { label: 'Periodic',  cls: 'badge-secondary' },
      incident:  { label: 'Incident',  cls: 'badge-danger' },
    };
    const s = map[type] || { label: type, cls: 'badge-secondary' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const total           = inspections.length;
  const passed          = inspections.filter(i => i.overall_status === 'pass').length;
  const passedWithNotes = inspections.filter(i => i.overall_status === 'pass_with_notes').length;
  const failed          = inspections.filter(i => i.overall_status === 'fail').length;
  const needsMaint      = inspections.filter(i => i.requires_maintenance).length;

  // Priority badge colour
  const priorityClass: Record<string, string> = {
    critical: 'badge-danger', high: 'badge-warning', normal: 'badge-secondary', low: 'badge-info',
  };

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <div className="admin-container">

          {/* Page Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <h1>🔍 Vehicle Inspections</h1>
              <p className="page-subtitle">Pre-trip, post-trip, and periodic vehicle checks</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                + New Inspection
              </button>
              <NotificationBell />
            </div>
          </div>

          {error && (
            <div className="alert alert-error mb-4" onClick={() => setError(null)} style={{ cursor: 'pointer' }}>
              ⚠ {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success mb-4" onClick={() => setSuccess(null)} style={{ cursor: 'pointer' }}>
              ✓ {success}
            </div>
          )}

          {/* Stats */}
          <div className="stats-grid mb-4">
            <div className="stat-card">
              <div className="stat-value">{total}</div>
              <div className="stat-label">Total Inspections</div>
            </div>
            <div className="stat-card stat-card-success">
              <div className="stat-value">{passed}</div>
              <div className="stat-label">Passed</div>
            </div>
            <div className="stat-card stat-card-warning">
              <div className="stat-value">{passedWithNotes}</div>
              <div className="stat-label">Pass with Notes</div>
            </div>
            <div className="stat-card stat-card-danger">
              <div className="stat-value">{failed}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div className="stat-card stat-card-info">
              <div className="stat-value">{needsMaint}</div>
              <div className="stat-label">Needs Maintenance</div>
            </div>
          </div>

          {/* Filters */}
          <div className="filters-row">
            <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)} className="filter-select">
              <option value="">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>
              ))}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="filter-select">
              <option value="">All Types</option>
              <option value="pre_trip">Pre-Trip</option>
              <option value="post_trip">Post-Trip</option>
              <option value="periodic">Periodic</option>
              <option value="incident">Incident</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="filter-select">
              <option value="">All Statuses</option>
              <option value="pass">Pass</option>
              <option value="pass_with_notes">Pass with Notes</option>
              <option value="fail">Fail</option>
            </select>
          </div>

          {/* Inspection List */}
          {loading ? (
            <div className="loading-container"><div className="loading-spinner" /></div>
          ) : inspections.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No inspections found</h3>
              <p>Create your first inspection to get started</p>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Inspection</button>
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Vehicle</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Odometer</th>
                    <th>Inspector</th>
                    <th>Maintenance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {inspections.map(insp => (
                    <tr key={insp.id}>
                      <td className="text-sm">{new Date(insp.inspection_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>
                        {insp.vehicle ? (
                          <>
                            <strong>{insp.vehicle.plate_number}</strong>
                            <div className="text-muted text-sm">{insp.vehicle.make} {insp.vehicle.model}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td>{typeBadge(insp.inspection_type)}</td>
                      <td>{statusBadge(insp.overall_status)}</td>
                      <td>{insp.odometer_reading.toLocaleString()} km</td>
                      <td className="text-muted">{insp.inspector?.full_name || '—'}</td>
                      <td>
                        {insp.requires_maintenance ? (
                          <span className={`badge ${priorityClass[insp.maintenance_priority || 'normal'] || 'badge-secondary'}`}>
                            {insp.maintenance_priority || 'normal'}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => setSelectedInspection(insp)}>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── New Inspection Modal ─────────────────────────────────────── */}
          {showForm && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && resetForm()}>
              <div className="modal-content" style={{ maxWidth: '740px', maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header">
                  <h2>🔍 New Vehicle Inspection</h2>
                  <button className="modal-close" onClick={resetForm}>×</button>
                </div>
                <div className="modal-body">

                  {/* Basic Info */}
                  <div className="form-section">
                    <h3 className="form-section-title">Basic Information</h3>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">Vehicle *</label>
                        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="form-select">
                          <option value="">Select vehicle…</option>
                          {vehicles.map(v => (
                            <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Inspection Type *</label>
                        <select value={inspectionType} onChange={e => setInspectionType(e.target.value as InspectionType)} className="form-select">
                          <option value="pre_trip">Pre-Trip</option>
                          <option value="post_trip">Post-Trip</option>
                          <option value="periodic">Periodic</option>
                          <option value="incident">Incident</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Odometer Reading (km) *</label>
                        <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)}
                          className="form-input" placeholder="e.g. 45230" min="0" />
                      </div>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="form-section">
                    <h3 className="form-section-title">
                      Inspection Checklist
                      <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: '0.5rem' }}>
                        ({Object.values(checklist).filter(i => i.status === 'fail').length} fails,&nbsp;
                         {Object.values(checklist).filter(i => i.status === 'pass').length} pass)
                      </span>
                    </h3>
                    <div className="inspection-checklist">
                      {DEFAULT_CHECKLIST_ITEMS.map(item => (
                        <div key={item} className="checklist-item">
                          <span className="checklist-label">{CHECKLIST_LABELS[item] || item}</span>
                          <div className="checklist-options">
                            {(['pass', 'fail', 'na'] as const).map(status => (
                              <label key={status} className="checklist-radio">
                                <input
                                  type="radio"
                                  name={`cl-${item}`}
                                  value={status}
                                  checked={checklist[item]?.status === status}
                                  onChange={() => handleChecklistChange(item, status)}
                                />
                                <span className={`checklist-option checklist-${status}`}>
                                  {status === 'pass' ? '✓ Pass' : status === 'fail' ? '✗ Fail' : 'N/A'}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Issues & Damage */}
                  <div className="form-section">
                    <h3 className="form-section-title">Issues & Damage</h3>
                    <div className="form-group">
                      <label className="form-label">Issues Found <span className="text-muted">(one per line)</span></label>
                      <textarea value={issuesFound} onChange={e => setIssuesFound(e.target.value)}
                        className="form-textarea" placeholder="List any issues found…" rows={3} />
                    </div>
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={damageReported} onChange={e => setDamageReported(e.target.checked)} />
                        Damage Reported
                      </label>
                    </div>
                    {damageReported && (
                      <div className="form-group">
                        <label className="form-label">Damage Description</label>
                        <textarea value={damageDescription} onChange={e => setDamageDescription(e.target.value)}
                          className="form-textarea" placeholder="Describe the damage…" rows={2} />
                      </div>
                    )}
                  </div>

                  {/* Maintenance Flag */}
                  <div className="form-section">
                    <h3 className="form-section-title">Maintenance Required?</h3>
                    <div className="form-group">
                      <label className="checkbox-label">
                        <input type="checkbox" checked={requiresMaintenance} onChange={e => setRequiresMaintenance(e.target.checked)} />
                        This vehicle requires maintenance
                      </label>
                    </div>
                    {requiresMaintenance && (
                      <div className="form-group">
                        <label className="form-label">Priority</label>
                        <select value={maintenancePriority} onChange={e => setMaintenancePriority(e.target.value as any)} className="form-select">
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="form-group">
                    <label className="form-label">Additional Notes</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      className="form-textarea" placeholder="Any other observations…" rows={2} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={resetForm}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSubmit} disabled={processing}>
                    {processing ? 'Submitting…' : 'Submit Inspection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Detail Modal ─────────────────────────────────────────────── */}
          {selectedInspection && (
            <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedInspection(null)}>
              <div className="modal-content" style={{ maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto' }}>
                <div className="modal-header">
                  <h2>Inspection Details</h2>
                  <button className="modal-close" onClick={() => setSelectedInspection(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="detail-grid">
                    <div className="detail-row">
                      <span className="detail-label">Vehicle</span>
                      <span className="detail-value">
                        {selectedInspection.vehicle
                          ? `${selectedInspection.vehicle.plate_number} — ${selectedInspection.vehicle.make} ${selectedInspection.vehicle.model}`
                          : '—'}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Type</span>
                      <span className="detail-value">{typeBadge(selectedInspection.inspection_type)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Date & Time</span>
                      <span className="detail-value">{new Date(selectedInspection.inspection_datetime).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Odometer</span>
                      <span className="detail-value">{selectedInspection.odometer_reading.toLocaleString()} km</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Inspector</span>
                      <span className="detail-value">{selectedInspection.inspector?.full_name || '—'}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Overall Status</span>
                      <span className="detail-value">{statusBadge(selectedInspection.overall_status)}</span>
                    </div>
                  </div>

                  <h3 className="form-section-title mt-6">Checklist Results</h3>
                  <div className="inspection-checklist-readonly">
                    {Object.entries(selectedInspection.checklist).map(([item, result]) => (
                      <div key={item} className="checklist-item-readonly">
                        <span className="checklist-label">{CHECKLIST_LABELS[item] || item}</span>
                        <span className={`checklist-status checklist-${result.status}`}>
                          {result.status === 'pass' ? '✓ Pass' : result.status === 'fail' ? '✗ Fail' : 'N/A'}
                        </span>
                        {result.notes && <span className="checklist-notes">{result.notes}</span>}
                      </div>
                    ))}
                  </div>

                  {selectedInspection.issues_found && selectedInspection.issues_found.length > 0 && (
                    <>
                      <h3 className="form-section-title mt-6">Issues Found</h3>
                      <ul className="issues-list">
                        {selectedInspection.issues_found.map((issue, i) => (
                          <li key={i}>{issue}</li>
                        ))}
                      </ul>
                    </>
                  )}

                  {selectedInspection.damage_reported && (
                    <div className="alert alert-warning mt-4">
                      <strong>Damage Reported:</strong>{' '}
                      {selectedInspection.damage_description || 'No description provided'}
                    </div>
                  )}

                  {selectedInspection.requires_maintenance && (
                    <div className="alert alert-error mt-4" style={{ marginTop: '0.75rem' }}>
                      <strong>Maintenance Required</strong> — Priority:{' '}
                      <span className={`badge ${priorityClass[selectedInspection.maintenance_priority || 'normal']}`}>
                        {selectedInspection.maintenance_priority || 'normal'}
                      </span>
                    </div>
                  )}

                  {selectedInspection.notes && (
                    <div className="mt-4" style={{ padding: '0.75rem 1rem', background: '#f9fafb', borderRadius: '8px', fontSize: '0.875rem' }}>
                      <strong>Notes:</strong> {selectedInspection.notes}
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setSelectedInspection(null)}>Close</button>
                </div>
              </div>
            </div>
          )}

        </div>{/* admin-container */}
      </div>
    </div>
  );
}
