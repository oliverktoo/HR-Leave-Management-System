// Fleet Phase 4: Fleet Budget & TCO Management

import { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '../admin/AdminSidebar';
import NotificationBell from '../notifications/NotificationBell';
import {
  getFleetBudgets,
  createFleetBudget,
  updateFleetBudget,
  deleteFleetBudget,
  getBudgetActuals,
  getVehicleTCO,
  exportToCSV,
} from '../../services/fleetReportService';
import type { FleetBudget, CreateBudgetInput, BudgetActualRow, VehicleTCO, BudgetCategory } from '../../types/fleetPhase4';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmtKES = (v: number | null | undefined) =>
  v == null ? '—' : `KES ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtNum = (v: number | null | undefined, dp = 1) =>
  v == null ? '—' : Number(v).toFixed(dp);

type BudgetTab = 'budget' | 'tco';

interface BudgetFormState {
  department_id: string;
  category: BudgetCategory;
  budget_year: string;
  budget_month: string;
  budget_amount: string;
  notes: string;
}

const EMPTY_FORM: BudgetFormState = {
  department_id: '',
  category: 'fuel',
  budget_year: String(new Date().getFullYear()),
  budget_month: String(new Date().getMonth() + 1),
  budget_amount: '',
  notes: '',
};

export function FleetBudget() {
  const [activeTab, setActiveTab] = useState<BudgetTab>('budget');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // Budget state
  const [actuals, setActuals] = useState<BudgetActualRow[]>([]);
  const [budgets, setBudgets] = useState<FleetBudget[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BudgetFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // TCO state
  const [tcoData, setTcoData] = useState<VehicleTCO[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadBudgetData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [actualsData, budgetsData] = await Promise.all([
        getBudgetActuals(selectedYear, selectedMonth),
        getFleetBudgets(selectedYear, selectedMonth),
      ]);
      setActuals(actualsData);
      setBudgets(budgetsData);
    } catch (err) {
      console.error('Error loading budget data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  const loadTCO = useCallback(async () => {
    setIsLoading(true);
    try {
      setTcoData(await getVehicleTCO());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'budget') loadBudgetData();
    else loadTCO();
  }, [activeTab, loadBudgetData, loadTCO]);

  // KPI calculations
  const totalBudget = actuals.reduce((s, r) => s + r.budget_amount, 0);
  const totalActual = actuals.reduce((s, r) => s + r.actual_amount, 0);
  const totalVariance = totalBudget - totalActual;
  const pctUsed = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, budget_year: String(selectedYear), budget_month: String(selectedMonth) });
    setFormError(null);
    setShowForm(true);
  };

  const handleOpenEdit = (budget: FleetBudget) => {
    setEditingId(budget.id);
    setForm({
      department_id: budget.department_id ?? '',
      category: budget.category,
      budget_year: String(budget.budget_year),
      budget_month: String(budget.budget_month),
      budget_amount: String(budget.budget_amount),
      notes: budget.notes ?? '',
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.budget_amount || isNaN(parseFloat(form.budget_amount))) {
      setFormError('Please enter a valid budget amount.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const input: CreateBudgetInput = {
        department_id: form.department_id || undefined,
        category: form.category,
        budget_year: parseInt(form.budget_year),
        budget_month: parseInt(form.budget_month),
        budget_amount: parseFloat(form.budget_amount),
        notes: form.notes || undefined,
      };
      if (editingId) {
        await updateFleetBudget(editingId, input);
      } else {
        await createFleetBudget(input);
      }
      setShowForm(false);
      loadBudgetData();
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to save budget.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget entry?')) return;
    try {
      await deleteFleetBudget(id);
      loadBudgetData();
    } catch (err) {
      console.error('Error deleting budget:', err);
    }
  };

  const handleTCOExportCSV = () => {
    exportToCSV(
      ['Vehicle', 'Plate', 'Fuel Type', 'Tracked km', 'Fuel Cost(KES)', 'Maint Cost(KES)', 'Total(KES)', 'Cost/km', 'Age(months)'],
      tcoData.map(r => [r.make + ' ' + r.model, r.plate_number, r.fuel_type, r.tracked_km, r.total_fuel_cost, r.total_maintenance_cost, r.total_cost, r.cost_per_km, r.age_months]),
      `vehicle-tco-${new Date().toISOString().split('T')[0]}.csv`
    );
  };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <main className="admin-main">
        <div className="admin-container">

          <header className="admin-header">
            <div>
              <h1>💰 Budget & Cost Management</h1>
              <p className="admin-subtitle">Fleet budget tracking, actuals, and total cost of ownership</p>
            </div>
            <NotificationBell />
          </header>

          {/* Tab bar */}
          <div className="card mb-4">
            <div className="card-body" style={{ padding: '8px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setActiveTab('budget')} className={`btn ${activeTab === 'budget' ? 'btn-primary' : 'btn-outline'} btn-sm`}>
                  📊 Budget Management
                </button>
                <button onClick={() => setActiveTab('tco')} className={`btn ${activeTab === 'tco' ? 'btn-primary' : 'btn-outline'} btn-sm`}>
                  🚗 TCO Analysis
                </button>
              </div>
            </div>
          </div>

          {/* Budget Management Tab */}
          {activeTab === 'budget' && (
            <>
              {/* Period selector */}
              <div className="card mb-4">
                <div className="card-body">
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ minWidth: 120 }}>
                      <label className="form-label">Year</label>
                      <select className="form-select" value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ minWidth: 140 }}>
                      <label className="form-label">Month</label>
                      <select className="form-select" value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}>
                        {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleOpenCreate} style={{ marginBottom: 1 }}>
                      + Add Budget
                    </button>
                  </div>
                </div>
              </div>

              {/* KPI Cards */}
              <div className="dashboard-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="stats-card">
                  <p className="stats-title">Total Budget</p>
                  <p className="stats-value">{fmtKES(totalBudget)}</p>
                </div>
                <div className="stats-card">
                  <p className="stats-title">Total Actual</p>
                  <p className="stats-value">{fmtKES(totalActual)}</p>
                </div>
                <div className="stats-card">
                  <p className="stats-title">Variance</p>
                  <p className={`stats-value ${totalVariance < 0 ? 'text-danger' : 'text-success'}`}>{fmtKES(totalVariance)}</p>
                </div>
                <div className="stats-card">
                  <p className="stats-title">% Used</p>
                  <p className={`stats-value ${pctUsed > 100 ? 'text-danger' : pctUsed > 80 ? 'text-warning' : 'text-success'}`}>{pctUsed}%</p>
                </div>
              </div>

              {/* Budget vs Actuals Table */}
              <div className="card mb-4">
                <div className="card-header">
                  <h3 className="card-title">{MONTH_NAMES[selectedMonth - 1]} {selectedYear} — Budget vs Actuals</h3>
                </div>
                <div className="card-body">
                  {isLoading ? (
                    <p className="text-muted text-center py-4">Loading...</p>
                  ) : actuals.length === 0 ? (
                    <p className="text-muted text-center py-4">No budgets set for this period. Click "Add Budget" to start.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Department</th>
                            <th>Category</th>
                            <th>Budget</th>
                            <th>Actual</th>
                            <th>Variance</th>
                            <th>% Used</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actuals.map(row => {
                            const pct = row.budget_amount > 0 ? Math.round((row.actual_amount / row.budget_amount) * 100) : 0;
                            const overBudget = row.variance < 0;
                            const matchingBudget = budgets.find(b => b.id === row.budget_id);
                            return (
                              <tr key={row.budget_id}>
                                <td>{row.department_name ?? 'Fleet-wide'}</td>
                                <td className="capitalize">{row.category}</td>
                                <td>{fmtKES(row.budget_amount)}</td>
                                <td>{fmtKES(row.actual_amount)}</td>
                                <td className={overBudget ? 'text-danger' : 'text-success'}>{fmtKES(row.variance)}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 60, height: 6, background: '#e5e7eb', borderRadius: 3 }}>
                                      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3, background: pct > 100 ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e' }} />
                                    </div>
                                    <span style={{ fontSize: 12 }}>{pct}%</span>
                                  </div>
                                </td>
                                <td>
                                  <span className={`status-badge ${overBudget ? 'status-rejected' : 'status-approved'}`}>
                                    {overBudget ? 'Over Budget' : 'On Track'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    {matchingBudget && (
                                      <>
                                        <button className="btn btn-outline btn-sm" onClick={() => handleOpenEdit(matchingBudget)}>Edit</button>
                                        <button className="btn btn-outline btn-sm" style={{ color: '#ef4444' }} onClick={() => handleDelete(row.budget_id)}>Del</button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TCO Tab */}
          {activeTab === 'tco' && (
            <>
              {tcoData.length > 0 && (
                <div className="dashboard-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div className="stats-card">
                    <p className="stats-title">Total Fleet Spend</p>
                    <p className="stats-value">{fmtKES(tcoData.reduce((s, r) => s + r.total_cost, 0))}</p>
                  </div>
                  <div className="stats-card">
                    <p className="stats-title">Fleet Avg Cost/km</p>
                    <p className="stats-value">
                      {fmtKES(
                        tcoData.reduce((s, r) => s + r.total_cost, 0) /
                        Math.max(tcoData.reduce((s, r) => s + r.tracked_km, 0), 1)
                      )}
                    </p>
                  </div>
                  {tcoData[0] && (
                    <div className="stats-card">
                      <p className="stats-title">Most Expensive</p>
                      <p className="stats-value" style={{ fontSize: 16 }}>{tcoData[0].plate_number}</p>
                      <p className="stats-change">{fmtKES(tcoData[0].total_cost)}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Vehicle Total Cost of Ownership</h3>
                  <button className="btn btn-outline btn-sm" onClick={handleTCOExportCSV}>⬇ CSV</button>
                </div>
                <div className="card-body">
                  {isLoading ? (
                    <p className="text-muted text-center py-4">Loading TCO data...</p>
                  ) : tcoData.length === 0 ? (
                    <p className="text-muted text-center py-4">No vehicle cost data available yet.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Vehicle</th>
                            <th>Plate</th>
                            <th>Fuel Type</th>
                            <th>Tracked km</th>
                            <th>Fuel Cost</th>
                            <th>Maint Cost</th>
                            <th>Total Cost</th>
                            <th>Cost/km</th>
                            <th>Age</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tcoData.map(row => (
                            <tr key={row.vehicle_id}>
                              <td>{row.make} {row.model} {row.year ? `(${row.year})` : ''}</td>
                              <td>{row.plate_number}</td>
                              <td className="capitalize">{row.fuel_type}</td>
                              <td>{fmtNum(row.tracked_km, 0)} km</td>
                              <td>{fmtKES(row.total_fuel_cost)}</td>
                              <td>{fmtKES(row.total_maintenance_cost)}</td>
                              <td style={{ fontWeight: 600 }}>{fmtKES(row.total_cost)}</td>
                              <td>{row.cost_per_km > 0 ? fmtKES(row.cost_per_km) : '—'}</td>
                              <td>{row.age_months > 0 ? `${Math.floor(Number(row.age_months) / 12)}y ${Number(row.age_months) % 12}m` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Budget Form Modal */}
          {showForm && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 480 }}>
                <div className="card-header">
                  <h3 className="card-title">{editingId ? 'Edit Budget' : 'Add Budget'}</h3>
                </div>
                <div className="card-body space-y-4">
                  {formError && <div className="alert alert-error">{formError}</div>}

                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <select className="form-select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as BudgetCategory }))}>
                      <option value="fuel">Fuel</option>
                      <option value="maintenance">Maintenance</option>
                      <option value="total">Total (Combined)</option>
                    </select>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Year *</label>
                      <select className="form-select" value={form.budget_year} onChange={e => setForm(f => ({ ...f, budget_year: e.target.value }))}>
                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Month *</label>
                      <select className="form-select" value={form.budget_month} onChange={e => setForm(f => ({ ...f, budget_month: e.target.value }))}>
                        {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Budget Amount (KES) *</label>
                    <input type="number" className="form-input" min="0" step="1000" value={form.budget_amount} onChange={e => setForm(f => ({ ...f, budget_amount: e.target.value }))} placeholder="e.g. 50000" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                      {isSaving ? 'Saving...' : (editingId ? 'Update' : 'Create')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
