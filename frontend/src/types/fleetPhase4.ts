// Fleet Phase 4 Types
// GPS Tracking, Reports, Driver Dashboard, Cost & Budget Management

// ============================================
// GPS TRACKING
// ============================================

export interface TripGpsLog {
  id: string;
  trip_request_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  recorded_at: string;
  synced_at?: string;
  is_offline_sync: boolean;
  created_by?: string;
}

export interface CreateGpsLogInput {
  trip_request_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  altitude?: number;
  recorded_at?: string;
  is_offline_sync?: boolean;
}

export interface GpsOfflineQueueItem extends CreateGpsLogInput {
  queued_at: string;
}

// ============================================
// REPORTS
// ============================================

export interface ReportFilters {
  vehicle_id?: string;
  driver_id?: string;
  department_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface TripHistoryRow {
  trip_id: string;
  request_number: string;
  status: string;
  requester_name: string;
  department_name: string;
  driver_name: string;
  vehicle_plate: string;
  vehicle_name: string;
  destination: string;
  purpose: string;
  planned_start: string;
  actual_start?: string;
  actual_end?: string;
  distance_km?: number;
  duration_hours?: number;
  total_expenses?: number;
  trip_rating?: number;
}

export interface FuelCostRow {
  vehicle_id: string;
  plate_number: string;
  vehicle_name: string;
  total_refills: number;
  total_liters: number;
  total_cost: number;
  avg_cost_per_liter: number;
  total_distance_km: number;
  efficiency_km_l: number;
  cost_per_km: number;
}

export interface MaintenanceCostRow {
  vehicle_id: string;
  plate_number: string;
  make: string;
  model: string;
  total_records: number;
  completed_services: number;
  total_labor_cost: number;
  total_parts_cost: number;
  total_cost: number;
  avg_cost_per_service: number;
  last_service_date?: string;
  next_service_due?: string;
}

// ============================================
// BUDGET & COST MANAGEMENT
// ============================================

export type BudgetCategory = 'fuel' | 'maintenance' | 'total';

export interface FleetBudget {
  id: string;
  department_id?: string;
  department_name?: string;
  category: BudgetCategory;
  budget_year: number;
  budget_month: number;
  budget_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetInput {
  department_id?: string;
  category: BudgetCategory;
  budget_year: number;
  budget_month: number;
  budget_amount: number;
  notes?: string;
}

export interface BudgetActualRow {
  budget_id: string;
  department_id?: string;
  department_name?: string;
  category: BudgetCategory;
  budget_year: number;
  budget_month: number;
  budget_amount: number;
  actual_amount: number;
  variance: number;
}

// ============================================
// TCO (TOTAL COST OF OWNERSHIP)
// ============================================

export interface VehicleTCO {
  vehicle_id: string;
  plate_number: string;
  make: string;
  model: string;
  year?: number;
  fuel_type: string;
  current_odometer: number;
  total_fuel_cost: number;
  total_maintenance_cost: number;
  total_cost: number;
  tracked_km: number;
  cost_per_km: number;
  age_months: number;
}

// ============================================
// DRIVER DASHBOARD
// ============================================

export interface DriverTodayStats {
  trips_today: number;
  trips_this_week: number;
  km_this_month: number;
  compliance_score: number;
}
