// Field Assignment & Clock-In Service

import { supabase } from '../lib/supabaseClient';
import {
  FieldAssignment,
  FieldClockLog,
  FieldActivityLog,
  CreateFieldAssignmentInput,
  FieldClockInInput,
  FieldClockOutInput,
  CreateActivityLogInput,
  SupervisorVerifyInput,
  FieldAssignmentFilters,
  OfflineClockEntry,
  FIELD_OFFLINE_QUEUE_KEY,
} from '../types/fieldAssignment';

// After migration 027 all user-related FKs point to public.users_profile(id),
// so PostgREST embedded joins work correctly.
const ASSIGNMENT_SELECT = `
  *,
  supervisor:supervisor_id ( first_name, last_name ),
  creator:created_by ( first_name, last_name ),
  department:department_id ( name ),
  employees:field_assignment_employees (
    id, assignment_id, user_id, added_at,
    profile:user_id ( first_name, last_name, employee_id )
  )
`;

const CLOCK_LOG_SELECT = `
  *,
  employee:user_id ( first_name, last_name, employee_id ),
  verifier:verified_by ( first_name, last_name )
`;

// ─── Assignments ────────────────────────────────────────────

export async function getFieldAssignments(filters: FieldAssignmentFilters = {}): Promise<FieldAssignment[]> {
  let query = supabase
    .from('field_assignments')
    .select(ASSIGNMENT_SELECT)
    .order('planned_start', { ascending: false });

  if (filters.supervisor_id) query = query.eq('supervisor_id', filters.supervisor_id);
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  if (filters.date_from) query = query.gte('planned_start', filters.date_from);
  if (filters.date_to) query = query.lte('planned_end', filters.date_to);

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as FieldAssignment[]) || [];
}

export async function getMyFieldAssignments(): Promise<FieldAssignment[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get assignment IDs the user is assigned to
  const { data: empRows, error: empErr } = await supabase
    .from('field_assignment_employees')
    .select('assignment_id')
    .eq('user_id', user.id);
  if (empErr) throw empErr;

  if (!empRows || empRows.length === 0) return [];

  const ids = empRows.map(r => r.assignment_id);
  const { data, error } = await supabase
    .from('field_assignments')
    .select(ASSIGNMENT_SELECT)
    .in('id', ids)
    .not('status', 'eq', 'cancelled')
    .order('planned_start', { ascending: false });

  if (error) throw error;
  return (data as unknown as FieldAssignment[]) || [];
}

export async function getFieldAssignmentById(id: string): Promise<FieldAssignment | null> {
  const { data, error } = await supabase
    .from('field_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as FieldAssignment;
}

export async function createFieldAssignment(input: CreateFieldAssignmentInput): Promise<FieldAssignment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { employee_ids, ...rest } = input;

  const { data, error } = await supabase
    .from('field_assignments')
    .insert({ ...rest, created_by: user.id, status: 'active' })
    .select('id')
    .single();
  if (error) throw error;

  // Insert employee records
  if (employee_ids.length > 0) {
    const empRows = employee_ids.map(uid => ({
      assignment_id: data.id,
      user_id: uid,
      added_by: user.id,
    }));
    const { error: empErr } = await supabase
      .from('field_assignment_employees')
      .insert(empRows);
    if (empErr) throw empErr;
  }

  const assignment = await getFieldAssignmentById(data.id);
  return assignment!;
}

export async function updateFieldAssignment(id: string, updates: Partial<CreateFieldAssignmentInput>): Promise<void> {
  const { employee_ids, ...rest } = updates;

  if (Object.keys(rest).length > 0) {
    const { error } = await supabase
      .from('field_assignments')
      .update(rest)
      .eq('id', id);
    if (error) throw error;
  }

  if (employee_ids !== undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('field_assignment_employees').delete().eq('assignment_id', id);
    if (employee_ids.length > 0) {
      const empRows = employee_ids.map(uid => ({
        assignment_id: id,
        user_id: uid,
        added_by: user?.id,
      }));
      const { error } = await supabase.from('field_assignment_employees').insert(empRows);
      if (error) throw error;
    }
  }
}

export async function closeFieldAssignment(id: string, notes?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('field_assignments')
    .update({
      status: 'completed',
      hr_closed: true,
      hr_closed_by: user.id,
      hr_closed_at: new Date().toISOString(),
      hr_notes: notes ?? null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function cancelFieldAssignment(id: string): Promise<void> {
  const { error } = await supabase
    .from('field_assignments')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

// ─── Clock In / Out ─────────────────────────────────────────

export async function fieldClockIn(input: FieldClockInInput): Promise<FieldClockLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Check no open clock-in for this assignment
  const { data: existing } = await supabase
    .from('field_clock_logs')
    .select('id')
    .eq('assignment_id', input.assignment_id)
    .eq('user_id', user.id)
    .is('clock_out_time', null)
    .maybeSingle();

  if (existing) throw new Error('You already have an open clock-in for this assignment. Please clock out first.');

  // Use server RPC — clock_in_time is set to now() by the DB server
  const { data, error } = await supabase.rpc('server_field_clock_in', {
    p_assignment_id:      input.assignment_id,
    p_clock_in_lat:       input.clock_in_lat ?? null,
    p_clock_in_lng:       input.clock_in_lng ?? null,
    p_clock_in_accuracy:  input.clock_in_accuracy ?? null,
    p_clock_in_note:      input.clock_in_note ?? null,
    p_clock_in_photo_url: input.clock_in_photo_url ?? null,
    p_clock_in_offline:   input.clock_in_offline ?? false,
    p_selfie_url:         (input as any).selfie_url ?? null,
    p_face_match_score:   (input as any).face_match_score ?? null,
    p_face_verified_auto: (input as any).face_verified_auto ?? null,
  });

  if (error) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  return record as unknown as FieldClockLog;
}

export async function fieldClockOut(input: FieldClockOutInput): Promise<FieldClockLog> {
  // Use server RPC — clock_out_time = now() and work_hours computed server-side
  const { data, error } = await supabase.rpc('server_field_clock_out', {
    p_log_id:              input.log_id,
    p_clock_out_lat:       input.clock_out_lat ?? null,
    p_clock_out_lng:       input.clock_out_lng ?? null,
    p_clock_out_accuracy:  input.clock_out_accuracy ?? null,
    p_clock_out_note:      input.clock_out_note ?? null,
    p_clock_out_offline:   input.clock_out_offline ?? false,
    p_end_report:          input.end_report ?? null,
    p_deliverables_status: input.deliverables_status ?? [],
    p_mileage_km:          input.mileage_km ?? null,
    p_expenses_submitted:  input.expenses_submitted ?? false,
  });

  if (error) throw error;
  const record = Array.isArray(data) ? data[0] : data;
  return record as unknown as FieldClockLog;
}

export async function getMyOpenClockIn(assignmentId: string): Promise<FieldClockLog | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('field_clock_logs')
    .select(CLOCK_LOG_SELECT)
    .eq('assignment_id', assignmentId)
    .eq('user_id', user.id)
    .is('clock_out_time', null)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as FieldClockLog | null;
}

export async function getAssignmentClockLogs(assignmentId: string): Promise<FieldClockLog[]> {
  const { data, error } = await supabase
    .from('field_clock_logs')
    .select(CLOCK_LOG_SELECT)
    .eq('assignment_id', assignmentId)
    .order('clock_in_time', { ascending: true });
  if (error) throw error;
  return (data as unknown as FieldClockLog[]) || [];
}

// ─── Activity Logs ──────────────────────────────────────────

export async function createActivityLog(input: CreateActivityLogInput): Promise<FieldActivityLog> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('field_activity_logs')
    .insert({
      ...input,
      user_id: user.id,
      log_date: input.log_date ?? new Date().toISOString().split('T')[0],
    })
    .select('*, employee:user_id(first_name, last_name)')
    .single();

  if (error) throw error;
  return data as unknown as FieldActivityLog;
}

export async function getActivityLogs(assignmentId: string): Promise<FieldActivityLog[]> {
  const { data, error } = await supabase
    .from('field_activity_logs')
    .select('*, employee:user_id(first_name, last_name), acknowledger:acknowledged_by(first_name, last_name)')
    .eq('assignment_id', assignmentId)
    .order('log_date', { ascending: false });
  if (error) throw error;
  return (data as unknown as FieldActivityLog[]) || [];
}

export async function acknowledgeActivityLog(logId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('field_activity_logs')
    .update({ acknowledged_by: user.id, acknowledged_at: new Date().toISOString() })
    .eq('id', logId);
  if (error) throw error;
}

// ─── Supervisor Verification ────────────────────────────────

export async function supervisorVerifyLog(input: SupervisorVerifyInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('field_clock_logs')
    .update({
      verified_by: user.id,
      verified_at: new Date().toISOString(),
      verification_status: input.verification_status,
      supervisor_notes: input.supervisor_notes ?? null,
    })
    .eq('id', input.log_id);
  if (error) throw error;
}

// ─── Offline Queue ──────────────────────────────────────────

export function queueOfflineClockAction(entry: OfflineClockEntry): void {
  const queue: OfflineClockEntry[] = JSON.parse(
    localStorage.getItem(FIELD_OFFLINE_QUEUE_KEY) || '[]'
  );
  queue.push(entry);
  localStorage.setItem(FIELD_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getOfflineQueueSize(): number {
  const queue = JSON.parse(localStorage.getItem(FIELD_OFFLINE_QUEUE_KEY) || '[]');
  return queue.length;
}

export async function syncOfflineClockQueue(): Promise<{ synced: number; failed: number }> {
  const queue: OfflineClockEntry[] = JSON.parse(
    localStorage.getItem(FIELD_OFFLINE_QUEUE_KEY) || '[]'
  );
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: OfflineClockEntry[] = [];

  for (const entry of queue) {
    try {
      if (entry.type === 'clock_in') {
        await fieldClockIn(entry.payload as FieldClockInInput);
      } else {
        await fieldClockOut(entry.payload as FieldClockOutInput);
      }
      synced++;
    } catch {
      failed++;
      remaining.push(entry);
    }
  }

  localStorage.setItem(FIELD_OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed };
}

// ─── GPS Helper ─────────────────────────────────────────────

export async function getCurrentGpsPosition(): Promise<GeolocationPosition | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import('@capacitor/geolocation');
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
      return {
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: pos.timestamp,
      } as GeolocationPosition;
    }
  } catch { /* fall through to web API */ }

  if (navigator.geolocation) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10000,
      });
    });
  }
  return null;
}
