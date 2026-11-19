import { supabase } from '../lib/supabaseClient';

export interface ClearanceItem {
  key: string;
  label: string;
  cleared: boolean;
  cleared_by_name?: string;
  cleared_at?: string;
  notes?: string;
}

export interface ExitRequest {
  id: string;
  user_id: string;
  employee_id: string;
  exit_type: 'resignation' | 'retirement' | 'termination' | 'contract_end' | 'mutual_agreement';
  notice_date: string;
  last_working_date: string;
  reason: string | null;
  status: 'pending' | 'acknowledged' | 'in_progress' | 'clearance' | 'completed' | 'cancelled';
  clearance_items: ClearanceItem[];
  exit_interview_done: boolean;
  exit_interview_date: string | null;
  exit_interview_notes: string | null;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  hr_notes: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  department_name?: string;
}

// HR: get all exit requests
export const getAllExitRequests = async (): Promise<{ data: ExitRequest[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('exit_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    const userIds = [...new Set(data.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, department_id')
      .in('id', userIds);
    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
    const deptMap = new Map(depts?.map(d => [d.id, d.name]) || []);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const enriched = data.map(r => {
      const p = profileMap.get(r.user_id);
      return {
        ...r,
        employee_name: p ? `${p.first_name} ${p.last_name}` : 'Unknown',
        department_name: p?.department_id ? deptMap.get(p.department_id) || null : null,
      };
    });
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Employee: get own exit request
export const getMyExitRequest = async (): Promise<{ data: ExitRequest | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('exit_requests')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Employee: submit exit request
export const submitExitRequest = async (input: {
  exit_type: ExitRequest['exit_type'];
  notice_date: string;
  last_working_date: string;
  reason?: string;
}): Promise<{ data: ExitRequest | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data: profile } = await supabase
      .from('users_profile')
      .select('employee_id')
      .eq('id', user.id)
      .single();

    const { data, error } = await supabase
      .from('exit_requests')
      .insert({ ...input, user_id: user.id, employee_id: profile?.employee_id || '' })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

// HR: update status
export const updateExitStatus = async (id: string, status: ExitRequest['status'], hrNotes?: string): Promise<{ error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const updates: any = { status, updated_at: new Date().toISOString() };
    if (hrNotes !== undefined) updates.hr_notes = hrNotes;
    if (status === 'acknowledged') { updates.acknowledged_by = user?.id; updates.acknowledged_at = new Date().toISOString(); }
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    const { error } = await supabase.from('exit_requests').update(updates).eq('id', id);
    return { error };
  } catch (err) {
    return { error: err };
  }
};

// HR: update clearance item
export const updateClearanceItem = async (id: string, clearanceItems: ClearanceItem[]): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('exit_requests')
    .update({ clearance_items: clearanceItems, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

// HR: save exit interview notes
export const saveExitInterview = async (id: string, notes: string, interviewDate: string): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('exit_requests')
    .update({ exit_interview_done: true, exit_interview_notes: notes, exit_interview_date: interviewDate, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};
