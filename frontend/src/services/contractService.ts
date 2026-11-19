import { supabase } from '../lib/supabaseClient';

export interface EmployeeContract {
  id: string;
  user_id: string;
  employee_id: string;
  contract_type: 'permanent' | 'fixed_term' | 'probation' | 'contract' | 'internship' | 'casual';
  start_date: string;
  end_date: string | null;
  probation_end_date: string | null;
  job_title: string | null;
  department_id: string | null;
  gross_salary: number | null;
  status: 'active' | 'expired' | 'terminated' | 'renewed' | 'draft';
  renewal_reminder_sent: boolean;
  renewed_to_id: string | null;
  document_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  department_name?: string;
  days_to_expiry?: number | null;
}

export interface OnboardingChecklist {
  id: string;
  user_id: string;
  employee_id: string;
  contract_id: string | null;
  tasks: OnboardingTask[];
  status: 'in_progress' | 'completed';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
}

export interface OnboardingTask {
  key: string;
  label: string;
  done: boolean;
  done_at?: string;
  done_by_name?: string;
  due_days: number;
  notes?: string;
}

// HR: get all contracts
export const getAllContracts = async (): Promise<{ data: EmployeeContract[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('employee_contracts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, department_id')
      .in('id', userIds);
    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
    const deptMap = new Map(depts?.map(d => [d.id, d.name]) || []);
    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const today = new Date();
    const enriched = data.map(c => {
      const p = profileMap.get(c.user_id);
      let days_to_expiry: number | null = null;
      if (c.end_date && c.status === 'active') {
        days_to_expiry = Math.round((new Date(c.end_date).getTime() - today.getTime()) / 86400000);
      }
      return {
        ...c,
        employee_name: p ? `${p.first_name} ${p.last_name}` : 'Unknown',
        department_name: p?.department_id ? deptMap.get(p.department_id) || null : null,
        days_to_expiry,
      };
    });
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Staff: get own contract
export const getMyContract = async (): Promise<{ data: EmployeeContract | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };

    const { data, error } = await supabase
      .from('employee_contracts')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createContract = async (contract: Omit<EmployeeContract, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'renewal_reminder_sent' | 'employee_name' | 'department_name' | 'days_to_expiry'>): Promise<{ data: EmployeeContract | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('employee_contracts')
      .insert({ ...contract, created_by: user.id })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateContract = async (id: string, updates: Partial<EmployeeContract>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('employee_contracts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

// Onboarding
export const getAllOnboardingChecklists = async (): Promise<{ data: OnboardingChecklist[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('onboarding_checklists')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name')
      .in('id', userIds);
    const profileMap = new Map(profiles?.map(p => [p.id, `${p.first_name} ${p.last_name}`]) || []);

    return { data: data.map(c => ({ ...c, employee_name: profileMap.get(c.user_id) || 'Unknown' })), error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createOnboardingChecklist = async (userId: string, employeeId: string, contractId?: string): Promise<{ data: OnboardingChecklist | null; error: any }> => {
  const { data, error } = await supabase
    .from('onboarding_checklists')
    .insert({ user_id: userId, employee_id: employeeId, contract_id: contractId || null })
    .select()
    .single();
  return { data, error };
};

export const updateOnboardingTasks = async (id: string, tasks: OnboardingTask[]): Promise<{ error: any }> => {
  const allDone = tasks.every(t => t.done);
  const updates: any = { tasks, updated_at: new Date().toISOString() };
  if (allDone) { updates.status = 'completed'; updates.completed_at = new Date().toISOString(); }
  const { error } = await supabase.from('onboarding_checklists').update(updates).eq('id', id);
  return { error };
};
