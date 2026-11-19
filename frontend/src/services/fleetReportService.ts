// Fleet Phase 4: Reports & Budget Service
// Trip history, fuel costs, maintenance reports, budgets, TCO

import { supabase } from '../lib/supabaseClient';
import {
  TripHistoryRow,
  FuelCostRow,
  MaintenanceCostRow,
  ReportFilters,
  FleetBudget,
  CreateBudgetInput,
  BudgetActualRow,
  VehicleTCO,
} from '../types/fleetPhase4';

// ============================================
// REPORTS
// ============================================

export async function getTripHistoryReport(filters: ReportFilters = {}): Promise<TripHistoryRow[]> {
  try {
    const { data, error } = await supabase.rpc('get_trip_history_report', {
      p_vehicle_id:    filters.vehicle_id    ?? null,
      p_driver_id:     filters.driver_id     ?? null,
      p_department_id: filters.department_id ?? null,
      p_date_from:     filters.date_from     ?? null,
      p_date_to:       filters.date_to       ?? null,
    });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching trip history report:', error);
    return [];
  }
}

export async function getFuelCostReport(filters: ReportFilters = {}): Promise<FuelCostRow[]> {
  try {
    const { data, error } = await supabase.rpc('get_fuel_cost_report', {
      p_vehicle_id: filters.vehicle_id ?? null,
      p_date_from:  filters.date_from  ?? null,
      p_date_to:    filters.date_to    ?? null,
    });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching fuel cost report:', error);
    return [];
  }
}

export async function getMaintenanceCostReport(filters: ReportFilters = {}): Promise<MaintenanceCostRow[]> {
  try {
    let query = supabase
      .from('maintenance_records')
      .select(`
        id, vehicle_id, status, labor_cost, parts_cost, total_cost,
        completed_date, next_service_date, scheduled_date,
        vehicle:fleet_vehicles(plate_number, make, model)
      `);

    if (filters.vehicle_id) query = query.eq('vehicle_id', filters.vehicle_id);
    if (filters.date_from)   query = query.gte('scheduled_date', filters.date_from);
    if (filters.date_to)     query = query.lte('scheduled_date', filters.date_to);

    const { data, error } = await query;
    if (error) throw error;

    // Group by vehicle
    const vehicleMap = new Map<string, MaintenanceCostRow>();
    (data || []).forEach((rec: any) => {
      const v = Array.isArray(rec.vehicle) ? rec.vehicle[0] : rec.vehicle;
      const vid = rec.vehicle_id;
      if (!vehicleMap.has(vid)) {
        vehicleMap.set(vid, {
          vehicle_id: vid,
          plate_number: v?.plate_number ?? '—',
          make: v?.make ?? '—',
          model: v?.model ?? '—',
          total_records: 0,
          completed_services: 0,
          total_labor_cost: 0,
          total_parts_cost: 0,
          total_cost: 0,
          avg_cost_per_service: 0,
        });
      }
      const row = vehicleMap.get(vid)!;
      row.total_records++;
      if (rec.status === 'completed') {
        row.completed_services++;
        row.total_labor_cost += rec.labor_cost ?? 0;
        row.total_parts_cost += rec.parts_cost ?? 0;
        row.total_cost += rec.total_cost ?? 0;
        if (!row.last_service_date || (rec.completed_date && rec.completed_date > row.last_service_date)) {
          row.last_service_date = rec.completed_date;
        }
      }
      if (!row.next_service_due || (rec.next_service_date && rec.next_service_date < row.next_service_due)) {
        row.next_service_due = rec.next_service_date;
      }
    });

    return Array.from(vehicleMap.values()).map(row => ({
      ...row,
      avg_cost_per_service: row.completed_services > 0
        ? Math.round(row.total_cost / row.completed_services * 100) / 100
        : 0,
    }));
  } catch (error) {
    console.error('Error fetching maintenance cost report:', error);
    return [];
  }
}

// ============================================
// EXPORT UTILITIES
// ============================================

export function exportToCSV(headers: string[], rows: (string | number | null | undefined)[][], filename: string): void {
  const escape = (v: string | number | null | undefined): string => {
    const str = v == null ? '' : String(v);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ].join('\n');

  // UTF-8 BOM for Excel compatibility
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToPDF(title: string, headers: string[], rows: (string | number | null | undefined)[][], filename: string): void {
  import('jspdf').then(({ default: jsPDF }) => {
    import('jspdf-autotable').then(({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: rows[0]?.length > 6 ? 'landscape' : 'portrait' });
      doc.setFontSize(14);
      doc.text(title, 14, 16);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);
      autoTable(doc, {
        head: [headers],
        body: rows.map(r => r.map(v => v == null ? '' : String(v))),
        startY: 28,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185] },
      });
      doc.save(filename);
    });
  });
}

// ============================================
// FLEET BUDGETS
// ============================================

export async function getFleetBudgets(year?: number, month?: number): Promise<FleetBudget[]> {
  try {
    let query = supabase
      .from('fleet_budgets')
      .select(`*, department:department_id(name)`)
      .order('budget_year', { ascending: false })
      .order('budget_month', { ascending: false });

    if (year)  query = query.eq('budget_year', year);
    if (month) query = query.eq('budget_month', month);

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((b: any) => ({
      ...b,
      department_name: Array.isArray(b.department) ? b.department[0]?.name : b.department?.name,
    }));
  } catch (error) {
    console.error('Error fetching fleet budgets:', error);
    return [];
  }
}

export async function createFleetBudget(input: CreateBudgetInput): Promise<FleetBudget> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('fleet_budgets')
    .insert({ ...input, created_by: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateFleetBudget(id: string, input: Partial<CreateBudgetInput>): Promise<FleetBudget> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('fleet_budgets')
    .update({ ...input, updated_by: user.id })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFleetBudget(id: string): Promise<void> {
  const { error } = await supabase.from('fleet_budgets').delete().eq('id', id);
  if (error) throw error;
}

export async function getBudgetActuals(year: number, month: number): Promise<BudgetActualRow[]> {
  try {
    const { data, error } = await supabase
      .from('fleet_budget_actuals')
      .select('*')
      .eq('budget_year', year)
      .eq('budget_month', month)
      .order('department_name', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching budget actuals:', error);
    return [];
  }
}

// ============================================
// VEHICLE TCO
// ============================================

export async function getVehicleTCO(): Promise<VehicleTCO[]> {
  try {
    const { data, error } = await supabase
      .from('vehicle_tco')
      .select('*')
      .order('total_cost', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching vehicle TCO:', error);
    return [];
  }
}
