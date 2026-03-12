// Fleet Management Service
// Phase 1: Core Booking System

import { supabase } from '../lib/supabaseClient';
import {
  FleetVehicle,
  CreateVehicleInput,
  UpdateVehicleInput,
  DriverProfile,
  CreateDriverProfileInput,
  UpdateDriverProfileInput,
  TripRequest,
  CreateTripRequestInput,
  ApproveTripRequestInput,
  RejectTripRequestInput,
  AssignTripRequestInput,
  VehicleFilters,
  TripRequestFilters,
  DriverFilters,
  FleetDashboardStats,
  VehicleAvailability,
  DriverAvailability,
} from '../types/fleet';

// ==========================================
// VEHICLE MANAGEMENT
// ==========================================

/**
 * Get all vehicles with optional filters
 */
export async function getVehicles(filters?: VehicleFilters): Promise<FleetVehicle[]> {
  let query = supabase
    .from('fleet_vehicles')
    .select(`
      *,
      assigned_department:departments!assigned_department_id(id, name)
    `)
    .order('plate_number');

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.fuel_type) {
    query = query.eq('fuel_type', filters.fuel_type);
  }

  if (filters?.department_id) {
    query = query.eq('assigned_department_id', filters.department_id);
  }

  if (filters?.search) {
    query = query.or(`plate_number.ilike.%${filters.search}%,make.ilike.%${filters.search}%,model.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching vehicles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single vehicle by ID
 */
export async function getVehicleById(id: string): Promise<FleetVehicle | null> {
  const { data, error } = await supabase
    .from('fleet_vehicles')
    .select(`
      *,
      assigned_department:departments!assigned_department_id(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching vehicle:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new vehicle
 */
export async function createVehicle(input: CreateVehicleInput): Promise<FleetVehicle> {
  const { data: { user } } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('fleet_vehicles')
    .insert({
      ...input,
      created_by: user?.id,
    })
    .select(`
      *,
      assigned_department:departments!assigned_department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error creating vehicle:', error);
    throw error;
  }

  return data;
}

/**
 * Update an existing vehicle
 */
export async function updateVehicle(input: UpdateVehicleInput): Promise<FleetVehicle> {
  const { id, ...updateData } = input;

  const { data, error } = await supabase
    .from('fleet_vehicles')
    .update(updateData)
    .eq('id', id)
    .select(`
      *,
      assigned_department:departments!assigned_department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error updating vehicle:', error);
    throw error;
  }

  return data;
}

/**
 * Delete (retire) a vehicle
 */
export async function deleteVehicle(id: string): Promise<void> {
  const { error } = await supabase
    .from('fleet_vehicles')
    .update({ status: 'retired' })
    .eq('id', id);

  if (error) {
    console.error('Error deleting vehicle:', error);
    throw error;
  }
}

/**
 * Check vehicle availability for a date range
 */
export async function checkVehicleAvailability(
  vehicleId: string,
  startDatetime: string,
  endDatetime: string,
  excludeRequestId?: string
): Promise<VehicleAvailability> {
  // Check via RPC function
  const { data: isAvailable, error: rpcError } = await supabase
    .rpc('is_vehicle_available', {
      p_vehicle_id: vehicleId,
      p_start_datetime: startDatetime,
      p_end_datetime: endDatetime,
      p_exclude_request_id: excludeRequestId || null,
    });

  if (rpcError) {
    console.error('Error checking vehicle availability:', rpcError);
    throw rpcError;
  }

  // Get conflicting requests if not available
  let conflictingRequests: VehicleAvailability['conflicting_requests'] = [];
  
  if (!isAvailable) {
    const { data: conflicts } = await supabase
      .from('trip_requests')
      .select('id, request_number, start_datetime, end_datetime, requester_id')
      .eq('assigned_vehicle_id', vehicleId)
      .in('status', ['approved', 'assigned', 'in_progress'])
      .or(`start_datetime.lte.${endDatetime},end_datetime.gte.${startDatetime}`);

    if (conflicts && conflicts.length > 0) {
      const requesterIds = conflicts.map(c => c.requester_id).filter(Boolean);
      const { data: requesters } = await supabase
        .from('users_profile')
        .select('id, first_name, last_name')
        .in('id', requesterIds);

      const transformedRequesters = (requesters || []).map((r: any) => ({
        ...r,
        full_name: `${r.first_name} ${r.last_name}`
      }));

      conflictingRequests = conflicts.map(c => ({
        id: c.id,
        request_number: c.request_number,
        start_datetime: c.start_datetime,
        end_datetime: c.end_datetime,
        requester_name: transformedRequesters?.find(r => r.id === c.requester_id)?.full_name || 'Unknown',
      }));
    }
  }

  return {
    vehicle_id: vehicleId,
    is_available: isAvailable,
    conflicting_requests: conflictingRequests,
  };
}

/**
 * Get available vehicles for a date range
 */
export async function getAvailableVehicles(
  startDatetime: string,
  endDatetime: string,
  minSeats?: number
): Promise<FleetVehicle[]> {
  // Get all available vehicles
  let query = supabase
    .from('fleet_vehicles')
    .select(`
      *,
      assigned_department:departments!assigned_department_id(id, name)
    `)
    .eq('status', 'available');

  if (minSeats) {
    query = query.gte('seating_capacity', minSeats);
  }

  const { data: vehicles, error } = await query;

  if (error) {
    console.error('Error fetching available vehicles:', error);
    throw error;
  }

  // Filter out vehicles with conflicting bookings
  const availableVehicles: FleetVehicle[] = [];
  
  for (const vehicle of vehicles || []) {
    const availability = await checkVehicleAvailability(
      vehicle.id,
      startDatetime,
      endDatetime
    );
    
    if (availability.is_available) {
      availableVehicles.push(vehicle);
    }
  }

  return availableVehicles;
}

// ==========================================
// DRIVER MANAGEMENT
// ==========================================

/**
 * Get all drivers with optional filters
 */
export async function getDrivers(filters?: DriverFilters): Promise<DriverProfile[]> {
  // First get driver profiles
  let query = supabase
    .from('driver_profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  }

  if (filters?.license_expiring_within_days) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + filters.license_expiring_within_days);
    query = query.lte('license_expiry', futureDate.toISOString().split('T')[0]);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching drivers:', error);
    throw error;
  }

  if (!data || data.length === 0) return [];

  // Get user profiles for all drivers
  const userIds = data.map(d => d.user_id);
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, phone, department_id, photo_url')
    .in('id', userIds);

  const transformedProfiles = (profiles || []).map((p: any) => ({
    ...p,
    full_name: `${p.first_name} ${p.last_name}`
  }));

  // Merge driver data with profiles
  let results = data.map(driver => ({
    ...driver,
    user_profile: transformedProfiles?.find(p => p.id === driver.user_id) || null,
  }));
  
  if (filters?.search) {
    const searchLower = filters.search.toLowerCase();
    results = results.filter(d => 
      d.license_number.toLowerCase().includes(searchLower) ||
      (d.user_profile as any)?.full_name?.toLowerCase().includes(searchLower)
    );
  }

  if (filters?.department_id) {
    results = results.filter(d => 
      (d.user_profile as any)?.department_id === filters.department_id
    );
  }

  return results;
}

/**
 * Get a single driver by ID
 */
export async function getDriverById(id: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching driver:', error);
    throw error;
  }

  if (!data) return null;

  // Get user profile
  const { data: profile } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, phone, department_id, photo_url')
    .eq('id', data.user_id)
    .single();

  const transformedProfile = profile ? {
    ...profile,
    full_name: `${profile.first_name} ${profile.last_name}`
  } : null;

  if (error) {
    console.error('Error fetching driver:', error);
    throw error;
  }

  return {
    ...data,
    user_profile: transformedProfile,
  };
}

/**
 * Get driver profile by user ID
 */
export async function getDriverByUserId(userId: string): Promise<DriverProfile | null> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { // Ignore not found
    console.error('Error fetching driver by user ID:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new driver profile
 */
export async function createDriverProfile(input: CreateDriverProfileInput): Promise<DriverProfile> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .insert(input)
    .select('*')
    .single();

  if (error) {
    console.error('Error creating driver profile:', error);
    throw error;
  }

  // Also update users_profile is_driver flag
  await supabase
    .from('users_profile')
    .update({ is_driver: true })
    .eq('id', input.user_id);

  // Get user profile
  const { data: profile } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, phone, department_id, photo_url')
    .eq('id', input.user_id)
    .single();

  const transformedProfile = profile ? {
    ...profile,
    full_name: `${profile.first_name} ${profile.last_name}`
  } : null;

  return {
    ...data,
    user_profile: transformedProfile,
  };
}

/**
 * Update driver profile
 */
export async function updateDriverProfile(input: UpdateDriverProfileInput): Promise<DriverProfile> {
  const { id, ...updateData } = input;

  const { data, error } = await supabase
    .from('driver_profiles')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error updating driver profile:', error);
    throw error;
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, phone, department_id, photo_url')
    .eq('id', data.user_id)
    .single();

  const transformedProfile = profile ? {
    ...profile,
    full_name: `${profile.first_name} ${profile.last_name}`
  } : null;

  return {
    ...data,
    user_profile: transformedProfile,
  };
}

/**
 * Check driver availability for a date range
 */
export async function checkDriverAvailability(
  driverId: string,
  startDatetime: string,
  endDatetime: string,
  excludeRequestId?: string
): Promise<DriverAvailability> {
  // Check via RPC function
  const { data: isAvailable, error: rpcError } = await supabase
    .rpc('is_driver_available', {
      p_driver_id: driverId,
      p_start_datetime: startDatetime,
      p_end_datetime: endDatetime,
      p_exclude_request_id: excludeRequestId || null,
    });

  if (rpcError) {
    console.error('Error checking driver availability:', rpcError);
    throw rpcError;
  }

  // Get driver details for response
  const { data: driver } = await supabase
    .from('driver_profiles')
    .select('license_expiry, is_active')
    .eq('user_id', driverId)
    .single();

  // Check for leave
  const { data: leave } = await supabase
    .from('leave_requests')
    .select('start_date, end_date')
    .eq('user_id', driverId)
    .eq('status', 'approved')
    .lte('start_date', endDatetime.split('T')[0])
    .gte('end_date', startDatetime.split('T')[0])
    .limit(1);

  // Get conflicting trips
  const { data: conflicts } = await supabase
    .from('trip_requests')
    .select('id, request_number, start_datetime, end_datetime')
    .eq('assigned_driver_id', driverId)
    .in('status', ['assigned', 'in_progress'])
    .or(`start_datetime.lte.${endDatetime},end_datetime.gte.${startDatetime}`);

  return {
    driver_id: driverId,
    is_available: isAvailable,
    license_valid: driver?.license_expiry ? new Date(driver.license_expiry) >= new Date() : false,
    license_expiry: driver?.license_expiry,
    on_leave: (leave?.length || 0) > 0,
    leave_dates: leave?.[0],
    conflicting_trips: conflicts || [],
  };
}

/**
 * Get available drivers for a date range
 */
export async function getAvailableDrivers(
  startDatetime: string,
  endDatetime: string
): Promise<DriverProfile[]> {
  // Get all active drivers with valid licenses
  const { data: drivers, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('is_active', true)
    .gte('license_expiry', new Date().toISOString().split('T')[0]);

  if (error) {
    console.error('Error fetching available drivers:', error);
    throw error;
  }

  if (!drivers || drivers.length === 0) return [];

  // Get user profiles for all drivers
  const userIds = drivers.map(d => d.user_id);
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, phone, department_id, photo_url')
    .in('id', userIds);

  const transformedProfiles = (profiles || []).map((p: any) => ({
    ...p,
    full_name: `${p.first_name} ${p.last_name}`
  }));

  // Filter out drivers with conflicting assignments or on leave
  const availableDrivers: DriverProfile[] = [];
  
  for (const driver of drivers) {
    const availability = await checkDriverAvailability(
      driver.user_id,
      startDatetime,
      endDatetime
    );
    
    if (availability.is_available) {
      availableDrivers.push({
        ...driver,
        user_profile: transformedProfiles?.find(p => p.id === driver.user_id) || null,
      });
    }
  }

  return availableDrivers;
}

// ==========================================
// TRIP REQUEST MANAGEMENT
// ==========================================

/**
 * Get trip requests with optional filters
 */
export async function getTripRequests(filters?: TripRequestFilters): Promise<TripRequest[]> {
  let query = supabase
    .from('trip_requests')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  if (filters?.requester_id) {
    query = query.eq('requester_id', filters.requester_id);
  }

  if (filters?.department_id) {
    query = query.eq('department_id', filters.department_id);
  }

  if (filters?.driver_id) {
    query = query.eq('assigned_driver_id', filters.driver_id);
  }

  if (filters?.date_from) {
    query = query.gte('start_datetime', filters.date_from);
  }

  if (filters?.date_to) {
    query = query.lte('end_datetime', filters.date_to);
  }

  if (filters?.search) {
    query = query.or(`request_number.ilike.%${filters.search}%,destination.ilike.%${filters.search}%,purpose.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching trip requests:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single trip request by ID
 */
export async function getTripRequestById(id: string): Promise<TripRequest | null> {
  const { data, error } = await supabase
    .from('trip_requests')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching trip request:', error);
    throw error;
  }

  if (!data) return null;

  // Fetch related user profiles separately
  const userIds = [data.requester_id, data.assigned_driver_id, data.approved_by].filter(Boolean);
  const vehicleIds = [data.preferred_vehicle_id, data.assigned_vehicle_id].filter(Boolean);

  const [profilesResult, vehiclesResult] = await Promise.all([
    userIds.length > 0 
      ? supabase.from('users_profile').select('id, first_name, last_name, phone, photo_url').in('id', userIds)
      : Promise.resolve({ data: [] }),
    vehicleIds.length > 0
      ? supabase.from('fleet_vehicles').select('*').in('id', vehicleIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profiles = (profilesResult.data || []).map((p: any) => ({
    ...p,
    full_name: `${p.first_name} ${p.last_name}`
  }));
  const vehicles = vehiclesResult.data || [];

  return {
    ...data,
    requester_profile: profiles.find(p => p.id === data.requester_id) || null,
    assigned_driver_profile: profiles.find(p => p.id === data.assigned_driver_id) || null,
    approver_profile: profiles.find(p => p.id === data.approved_by) || null,
    preferred_vehicle: vehicles.find(v => v.id === data.preferred_vehicle_id) || null,
    assigned_vehicle: vehicles.find(v => v.id === data.assigned_vehicle_id) || null,
  } as TripRequest;
}

/**
 * Create a new trip request
 */
export async function createTripRequest(input: CreateTripRequestInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get user's department
  const { data: profile } = await supabase
    .from('users_profile')
    .select('department_id')
    .eq('id', user.id)
    .single();

  // Check if user is on leave
  const startDate = input.start_datetime.split('T')[0];
  const { data: isOnLeave } = await supabase
    .rpc('is_user_on_leave', {
      p_user_id: user.id,
      p_date: startDate,
    });

  if (isOnLeave) {
    throw new Error('Cannot submit trip request while on approved leave');
  }

  // Extract only the fields that exist in the database table
  const {
    purpose,
    pickup_location,
    destination,
    start_datetime,
    end_datetime,
    passengers,
    preferred_vehicle_id,
    notes,
  } = input;

  // Combine pickup and destination into destination field
  const fullDestination = pickup_location 
    ? `From: ${pickup_location} | To: ${destination}`
    : destination;

  const { data, error } = await supabase
    .from('trip_requests')
    .insert({
      purpose,
      destination: fullDestination,
      start_datetime,
      end_datetime,
      passengers: passengers && passengers.length > 0
        ? passengers.map((name: string) => ({ name }))
        : null,
      preferred_vehicle_id: preferred_vehicle_id || null,
      vehicle_requirements: notes || null,
      requester_id: user.id,
      department_id: profile?.department_id || null,
      passenger_count: input.passenger_count || (input.passengers?.length || 0) + 1,
    })
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error creating trip request:', error);
    throw error;
  }

  return data;
}

/**
 * Update a trip request (for pending requests only)
 */
export async function updateTripRequest(id: string, input: Partial<CreateTripRequestInput>): Promise<TripRequest> {
  const { data, error } = await supabase
    .from('trip_requests')
    .update(input)
    .eq('id', id)
    .eq('status', 'pending') // Can only update pending requests
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error updating trip request:', error);
    throw error;
  }

  return data;
}

/**
 * Cancel a trip request
 */
export async function cancelTripRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('trip_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .in('status', ['pending', 'approved', 'assigned']); // Can cancel if not started

  if (error) {
    console.error('Error cancelling trip request:', error);
    throw error;
  }
}

/**
 * Approve a trip request (HOD or Fleet Manager)
 */
export async function approveTripRequest(input: ApproveTripRequestInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('trip_requests')
    .update({
      status: 'approved',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      approval_comments: input.approval_comments,
    })
    .eq('id', input.id)
    .eq('status', 'pending')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error approving trip request:', error);
    throw error;
  }

  return data;
}

/**
 * Reject a trip request
 */
export async function rejectTripRequest(input: RejectTripRequestInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('trip_requests')
    .update({
      status: 'rejected',
      approved_by: user?.id,
      approved_at: new Date().toISOString(),
      rejection_reason: input.rejection_reason,
    })
    .eq('id', input.id)
    .eq('status', 'pending')
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error rejecting trip request:', error);
    throw error;
  }

  return data;
}

/**
 * Assign vehicle and driver to approved request (Fleet Manager)
 */
export async function assignTripRequest(input: AssignTripRequestInput): Promise<TripRequest> {
  const { data: { user } } = await supabase.auth.getUser();

  // Verify vehicle and driver availability
  const request = await getTripRequestById(input.id);
  
  if (!request) {
    throw new Error('Trip request not found');
  }

  const vehicleAvailability = await checkVehicleAvailability(
    input.assigned_vehicle_id,
    request.start_datetime,
    request.end_datetime,
    input.id
  );

  if (!vehicleAvailability.is_available) {
    throw new Error('Selected vehicle is not available for this time period');
  }

  const driverAvailability = await checkDriverAvailability(
    input.assigned_driver_id,
    request.start_datetime,
    request.end_datetime,
    input.id
  );

  if (!driverAvailability.is_available) {
    throw new Error('Selected driver is not available for this time period');
  }

  const { data, error } = await supabase
    .from('trip_requests')
    .update({
      status: 'assigned',
      assigned_vehicle_id: input.assigned_vehicle_id,
      assigned_driver_id: input.assigned_driver_id,
      assigned_by: user?.id,
      assigned_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .in('status', ['approved', 'assigned']) // Can re-assign
    .select(`
      *,
      department:departments!department_id(id, name)
    `)
    .single();

  if (error) {
    console.error('Error assigning trip request:', error);
    throw error;
  }

  return data;
}

// ==========================================
// DASHBOARD & STATISTICS
// ==========================================

/**
 * Get fleet dashboard statistics
 */
export async function getFleetDashboardStats(): Promise<FleetDashboardStats> {
  // Get vehicle counts by status
  const { data: vehicles } = await supabase
    .from('fleet_vehicles')
    .select('status')
    .neq('status', 'retired');

  const vehicleCounts = {
    total: vehicles?.length || 0,
    available: vehicles?.filter(v => v.status === 'available').length || 0,
    in_use: vehicles?.filter(v => v.status === 'in_use').length || 0,
    maintenance: vehicles?.filter(v => v.status === 'maintenance').length || 0,
  };

  // Get driver counts
  const { data: drivers } = await supabase
    .from('driver_profiles')
    .select('is_active');

  const driverCounts = {
    total: drivers?.length || 0,
    active: drivers?.filter(d => d.is_active).length || 0,
  };

  // Get pending requests count
  const { count: pendingCount } = await supabase
    .from('trip_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  // Get today's trips
  const today = new Date().toISOString().split('T')[0];
  const { count: todaysTrips } = await supabase
    .from('trip_requests')
    .select('*', { count: 'exact', head: true })
    .in('status', ['assigned', 'in_progress'])
    .gte('start_datetime', today)
    .lt('start_datetime', today + 'T23:59:59');

  // Get upcoming alerts (licenses, insurance, service)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0];

  // Get expiring licenses - fetch driver profiles and user profiles separately
  const { data: expiringDrivers } = await supabase
    .from('driver_profiles')
    .select('user_id, license_expiry')
    .lte('license_expiry', thirtyDaysStr)
    .eq('is_active', true);

  let expiringLicenseAlerts: { user_id: string; license_expiry: string; full_name: string }[] = [];
  if (expiringDrivers && expiringDrivers.length > 0) {
    const driverUserIds = expiringDrivers.map(d => d.user_id);
    const { data: driverProfiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name')
      .in('id', driverUserIds);
    
    const transformedDriverProfiles = (driverProfiles || []).map((p: any) => ({
      ...p,
      full_name: `${p.first_name} ${p.last_name}`
    }));
    
    expiringLicenseAlerts = expiringDrivers.map(d => ({
      user_id: d.user_id,
      license_expiry: d.license_expiry,
      full_name: transformedDriverProfiles?.find(p => p.id === d.user_id)?.full_name || 'Unknown Driver',
    }));
  }

  const { data: expiringInsurance } = await supabase
    .from('fleet_vehicles')
    .select('id, plate_number, insurance_expiry')
    .lte('insurance_expiry', thirtyDaysStr)
    .neq('status', 'retired');

  const { data: serviceDue } = await supabase
    .from('fleet_vehicles')
    .select('id, plate_number, next_service_date')
    .lte('next_service_date', thirtyDaysStr)
    .neq('status', 'retired');

  const alerts: FleetDashboardStats['upcoming_alerts'] = [
    ...(expiringLicenseAlerts?.map(l => ({
      type: 'license_expiry' as const,
      entity_id: l.user_id,
      entity_name: l.full_name,
      days_until: Math.ceil((new Date(l.license_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    })) || []),
    ...(expiringInsurance?.map(v => ({
      type: 'insurance_expiry' as const,
      entity_id: v.id,
      entity_name: v.plate_number,
      days_until: Math.ceil((new Date(v.insurance_expiry!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    })) || []),
    ...(serviceDue?.map(v => ({
      type: 'service_due' as const,
      entity_id: v.id,
      entity_name: v.plate_number,
      days_until: Math.ceil((new Date(v.next_service_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    })) || []),
  ].sort((a, b) => a.days_until - b.days_until);

  return {
    total_vehicles: vehicleCounts.total,
    available_vehicles: vehicleCounts.available,
    in_use_vehicles: vehicleCounts.in_use,
    maintenance_vehicles: vehicleCounts.maintenance,
    total_drivers: driverCounts.total,
    active_drivers: driverCounts.active,
    pending_requests: pendingCount || 0,
    todays_trips: todaysTrips || 0,
    upcoming_alerts: alerts,
  };
}

/**
 * Get my trip requests (for logged in user)
 */
export async function getMyTripRequests(): Promise<TripRequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  return getTripRequests({ requester_id: user.id });
}

/**
 * Get pending approvals for HOD (department requests)
 */
export async function getPendingDepartmentApprovals(): Promise<TripRequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  // Get user's department
  const { data: profile } = await supabase
    .from('users_profile')
    .select('department_id, role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'hod' && profile.role !== 'super_admin' && profile.role !== 'fleet_manager')) {
    return [];
  }

  // For fleet_manager and super_admin, show all pending
  if (profile.role === 'fleet_manager' || profile.role === 'super_admin') {
    return getTripRequests({ status: 'pending' });
  }

  // For HOD, show only department requests
  if (profile.department_id) {
    return getTripRequests({ 
      status: 'pending',
      department_id: profile.department_id,
    });
  }

  return [];
}

/**
 * Get approved requests awaiting assignment (for Fleet Manager)
 */
export async function getAwaitingAssignment(): Promise<TripRequest[]> {
  return getTripRequests({ status: 'approved' });
}

/**
 * Get driver's assigned trips
 */
export async function getDriverAssignedTrips(): Promise<TripRequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  return getTripRequests({ 
    driver_id: user.id,
    status: ['assigned', 'in_progress'],
  });
}
