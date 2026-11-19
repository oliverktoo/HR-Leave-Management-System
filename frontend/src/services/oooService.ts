// OOO (Out of Office) Request Service

import { supabase } from '../lib/supabaseClient';
import {
  OOORequest,
  OOOAssignment,
  OOOBlackoutPeriod,
  CreateOOORequestInput,
  CreateOOOAssignmentInput,
  OOOAssignmentFilters,
  HODReviewInput,
  HRReviewInput,
  CreateBlackoutPeriodInput,
  OOORequestFilters,
  OOOSummaryRow,
  BlackoutConflict,
} from '../types/ooo';

// Plain * — no embedded joins. The created_by FK join was causing schema-cache
// failures (same issue as OOO_SELECT). Creator name is shown as a fallback.
const OOO_ASSIGNMENT_SELECT = `*`;

// Plain * — no embedded joins. All joins were causing schema-cache failures.
// Profile names are loaded separately via getProfilesForRequests().
const OOO_SELECT = `*`;

// ─── Queries ────────────────────────────────────────────────

export async function getOOORequests(filters: OOORequestFilters = {}): Promise<OOORequest[]> {
  let query = supabase
    .from('ooo_requests')
    .select(OOO_SELECT)
    .order('submitted_at', { ascending: false });

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.department_id) query = query.eq('department_id', filters.department_id);
  if (filters.absence_type) query = query.eq('absence_type', filters.absence_type);
  if (filters.is_urgent !== undefined) query = query.eq('is_urgent', filters.is_urgent);
  if (filters.date_from) query = query.gte('start_date', filters.date_from);
  if (filters.date_to) query = query.lte('end_date', filters.date_to);

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      query = query.in('status', filters.status);
    } else {
      query = query.eq('status', filters.status);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as OOORequest[]) || [];
}

export async function getMyOOORequests(): Promise<OOORequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return getOOORequests({ user_id: user.id });
}

export async function getOOORequestById(id: string): Promise<OOORequest | null> {
  const { data, error } = await supabase
    .from('ooo_requests')
    .select(OOO_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as unknown as OOORequest;
}

export async function getPendingOOOApprovals(): Promise<OOORequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('users_profile')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) throw new Error('Profile not found');

  if (profile.role === 'hod') {
    // SECURITY DEFINER RPC bypasses RLS — HOD sees pending requests for
    // assignments they created, regardless of the employee's department.
    const { data, error } = await supabase.rpc('get_hod_pending_ooo_requests');
    if (error) throw error;
    return (data as unknown as OOORequest[]) || [];
  }

  // hr_admin / super_admin: hod_approved requests + pending requests for
  // assignments they created (they are both creator and final approver).
  const { data, error } = await supabase.rpc('get_hr_pending_ooo_requests');
  if (error) throw error;
  return (data as unknown as OOORequest[]) || [];
}

// ─── Mutations ──────────────────────────────────────────────

export async function hasExistingOOORequest(assignmentId: string, forUserId?: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const targetUserId = forUserId ?? user.id;

  const { data } = await supabase
    .from('ooo_requests')
    .select('id')
    .eq('assignment_id', assignmentId)
    .eq('user_id', targetUserId)
    .not('status', 'eq', 'cancelled')
    .maybeSingle();

  return !!data;
}

export async function createOOORequest(input: CreateOOORequestInput): Promise<OOORequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Admin can submit on behalf of another employee via for_user_id
  const targetUserId = input.for_user_id ?? user.id;
  const { for_user_id: _omit, assignment_id, ...rest } = input;

  // Fetch the assignment to derive absence_type, dates, total_days
  const { data: assignment, error: aErr } = await supabase
    .from('ooo_assignments')
    .select('assignment_type, start_date, end_date, status')
    .eq('id', assignment_id)
    .single();
  if (aErr || !assignment) throw new Error('Assignment not found');
  if (assignment.status !== 'open') throw new Error('This assignment is no longer open for applications.');

  const { data: profile } = await supabase
    .from('users_profile')
    .select('employee_id, department_id')
    .eq('id', targetUserId)
    .single();
  if (!profile) throw new Error('Profile not found');

  const totalDays = calculateWorkingDays(assignment.start_date, assignment.end_date);

  const { data, error } = await supabase
    .from('ooo_requests')
    .insert({
      user_id: targetUserId,
      employee_id: profile.employee_id,
      department_id: profile.department_id,
      assignment_id,
      absence_type: assignment.assignment_type,
      start_date: assignment.start_date,
      end_date: assignment.end_date,
      total_days: totalDays,
      ...rest,
    })
    .select(OOO_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OOORequest;
}

export async function cancelOOORequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('ooo_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

export async function hodReviewOOO(input: HODReviewInput): Promise<OOORequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newStatus = input.decision === 'approved' ? 'hod_approved' : 'hod_rejected';

  const { data, error } = await supabase
    .from('ooo_requests')
    .update({
      status: newStatus,
      hod_id: user.id,
      hod_decision: input.decision,
      hod_decision_at: new Date().toISOString(),
      hod_comments: input.comments ?? null,
    })
    .eq('id', input.request_id)
    .select(OOO_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OOORequest;
}

export async function hrReviewOOO(input: HRReviewInput): Promise<OOORequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const newStatus = input.decision === 'approved' ? 'hr_approved' : 'hr_rejected';

  const { data, error } = await supabase
    .from('ooo_requests')
    .update({
      status: newStatus,
      hr_reviewer_id: user.id,
      hr_decision: input.decision,
      hr_decision_at: new Date().toISOString(),
      hr_comments: input.comments ?? null,
      payroll_flagged: input.payroll_flagged ?? false,
    })
    .eq('id', input.request_id)
    .select(OOO_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OOORequest;
}

// ─── OOO Assignments ────────────────────────────────────────

export async function getOOOAssignments(filters: OOOAssignmentFilters = {}): Promise<OOOAssignment[]> {
  let query = supabase
    .from('ooo_assignments')
    .select(OOO_ASSIGNMENT_SELECT)
    .order('start_date', { ascending: true });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.created_by) query = query.eq('created_by', filters.created_by);

  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as OOOAssignment[]) || [];
}

export async function getOpenOOOAssignments(): Promise<OOOAssignment[]> {
  return getOOOAssignments({ status: 'open' });
}

export async function getMyCreatedOOOAssignments(): Promise<OOOAssignment[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return getOOOAssignments({ created_by: user.id });
}

export async function createOOOAssignment(input: CreateOOOAssignmentInput): Promise<OOOAssignment> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('ooo_assignments')
    .insert({ ...input, created_by: user.id })
    .select(OOO_ASSIGNMENT_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as OOOAssignment;
}

export async function updateOOOAssignment(
  id: string,
  updates: Partial<CreateOOOAssignmentInput & { status: string }>
): Promise<void> {
  const { error } = await supabase
    .from('ooo_assignments')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function getAssignmentApplicants(assignmentId: string): Promise<OOORequest[]> {
  const { data, error } = await supabase
    .from('ooo_requests')
    .select(OOO_SELECT)
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as OOORequest[]) || [];
}

// ─── Blackout Periods ───────────────────────────────────────

export async function getBlackoutPeriods(activeOnly = true): Promise<OOOBlackoutPeriod[]> {
  let query = supabase
    .from('ooo_blackout_periods')
    .select('*')
    .order('start_date', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createBlackoutPeriod(input: CreateBlackoutPeriodInput): Promise<OOOBlackoutPeriod> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('ooo_blackout_periods')
    .insert({ ...input, created_by: user.id })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBlackoutPeriod(id: string, updates: Partial<CreateBlackoutPeriodInput & { is_active: boolean }>): Promise<void> {
  const { error } = await supabase
    .from('ooo_blackout_periods')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBlackoutPeriod(id: string): Promise<void> {
  const { error } = await supabase
    .from('ooo_blackout_periods')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── RPCs ───────────────────────────────────────────────────

export async function getOOOSummary(userId?: string, year?: number): Promise<OOOSummaryRow[]> {
  const { data, error } = await supabase.rpc('get_ooo_summary', {
    p_user_id: userId ?? null,
    p_year: year ?? new Date().getFullYear(),
  });
  if (error) throw error;
  return data || [];
}

export async function checkBlackoutConflict(
  startDate: string,
  endDate: string,
  absenceType = 'all'
): Promise<BlackoutConflict[]> {
  const { data, error } = await supabase.rpc('check_blackout_conflict', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_absence_type: absenceType,
  });
  if (error) throw error;
  return data || [];
}

// ─── Assignment map helper ───────────────────────────────────

export interface MiniAssignment {
  id: string;
  title: string;
  assignment_type: string;
  start_date: string;
  end_date: string;
}

export async function getAssignmentsByIds(ids: string[]): Promise<Record<string, MiniAssignment>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('ooo_assignments')
    .select('id, title, assignment_type, start_date, end_date')
    .in('id', ids);
  if (error) throw error;
  const map: Record<string, MiniAssignment> = {};
  for (const a of (data || [])) map[a.id] = a as MiniAssignment;
  return map;
}

// ─── Profile helpers ────────────────────────────────────────

export interface MiniProfile {
  id: string;
  first_name: string;
  last_name: string;
  employee_id: string;
  department_id: string | null;
}

export async function getProfilesByIds(ids: string[]): Promise<MiniProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, employee_id, department_id')
    .in('id', ids);
  if (error) throw error;
  return (data as MiniProfile[]) || [];
}

// ─── Helpers ────────────────────────────────────────────────

export function calculateWorkingDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
