import { supabase } from '../lib/supabaseClient';

export interface DisciplinaryCase {
  id: string;
  case_number: string;
  user_id: string;
  employee_id: string;
  incident_date: string;
  incident_description: string;
  category: 'misconduct' | 'poor_performance' | 'attendance' | 'policy_violation' | 'insubordination' | 'fraud' | 'other';
  action_type: 'verbal_warning' | 'written_warning' | 'final_warning' | 'suspension' | 'demotion' | 'dismissal' | 'no_action';
  action_date: string | null;
  outcome: string | null;
  status: 'open' | 'investigation' | 'hearing_scheduled' | 'hearing_done' | 'closed' | 'appealed';
  hearing_date: string | null;
  hearing_notes: string | null;
  employee_response: string | null;
  document_urls: string[];
  raised_by: string;
  assigned_to: string | null;
  closed_at: string | null;
  hr_notes: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  department_name?: string;
  raised_by_name?: string;
}

export interface GrievanceCase {
  id: string;
  case_number: string;
  user_id: string;
  employee_id: string;
  filed_date: string;
  grievance_type: 'harassment' | 'discrimination' | 'unfair_treatment' | 'workplace_safety' | 'pay_dispute' | 'working_conditions' | 'bullying' | 'other';
  description: string;
  against_user_id: string | null;
  status: 'submitted' | 'acknowledged' | 'investigation' | 'mediation' | 'resolved' | 'closed' | 'escalated';
  resolution: string | null;
  assigned_to: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  hr_notes: string | null;
  is_confidential: boolean;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  department_name?: string;
  against_name?: string;
}

const enrichWithProfiles = async (data: any[]) => {
  const userIds = [...new Set([
    ...data.map(d => d.user_id),
    ...data.map(d => d.raised_by).filter(Boolean),
    ...data.map(d => d.against_user_id).filter(Boolean),
  ])];
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, department_id')
    .in('id', userIds);
  const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
  const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
  const deptMap = new Map(depts?.map(d => [d.id, d.name]) || []);
  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
  return { profileMap, deptMap };
};

// ── Disciplinary ─────────────────────────────────────────────────────────────

export const getAllDisciplinaryCases = async (): Promise<{ data: DisciplinaryCase[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('disciplinary_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    const { profileMap, deptMap } = await enrichWithProfiles(data);
    const enriched = data.map(c => {
      const p = profileMap.get(c.user_id);
      const raiser = profileMap.get(c.raised_by);
      return {
        ...c,
        employee_name: p ? `${p.first_name} ${p.last_name}` : 'Unknown',
        department_name: p?.department_id ? deptMap.get(p.department_id) || null : null,
        raised_by_name: raiser ? `${raiser.first_name} ${raiser.last_name}` : 'Unknown',
      };
    });
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getMyDisciplinaryCases = async (): Promise<{ data: DisciplinaryCase[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('disciplinary_cases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createDisciplinaryCase = async (input: Pick<DisciplinaryCase, 'user_id' | 'employee_id' | 'incident_date' | 'incident_description' | 'category' | 'action_type'>): Promise<{ data: DisciplinaryCase | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('disciplinary_cases')
      .insert({ ...input, raised_by: user.id })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateDisciplinaryCase = async (id: string, updates: Partial<DisciplinaryCase>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('disciplinary_cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

// ── Grievances ───────────────────────────────────────────────────────────────

export const getAllGrievanceCases = async (): Promise<{ data: GrievanceCase[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('grievance_cases')
      .select('*')
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    const { profileMap, deptMap } = await enrichWithProfiles(data);
    const enriched = data.map(c => {
      const p = profileMap.get(c.user_id);
      const against = c.against_user_id ? profileMap.get(c.against_user_id) : null;
      return {
        ...c,
        employee_name: p ? `${p.first_name} ${p.last_name}` : 'Unknown',
        department_name: p?.department_id ? deptMap.get(p.department_id) || null : null,
        against_name: against ? `${against.first_name} ${against.last_name}` : null,
      };
    });
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const getMyGrievanceCases = async (): Promise<{ data: GrievanceCase[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('grievance_cases')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const submitGrievance = async (input: Pick<GrievanceCase, 'grievance_type' | 'description'> & { against_user_id?: string }): Promise<{ data: GrievanceCase | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data: profile } = await supabase.from('users_profile').select('employee_id').eq('id', user.id).single();
    const { data, error } = await supabase
      .from('grievance_cases')
      .insert({ ...input, user_id: user.id, employee_id: profile?.employee_id || '', filed_date: new Date().toISOString().split('T')[0] })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateGrievanceCase = async (id: string, updates: Partial<GrievanceCase>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('grievance_cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};
