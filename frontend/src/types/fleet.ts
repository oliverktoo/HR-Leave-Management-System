// Fleet Management Types
// Phase 1: Core Booking System

// ==================
// Enums
// ==================

export type VehicleFuelType = 'petrol' | 'diesel' | 'electric' | 'hybrid';

export type VehicleStatus = 'available' | 'in_use' | 'maintenance' | 'retired';

export type TripRequestStatus = 
  | 'pending' 
  | 'approved' 
  | 'rejected' 
  | 'assigned' 
  | 'in_progress' 
  | 'completed' 
  | 'cancelled';

// ==================
// Fleet Vehicle
// ==================

export interface FleetVehicle {
  id: string;
  plate_number: string;
  make: string;
  model: string;
  year?: number;
  color?: string;
  fuel_type: VehicleFuelType;
  seating_capacity: number;
  current_odometer: number;
  assigned_department_id?: string;
  status: VehicleStatus;
  insurance_expiry?: string;
  next_service_date?: string;
  next_service_odometer?: number;
  fuel_card_number?: string;
  photo_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Joined fields
  assigned_department?: {
    id: string;
    name: string;
  };
}

export interface CreateVehicleInput {
  plate_number: string;
  make: string;
  model: string;
  year?: number;
  color?: string;
  fuel_type?: VehicleFuelType;
  seating_capacity?: number;
  current_odometer?: number;
  assigned_department_id?: string;
  status?: VehicleStatus;
  insurance_expiry?: string;
  next_service_date?: string;
  next_service_odometer?: number;
  fuel_card_number?: string;
  photo_url?: string;
  notes?: string;
}

export interface UpdateVehicleInput extends Partial<CreateVehicleInput> {
  id: string;
}

// ==================
// Driver Profile
// ==================

export interface DriverProfile {
  id: string;
  user_id: string;
  license_number: string;
  license_class?: string;
  license_expiry: string;
  license_photo_url?: string;
  is_active: boolean;
  driver_rating: number;
  total_trips: number;
  total_distance_km: number;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined fields
  user?: {
    id: string;
    email: string;
  };
  user_profile?: {
    full_name: string;
    phone?: string;
    department_id?: string;
    photo_url?: string;
  };
}

export interface CreateDriverProfileInput {
  user_id: string;
  license_number: string;
  license_class?: string;
  license_expiry: string;
  license_photo_url?: string;
  is_active?: boolean;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  notes?: string;
}

export interface UpdateDriverProfileInput extends Partial<Omit<CreateDriverProfileInput, 'user_id'>> {
  id: string;
}

// ==================
// Trip Request
// ==================

export interface TripDestination {
  address: string;
  order: number;
}

export interface TripPassenger {
  user_id: string;
  name: string;
}

export interface TripRequest {
  id: string;
  request_number: string;
  requester_id: string;
  department_id?: string;
  
  // Trip Details
  purpose: string;
  destination: string;
  multi_stop_destinations?: TripDestination[];
  start_datetime: string;
  end_datetime: string;
  estimated_distance_km?: number;
  
  // Passengers
  passengers?: TripPassenger[];
  passenger_count: number;
  
  // Vehicle Preference
  preferred_vehicle_id?: string;
  vehicle_requirements?: string;
  
  // Status
  status: TripRequestStatus;
  
  // Approval
  approved_by?: string;
  approved_at?: string;
  approval_comments?: string;
  rejection_reason?: string;
  
  // Assignment
  assigned_vehicle_id?: string;
  assigned_driver_id?: string;
  assigned_by?: string;
  assigned_at?: string;
  
  // Trip Execution (Phase 2)
  actual_start_datetime?: string;
  actual_end_datetime?: string;
  start_odometer?: number;
  end_odometer?: number;
  actual_distance_km?: number;
  trip_rating?: number;
  trip_feedback?: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  
  // Joined fields
  requester?: {
    id: string;
    email: string;
  };
  requester_profile?: {
    full_name: string;
    phone?: string;
    photo_url?: string;
  };
  department?: {
    id: string;
    name: string;
  };
  preferred_vehicle?: FleetVehicle;
  assigned_vehicle?: FleetVehicle;
  assigned_driver?: {
    id: string;
    email: string;
  };
  assigned_driver_profile?: {
    full_name: string;
    phone?: string;
  };
  approver?: {
    id: string;
    email: string;
  };
  approver_profile?: {
    full_name: string;
  };
}

export interface CreateTripRequestInput {
  // Form fields
  purpose: string;
  pickup_location?: string; // Combined with destination before DB insert
  destination: string;
  start_datetime: string;
  end_datetime: string;
  passenger_count?: number;
  passengers?: string[];  // Array of passenger names
  preferred_vehicle_id?: string;
  notes?: string; // Mapped to vehicle_requirements in DB
  requires_driver?: boolean; // For form logic only
}

export interface ApproveTripRequestInput {
  id: string;
  approval_comments?: string;
}

export interface RejectTripRequestInput {
  id: string;
  rejection_reason: string;
}

export interface AssignTripRequestInput {
  id: string;
  assigned_vehicle_id: string;
  assigned_driver_id: string;
}

// ==================
// Vehicle Availability
// ==================

export interface VehicleAvailability {
  vehicle_id: string;
  is_available: boolean;
  conflicting_requests?: {
    id: string;
    request_number: string;
    start_datetime: string;
    end_datetime: string;
    requester_name: string;
  }[];
}

export interface DriverAvailability {
  driver_id: string;
  is_available: boolean;
  license_valid: boolean;
  license_expiry?: string;
  on_leave: boolean;
  leave_dates?: {
    start_date: string;
    end_date: string;
  };
  conflicting_trips?: {
    id: string;
    request_number: string;
    start_datetime: string;
    end_datetime: string;
  }[];
}

// ==================
// Dashboard & Stats
// ==================

export interface FleetDashboardStats {
  total_vehicles: number;
  available_vehicles: number;
  in_use_vehicles: number;
  maintenance_vehicles: number;
  total_drivers: number;
  active_drivers: number;
  pending_requests: number;
  todays_trips: number;
  upcoming_alerts: {
    type: 'license_expiry' | 'insurance_expiry' | 'service_due';
    entity_id: string;
    entity_name: string;
    days_until: number;
  }[];
}

// ==================
// Filters & Pagination
// ==================

export interface VehicleFilters {
  status?: VehicleStatus;
  fuel_type?: VehicleFuelType;
  department_id?: string;
  search?: string;
}

export interface TripRequestFilters {
  status?: TripRequestStatus | TripRequestStatus[];
  requester_id?: string;
  department_id?: string;
  driver_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface DriverFilters {
  is_active?: boolean;
  department_id?: string;
  license_expiring_within_days?: number;
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
