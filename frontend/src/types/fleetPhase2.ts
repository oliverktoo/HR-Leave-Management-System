// Fleet Management Phase 2 Types
// Trip Execution, Fuel, Maintenance, Expenses, Inspections, Logs

// ==================
// Fuel Management
// ==================

export type FuelType = 'petrol' | 'diesel' | 'electric';
export type PaymentMethod = 'fuel_card' | 'cash' | 'mpesa' | 'company_card';

export interface FuelRecord {
  id: string;
  vehicle_id: string;
  trip_request_id?: string;
  driver_id: string;
  
  refuel_datetime: string;
  fuel_type: FuelType;
  quantity_liters: number;
  cost_amount: number;
  cost_per_liter?: number;
  odometer_reading: number;
  
  station_name?: string;
  station_location?: string;
  
  fuel_card_number?: string;
  receipt_number?: string;
  receipt_photo_url?: string;
  payment_method: PaymentMethod;
  
  is_verified: boolean;
  verified_by?: string;
  verified_at?: string;
  
  notes?: string;
  created_at: string;
  created_by?: string;
  
  // Joined fields
  vehicle?: {
    plate_number: string;
    make: string;
    model: string;
  };
  driver?: {
    full_name: string;
  };
  trip?: {
    request_number: string;
  };
}

export interface CreateFuelRecordInput {
  vehicle_id: string;
  trip_request_id?: string;
  fuel_type: FuelType;
  quantity_liters: number;
  cost_amount: number;
  odometer_reading: number;
  station_name?: string;
  station_location?: string;
  fuel_card_number?: string;
  receipt_number?: string;
  receipt_photo_url?: string;
  payment_method?: PaymentMethod;
  notes?: string;
}

export interface UpdateFuelRecordInput extends Partial<CreateFuelRecordInput> {
  id: string;
}

// ==================
// Maintenance Management
// ==================

export type MaintenanceType = 
  | 'service' 
  | 'repair' 
  | 'inspection' 
  | 'tire_change' 
  | 'oil_change'
  | 'brake_service' 
  | 'battery' 
  | 'accident_repair' 
  | 'other';

export type MaintenancePriority = 'low' | 'normal' | 'high' | 'critical';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface PartReplaced {
  part_name: string;
  quantity: number;
  cost: number;
}

export interface MaintenanceRecord {
  id: string;
  vehicle_id: string;
  
  maintenance_type: MaintenanceType;
  priority: MaintenancePriority;
  
  scheduled_date?: string;
  completed_date?: string;
  status: MaintenanceStatus;
  
  odometer_reading?: number;
  description: string;
  work_performed?: string;
  parts_replaced?: PartReplaced[];
  
  service_provider?: string;
  service_location?: string;
  mechanic_name?: string;
  
  labor_cost: number;
  parts_cost: number;
  total_cost: number;
  
  invoice_number?: string;
  invoice_photo_url?: string;
  
  next_service_date?: string;
  next_service_odometer?: number;
  
  reported_by?: string;
  assigned_to?: string;
  completed_by?: string;
  
  notes?: string;
  created_at: string;
  updated_at: string;
  
  // Joined fields
  vehicle?: {
    plate_number: string;
    make: string;
    model: string;
  };
}

export interface CreateMaintenanceInput {
  vehicle_id: string;
  maintenance_type: MaintenanceType;
  priority?: MaintenancePriority;
  scheduled_date?: string;
  description: string;
  odometer_reading?: number;
  notes?: string;
}

export interface UpdateMaintenanceInput extends Partial<CreateMaintenanceInput> {
  id: string;
  status?: MaintenanceStatus;
  completed_date?: string;
  work_performed?: string;
  parts_replaced?: PartReplaced[];
  service_provider?: string;
  service_location?: string;
  mechanic_name?: string;
  labor_cost?: number;
  parts_cost?: number;
  total_cost?: number;
  invoice_number?: string;
  invoice_photo_url?: string;
  next_service_date?: string;
  next_service_odometer?: number;
}

// ==================
// Trip Expenses
// ==================

export type ExpenseType = 
  | 'fuel' 
  | 'toll' 
  | 'parking' 
  | 'accommodation' 
  | 'meals'
  | 'repairs' 
  | 'other';

export interface TripExpense {
  id: string;
  trip_request_id: string;
  vehicle_id: string;
  
  expense_type: ExpenseType;
  expense_date: string;
  amount: number;
  currency: string;
  
  description: string;
  location?: string;
  
  payment_method: PaymentMethod;
  paid_by?: string;
  
  receipt_number?: string;
  receipt_photo_url?: string;
  
  is_approved: boolean;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  
  notes?: string;
  created_at: string;
  created_by?: string;
  
  // Joined fields
  trip?: {
    request_number: string;
  };
  payer?: {
    full_name: string;
  };
}

export interface CreateTripExpenseInput {
  trip_request_id: string;
  vehicle_id: string;
  expense_type: ExpenseType;
  expense_date: string;
  amount: number;
  description: string;
  location?: string;
  payment_method?: PaymentMethod;
  receipt_number?: string;
  receipt_photo_url?: string;
  notes?: string;
}

export interface ApproveExpenseInput {
  id: string;
  is_approved: boolean;
  rejection_reason?: string;
}

// ==================
// Vehicle Inspections
// ==================

export type InspectionType = 'pre_trip' | 'post_trip' | 'periodic' | 'incident';
export type InspectionStatus = 'pass' | 'pass_with_notes' | 'fail';

export interface InspectionCheckItem {
  status: 'pass' | 'fail' | 'na';
  notes?: string;
}

export interface InspectionChecklist {
  [item: string]: InspectionCheckItem;
}

export interface VehicleInspection {
  id: string;
  vehicle_id: string;
  trip_request_id?: string;
  
  inspection_type: InspectionType;
  inspection_datetime: string;
  odometer_reading: number;
  
  inspector_id: string;
  
  checklist: InspectionChecklist;
  overall_status: InspectionStatus;
  
  issues_found?: string[];
  damage_reported: boolean;
  damage_description?: string;
  damage_photos?: string[];
  
  requires_maintenance: boolean;
  maintenance_priority?: MaintenancePriority;
  action_taken?: string;
  
  inspector_signature_url?: string;
  
  notes?: string;
  created_at: string;
  
  // Joined fields
  vehicle?: {
    plate_number: string;
    make: string;
    model: string;
  };
  inspector?: {
    full_name: string;
  };
}

export interface CreateInspectionInput {
  vehicle_id: string;
  trip_request_id?: string;
  inspection_type: InspectionType;
  odometer_reading: number;
  checklist: InspectionChecklist;
  overall_status: InspectionStatus;
  issues_found?: string[];
  damage_reported?: boolean;
  damage_description?: string;
  damage_photos?: string[];
  requires_maintenance?: boolean;
  maintenance_priority?: MaintenancePriority;
  notes?: string;
}

// ==================
// Trip Logs
// ==================

export type TripLogType = 
  | 'started' 
  | 'waypoint' 
  | 'break' 
  | 'refuel'
  | 'incident' 
  | 'delay' 
  | 'completed' 
  | 'cancelled' 
  | 'note';

export interface TripLog {
  id: string;
  trip_request_id: string;
  
  log_datetime: string;
  log_type: TripLogType;
  
  location?: string;
  coordinates?: {
    x: number; // longitude
    y: number; // latitude
  };
  odometer_reading?: number;
  
  description: string;
  duration_minutes?: number;
  
  logged_by: string;
  
  photos?: string[];
  
  created_at: string;
  
  // Joined fields
  logger?: {
    full_name: string;
  };
}

export interface CreateTripLogInput {
  trip_request_id: string;
  log_type: TripLogType;
  location?: string;
  latitude?: number;
  longitude?: number;
  odometer_reading?: number;
  description: string;
  duration_minutes?: number;
  photos?: string[];
}

// ==================
// Trip Execution
// ==================

export interface StartTripInput {
  trip_id: string;
  start_odometer: number;
  pre_trip_inspection_id?: string;
}

export interface EndTripInput {
  trip_id: string;
  end_odometer: number;
  post_trip_inspection_id?: string;
  trip_rating?: number;
  trip_feedback?: string;
}

// ==================
// Analytics & Reports
// ==================

export interface FuelEfficiencySummary {
  vehicle_id: string;
  plate_number: string;
  make: string;
  model: string;
  total_refills: number;
  total_fuel_liters: number;
  total_fuel_cost: number;
  avg_cost_per_liter: number;
  total_distance_km: number;
  fuel_efficiency_km_per_liter: number;
  cost_per_km: number;
}

export interface MaintenanceCostSummary {
  vehicle_id: string;
  plate_number: string;
  make: string;
  model: string;
  total_maintenance_records: number;
  completed_services: number;
  total_labor_cost: number;
  total_parts_cost: number;
  total_maintenance_cost: number;
  avg_maintenance_cost: number;
  last_service_date?: string;
  next_service_due?: string;
}

export interface TripStatistics {
  trip_id: string;
  request_number: string;
  status: string;
  plate_number: string;
  vehicle_name: string;
  planned_start: string;
  planned_end: string;
  actual_start_datetime?: string;
  actual_end_datetime?: string;
  start_odometer?: number;
  end_odometer?: number;
  distance_by_odometer?: number;
  actual_distance_km?: number;
  actual_duration_hours?: number;
  planned_duration_hours?: number;
  total_expenses?: number;
  log_entries_count: number;
  trip_rating?: number;
  created_at: string;
}

// ==================
// Filters
// ==================

export interface FuelRecordsFilters {
  vehicle_id?: string;
  driver_id?: string;
  trip_id?: string;
  date_from?: string;
  date_to?: string;
  is_verified?: boolean;
}

export interface MaintenanceFilters {
  vehicle_id?: string;
  status?: MaintenanceStatus;
  priority?: MaintenancePriority;
  maintenance_type?: MaintenanceType;
  date_from?: string;
  date_to?: string;
}

export interface ExpensesFilters {
  trip_id?: string;
  vehicle_id?: string;
  expense_type?: ExpenseType;
  is_approved?: boolean;
  date_from?: string;
  date_to?: string;
}

export interface InspectionsFilters {
  vehicle_id?: string;
  trip_id?: string;
  inspection_type?: InspectionType;
  overall_status?: InspectionStatus;
  requires_maintenance?: boolean;
  date_from?: string;
  date_to?: string;
}
