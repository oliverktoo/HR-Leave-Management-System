// Fleet Management Phase 2 Service
// Operations for fuel, maintenance, expenses, inspections, and trip execution

import { supabase } from '../lib/supabaseClient';
import {
  FuelRecord,
  CreateFuelRecordInput,
  UpdateFuelRecordInput,
  FuelRecordsFilters,
  MaintenanceRecord,
  CreateMaintenanceInput,
  UpdateMaintenanceInput,
  MaintenanceFilters,
  TripExpense,
  CreateTripExpenseInput,
  ApproveExpenseInput,
  ExpensesFilters,
  VehicleInspection,
  CreateInspectionInput,
  InspectionsFilters,
  TripLog,
  CreateTripLogInput,
  StartTripInput,
  EndTripInput,
  FuelEfficiencySummary,
  MaintenanceCostSummary,
  TripStatistics,
} from '../types/fleetPhase2';
import { TripRequest } from '../types/fleet';

// ==========================================
// TRIP EXECUTION
// ==========================================

/**
 * Start a trip (mark as in_progress)
 */
export async function startTrip(input: StartTripInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('trip_requests')
    .update({
      status: 'in_progress',
      actual_start_datetime: new Date().toISOString(),
      start_odometer: input.start_odometer,
      started_by: user.id,
    })
    .eq('id', input.trip_id)
    .eq('status', 'assigned')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error starting trip:', error);
    throw error;
  }

  // Create trip log
  await createTripLog({
    trip_request_id: input.trip_id,
    log_type: 'started',
    description: `Trip started with odometer reading: ${input.start_odometer} km`,
    odometer_reading: input.start_odometer,
  });

  // Update vehicle status to in_use
  if (data.assigned_vehicle_id) {
    await supabase
      .from('fleet_vehicles')
      .update({ status: 'in_use' })
      .eq('id', data.assigned_vehicle_id);
  }

  return data;
}

/**
 * End a trip (mark as completed)
 */
export async function endTrip(input: EndTripInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get trip to calculate distance
  const { data: trip } = await supabase
    .from('trip_requests')
    .select('start_odometer, assigned_vehicle_id')
    .eq('id', input.trip_id)
    .single();

  const actualDistance = trip?.start_odometer 
    ? input.end_odometer - trip.start_odometer 
    : null;

  const { data, error } = await supabase
    .from('trip_requests')
    .update({
      status: 'completed',
      actual_end_datetime: new Date().toISOString(),
      end_odometer: input.end_odometer,
      actual_distance_km: actualDistance,
      completed_by: user.id,
      trip_rating: input.trip_rating,
      trip_feedback: input.trip_feedback,
    })
    .eq('id', input.trip_id)
    .eq('status', 'in_progress')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error ending trip:', error);
    throw error;
  }

  // Create trip log
  await createTripLog({
    trip_request_id: input.trip_id,
    log_type: 'completed',
    description: `Trip completed with odometer reading: ${input.end_odometer} km. Total distance: ${actualDistance} km`,
    odometer_reading: input.end_odometer,
  });

  // Update vehicle status back to available and odometer
  if (trip?.assigned_vehicle_id) {
    await supabase
      .from('fleet_vehicles')
      .update({ 
        status: 'available',
        current_odometer: input.end_odometer,
      })
      .eq('id', trip.assigned_vehicle_id);
  }

  return data;
}

// ==========================================
// FUEL MANAGEMENT
// ==========================================

/**
 * Get all fuel records with filters
 */
export async function getFuelRecords(filters?: FuelRecordsFilters): Promise<FuelRecord[]> {
  let query = supabase
    .from('fuel_records')
    .select('*')
    .order('refuel_datetime', { ascending: false });

  if (filters?.vehicle_id) {
    query = query.eq('vehicle_id', filters.vehicle_id);
  }

  if (filters?.driver_id) {
    query = query.eq('driver_id', filters.driver_id);
  }

  if (filters?.trip_id) {
    query = query.eq('trip_request_id', filters.trip_id);
  }

  if (filters?.date_from) {
    query = query.gte('refuel_datetime', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('refuel_datetime', filters.date_to);
  }

  if (filters?.is_verified !== undefined) {
    query = query.eq('is_verified', filters.is_verified);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching fuel records:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Fetch related data
  const vehicleIds = [...new Set(data.map((r: any) => r.vehicle_id))];
  const driverIds = [...new Set(data.map((r: any) => r.driver_id))];
  const tripIds = [...new Set(data.map((r: any) => r.trip_request_id).filter(Boolean))];

  const [vehiclesResult, driversResult, tripsResult] = await Promise.all([
    supabase.from('fleet_vehicles').select('id, plate_number, make, model').in('id', vehicleIds),
    supabase.from('users_profile').select('id, first_name, last_name').in('id', driverIds),
    tripIds.length > 0 
      ? supabase.from('trip_requests').select('id, request_number').in('id', tripIds)
      : Promise.resolve({ data: [] }),
  ]);

  const vehicles = vehiclesResult.data || [];
  const drivers = (driversResult.data || []).map((d: any) => ({
    ...d,
    full_name: `${d.first_name} ${d.last_name}`
  }));
  const trips = tripsResult.data || [];

  return data.map((record: any) => ({
    ...record,
    vehicle: vehicles.find((v: any) => v.id === record.vehicle_id),
    driver: drivers.find((d: any) => d.id === record.driver_id),
    trip: trips.find((t: any) => t.id === record.trip_request_id),
  }));
}

/**
 * Get fuel record by ID
 */
export async function getFuelRecordById(id: string): Promise<FuelRecord | null> {
  const { data, error } = await supabase
    .from('fuel_records')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching fuel record:', error);
    throw error;
  }

  if (!data) return null;

  // Fetch related data
  const [vehicleResult, driverResult, tripResult] = await Promise.all([
    supabase.from('fleet_vehicles').select('id, plate_number, make, model').eq('id', data.vehicle_id).single(),
    supabase.from('users_profile').select('id, first_name, last_name').eq('id', data.driver_id).single(),
    data.trip_request_id 
      ? supabase.from('trip_requests').select('id, request_number').eq('id', data.trip_request_id).single()
      : Promise.resolve({ data: null }),
  ]);

  const driver = driverResult.data ? {
    ...driverResult.data,
    full_name: `${driverResult.data.first_name} ${driverResult.data.last_name}`
  } : null;

  return {
    ...data,
    vehicle: vehicleResult.data || undefined,
    driver,
    trip: tripResult.data || undefined,
  };
}

/**
 * Create fuel record
 */
export async function createFuelRecord(input: CreateFuelRecordInput): Promise<FuelRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Calculate cost per liter if not provided
  const costPerLiter = input.cost_amount / input.quantity_liters;

  const { data, error } = await supabase
    .from('fuel_records')
    .insert({
      ...input,
      cost_per_liter: costPerLiter,
      driver_id: user.id,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating fuel record:', error);
    throw error;
  }

  // If associated with a trip, create trip log
  if (input.trip_request_id) {
    await createTripLog({
      trip_request_id: input.trip_request_id,
      log_type: 'refuel',
      description: `Refueled ${input.quantity_liters}L at ${input.station_name || 'fuel station'}. Cost: KES ${input.cost_amount}`,
      odometer_reading: input.odometer_reading,
      location: input.station_location,
    });
  }

  return data;
}

/**
 * Update fuel record
 */
export async function updateFuelRecord(input: UpdateFuelRecordInput): Promise<FuelRecord> {
  const { id, ...updateData } = input;

  // Recalculate cost per liter if amounts changed
  if (updateData.cost_amount && updateData.quantity_liters) {
    (updateData as any).cost_per_liter = updateData.cost_amount / updateData.quantity_liters;
  }

  const { data, error } = await supabase
    .from('fuel_records')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating fuel record:', error);
    throw error;
  }

  return data;
}

/**
 * Verify fuel record (Fleet Manager)
 */
export async function verifyFuelRecord(id: string): Promise<FuelRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('fuel_records')
    .update({
      is_verified: true,
      verified_by: user?.id,
      verified_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error verifying fuel record:', error);
    throw error;
  }

  return data;
}

/**
 * Delete fuel record
 */
export async function deleteFuelRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('fuel_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting fuel record:', error);
    throw error;
  }
}

// ==========================================
// MAINTENANCE MANAGEMENT
// ==========================================

/**
 * Get maintenance records with filters
 */
export async function getMaintenanceRecords(filters?: MaintenanceFilters): Promise<MaintenanceRecord[]> {
  let query = supabase
    .from('maintenance_records')
    .select('*')
    .order('scheduled_date', { ascending: false });

  if (filters?.vehicle_id) {
    query = query.eq('vehicle_id', filters.vehicle_id);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters?.maintenance_type) {
    query = query.eq('maintenance_type', filters.maintenance_type);
  }

  if (filters?.date_from) {
    query = query.gte('scheduled_date', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('scheduled_date', filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching maintenance records:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Fetch vehicle details
  const vehicleIds = [...new Set(data.map(r => r.vehicle_id))];
  const { data: vehicles } = await supabase
    .from('fleet_vehicles')
    .select('id, plate_number, make, model')
    .in('id', vehicleIds);

  return data.map((record: any) => ({
    ...record,
    vehicle: vehicles?.find((v: any) => v.id === record.vehicle_id),
  }));
}

/**
 * Get maintenance record by ID
 */
export async function getMaintenanceRecordById(id: string): Promise<MaintenanceRecord | null> {
  const { data, error } = await supabase
    .from('maintenance_records')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching maintenance record:', error);
    throw error;
  }

  return data;
}

/**
 * Create maintenance record
 */
export async function createMaintenanceRecord(input: CreateMaintenanceInput): Promise<MaintenanceRecord> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('maintenance_records')
    .insert({
      ...input,
      reported_by: user?.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating maintenance record:', error);
    throw error;
  }

  // Update vehicle status if high priority
  if (input.priority === 'critical' || input.priority === 'high') {
    await supabase
      .from('fleet_vehicles')
      .update({ status: 'maintenance' })
      .eq('id', input.vehicle_id);
  }

  return data;
}

/**
 * Update maintenance record
 */
export async function updateMaintenanceRecord(input: UpdateMaintenanceInput): Promise<MaintenanceRecord> {
  const { id, ...updateData } = input;

  // Calculate total cost if parts or labor changed
  if (updateData.labor_cost !== undefined || updateData.parts_cost !== undefined) {
    const { data: current } = await supabase
      .from('maintenance_records')
      .select('labor_cost, parts_cost')
      .eq('id', id)
      .single();

    const labor = updateData.labor_cost !== undefined ? updateData.labor_cost : (current?.labor_cost || 0);
    const parts = updateData.parts_cost !== undefined ? updateData.parts_cost : (current?.parts_cost || 0);
    updateData.total_cost = labor + parts;
  }

  const { data, error } = await supabase
    .from('maintenance_records')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating maintenance record:', error);
    throw error;
  }

  // If completed, update vehicle status and next service info
  if (updateData.status === 'completed' && data.vehicle_id) {
    const updates: any = { status: 'available' };
    
    if (data.next_service_date) {
      updates.next_service_date = data.next_service_date;
    }
    
    if (data.next_service_odometer) {
      updates.next_service_odometer = data.next_service_odometer;
    }

    await supabase
      .from('fleet_vehicles')
      .update(updates)
      .eq('id', data.vehicle_id);
  }

  return data;
}

/**
 * Delete maintenance record
 */
export async function deleteMaintenanceRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('maintenance_records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting maintenance record:', error);
    throw error;
  }
}

/**
 * Get upcoming maintenance (due soon)
 */
export async function getUpcomingMaintenance(): Promise<MaintenanceRecord[]> {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const { data, error } = await supabase
    .from('maintenance_records')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_date', thirtyDaysFromNow.toISOString().split('T')[0])
    .order('scheduled_date', { ascending: true });

  if (error) {
    console.error('Error fetching upcoming maintenance:', error);
    throw error;
  }

  return data || [];
}

// ==========================================
// TRIP EXPENSES
// ==========================================

/**
 * Get trip expenses with filters
 */
export async function getTripExpenses(filters?: ExpensesFilters): Promise<TripExpense[]> {
  let query = supabase
    .from('trip_expenses')
    .select('*')
    .order('expense_date', { ascending: false });

  if (filters?.trip_id) {
    query = query.eq('trip_request_id', filters.trip_id);
  }

  if (filters?.vehicle_id) {
    query = query.eq('vehicle_id', filters.vehicle_id);
  }

  if (filters?.expense_type) {
    query = query.eq('expense_type', filters.expense_type);
  }

  if (filters?.is_approved !== undefined) {
    query = query.eq('is_approved', filters.is_approved);
  }

  if (filters?.date_from) {
    query = query.gte('expense_date', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('expense_date', filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching trip expenses:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Fetch related data
  const tripIds = [...new Set(data.map((e: any) => e.trip_request_id))];
  const payerIds = [...new Set(data.map((e: any) => e.paid_by).filter(Boolean))];

  const [tripsResult, payersResult] = await Promise.all([
    supabase.from('trip_requests').select('id, request_number').in('id', tripIds),
    payerIds.length > 0
      ? supabase.from('users_profile').select('id, first_name, last_name').in('id', payerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const trips = tripsResult.data || [];
  const payers = (payersResult.data || []).map((p: any) => ({
    ...p,
    full_name: `${p.first_name} ${p.last_name}`
  }));

  return data.map((expense: any) => ({
    ...expense,
    trip: trips.find((t: any) => t.id === expense.trip_request_id),
    payer: payers.find((p: any) => p.id === expense.paid_by),
  }));
}

/**
 * Create trip expense
 */
export async function createTripExpense(input: CreateTripExpenseInput): Promise<TripExpense> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('trip_expenses')
    .insert({
      ...input,
      paid_by: user?.id,
      created_by: user?.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating trip expense:', error);
    throw error;
  }

  // Create trip log
  if (input.trip_request_id) {
    await createTripLog({
      trip_request_id: input.trip_request_id,
      log_type: 'note',
      description: `Expense recorded: ${input.expense_type} - KES ${input.amount}`,
    });
  }

  return data;
}

/**
 * Approve or reject expense
 */
export async function approveExpense(input: ApproveExpenseInput): Promise<TripExpense> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('trip_expenses')
    .update({
      is_approved: input.is_approved,
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      rejection_reason: input.rejection_reason,
    })
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) {
    console.error('Error approving expense:', error);
    throw error;
  }

  return data;
}

/**
 * Delete trip expense
 */
export async function deleteTripExpense(id: string): Promise<void> {
  const { error } = await supabase
    .from('trip_expenses')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting trip expense:', error);
    throw error;
  }
}

// ==========================================
// VEHICLE INSPECTIONS
// ==========================================

/**
 * Get vehicle inspections with filters
 */
export async function getVehicleInspections(filters?: InspectionsFilters): Promise<VehicleInspection[]> {
  let query = supabase
    .from('vehicle_inspections')
    .select('*')
    .order('inspection_datetime', { ascending: false });

  if (filters?.vehicle_id) {
    query = query.eq('vehicle_id', filters.vehicle_id);
  }

  if (filters?.trip_id) {
    query = query.eq('trip_request_id', filters.trip_id);
  }

  if (filters?.inspection_type) {
    query = query.eq('inspection_type', filters.inspection_type);
  }

  if (filters?.overall_status) {
    query = query.eq('overall_status', filters.overall_status);
  }

  if (filters?.requires_maintenance !== undefined) {
    query = query.eq('requires_maintenance', filters.requires_maintenance);
  }

  if (filters?.date_from) {
    query = query.gte('inspection_datetime', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('inspection_datetime', filters.date_to);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching inspections:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Fetch related data
  const vehicleIds = [...new Set(data.map((i: any) => i.vehicle_id))];
  const inspectorIds = [...new Set(data.map((i: any) => i.inspector_id))];

  const [vehiclesResult, inspectorsResult] = await Promise.all([
    supabase.from('fleet_vehicles').select('id, plate_number, make, model').in('id', vehicleIds),
    supabase.from('users_profile').select('id, first_name, last_name').in('id', inspectorIds),
  ]);

  const vehicles = vehiclesResult.data || [];
  const inspectors = (inspectorsResult.data || []).map((i: any) => ({
    ...i,
    full_name: `${i.first_name} ${i.last_name}`
  }));

  return data.map((inspection: any) => ({
    ...inspection,
    vehicle: vehicles.find((v: any) => v.id === inspection.vehicle_id),
    inspector: inspectors.find((i: any) => i.id === inspection.inspector_id),
  }));
}

/**
 * Create vehicle inspection
 */
export async function createVehicleInspection(input: CreateInspectionInput): Promise<VehicleInspection> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('vehicle_inspections')
    .insert({
      ...input,
      inspector_id: user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating inspection:', error);
    throw error;
  }

  // If requires maintenance, create maintenance record
  if (input.requires_maintenance && input.maintenance_priority) {
    await createMaintenanceRecord({
      vehicle_id: input.vehicle_id,
      maintenance_type: 'inspection',
      priority: input.maintenance_priority,
      description: `Issues found during ${input.inspection_type} inspection: ${input.issues_found?.join(', ') || 'See inspection details'}`,
    });
  }

  // Create trip log if associated with trip
  if (input.trip_request_id) {
    await createTripLog({
      trip_request_id: input.trip_request_id,
      log_type: 'note',
      description: `${input.inspection_type} inspection completed. Status: ${input.overall_status}`,
    });
  }

  return data;
}

/**
 * Get inspection by ID
 */
export async function getInspectionById(id: string): Promise<VehicleInspection | null> {
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching inspection:', error);
    throw error;
  }

  return data;
}

// ==========================================
// TRIP LOGS
// ==========================================

/**
 * Get trip logs for a specific trip
 */
export async function getTripLogs(tripId: string): Promise<TripLog[]> {
  const { data, error } = await supabase
    .from('trip_logs')
    .select('*')
    .eq('trip_request_id', tripId)
    .order('log_datetime', { ascending: true });

  if (error) {
    console.error('Error fetching trip logs:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Fetch logger profiles
  const loggerIds = [...new Set(data.map((l: any) => l.logged_by))];
  const { data: loggers } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name')
    .in('id', loggerIds);

  const loggersMap = (loggers || []).map((l: any) => ({
    ...l,
    full_name: `${l.first_name} ${l.last_name}`
  }));

  return data.map((log: any) => ({
    ...log,
    logger: loggersMap.find((l: any) => l.id === log.logged_by),
  }));
}

/**
 * Create trip log entry
 */
export async function createTripLog(input: CreateTripLogInput): Promise<TripLog> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated');
  }

  // Convert lat/lng to PostgreSQL point if provided
  let coordinates = null;
  if (input.latitude !== undefined && input.longitude !== undefined) {
    coordinates = `(${input.longitude},${input.latitude})`;
  }

  const { data, error } = await supabase
    .from('trip_logs')
    .insert({
      trip_request_id: input.trip_request_id,
      log_type: input.log_type,
      location: input.location,
      coordinates,
      odometer_reading: input.odometer_reading,
      description: input.description,
      duration_minutes: input.duration_minutes,
      photos: input.photos,
      logged_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    console.error('Error creating trip log:', error);
    throw error;
  }

  return data;
}

// ==========================================
// ANALYTICS & REPORTS
// ==========================================

/**
 * Get fuel efficiency summary for all vehicles
 */
export async function getFuelEfficiencySummary(): Promise<FuelEfficiencySummary[]> {
  const { data, error } = await supabase
    .from('fuel_efficiency_summary')
    .select('*')
    .order('fuel_efficiency_km_per_liter', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Error fetching fuel efficiency:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get maintenance cost summary for all vehicles
 */
export async function getMaintenanceCostSummary(): Promise<MaintenanceCostSummary[]> {
  const { data, error } = await supabase
    .from('maintenance_cost_summary')
    .select('*')
    .order('total_maintenance_cost', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('Error fetching maintenance costs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get trip statistics
 */
export async function getTripStatistics(filters?: { 
  date_from?: string; 
  date_to?: string;
  vehicle_id?: string;
}): Promise<TripStatistics[]> {
  let query = supabase
    .from('trip_statistics')
    .select('*')
    .order('planned_start', { ascending: false });

  if (filters?.date_from) {
    query = query.gte('planned_start', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('planned_start', filters.date_to);
  }

  if (filters?.vehicle_id) {
    query = query.eq('vehicle_id', filters.vehicle_id);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching trip statistics:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get vehicle utilization stats
 */
export async function getVehicleUtilization(vehicleId: string, dateFrom: string, dateTo: string) {
  const { data: trips, error } = await supabase
    .from('trip_requests')
    .select('id, start_datetime, end_datetime, actual_distance_km, status')
    .eq('assigned_vehicle_id', vehicleId)
    .gte('start_datetime', dateFrom)
    .lte('end_datetime', dateTo);

  if (error) {
    console.error('Error fetching vehicle utilization:', error);
    throw error;
  }

  const completedTrips = trips?.filter(t => t.status === 'completed') || [];
  const totalTrips = trips?.length || 0;
  const totalDistance = completedTrips.reduce((sum, t) => sum + (t.actual_distance_km || 0), 0);
  
  // Calculate utilization hours
  const totalHours = completedTrips.reduce((sum: number, t: any) => {
    if (t.start_datetime && t.end_datetime) {
      const hours = (new Date(t.end_datetime).getTime() - new Date(t.start_datetime).getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }
    return sum;
  }, 0);

  return {
    vehicle_id: vehicleId,
    period: `${dateFrom} to ${dateTo}`,
    total_trips: totalTrips,
    completed_trips: completedTrips.length,
    total_distance_km: totalDistance,
    total_utilization_hours: totalHours,
    avg_trip_distance_km: completedTrips.length > 0 ? totalDistance / completedTrips.length : 0,
  };
}

/**
 * Get pending expenses for approval
 */
export async function getPendingExpenses(): Promise<TripExpense[]> {
  return getTripExpenses({ is_approved: false });
}

/**
 * Get unverified fuel records
 */
export async function getUnverifiedFuelRecords(): Promise<FuelRecord[]> {
  return getFuelRecords({ is_verified: false });
}
