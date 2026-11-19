// Training & Development Service

import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingCourse {
  id: string;
  title: string;
  provider: string | null;
  category: string;
  duration_hours: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmployeeTraining {
  id: string;
  user_id: string;
  course_id: string | null;
  course_title: string;
  provider: string | null;
  training_date: string;
  completion_date: string | null;
  status: 'enrolled' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  score: number | null;
  certificate_url: string | null;
  cost: number | null;
  cost_currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_id?: string;
  department?: string;
}

export interface EmployeeSkill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_category: string;
  proficiency: number;
  certified: boolean;
  certification_body: string | null;
  expiry_date: string | null;
  notes: string | null;
  assessed_at: string | null;
  created_at: string;
  // Joined fields
  employee_name?: string;
}

// ─── Training Courses ─────────────────────────────────────────────────────────

export async function getTrainingCourses(): Promise<TrainingCourse[]> {
  const { data, error } = await supabase
    .from('training_courses')
    .select('*')
    .eq('is_active', true)
    .order('title');
  if (error) throw error;
  return (data ?? []) as TrainingCourse[];
}

export async function saveTrainingCourse(c: Partial<TrainingCourse>): Promise<TrainingCourse> {
  const { data, error } = await supabase
    .from('training_courses')
    .upsert({ ...c, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as TrainingCourse;
}

// ─── Employee Training Records ────────────────────────────────────────────────

export async function getAllEmployeeTraining(
  filters?: { userId?: string; status?: string }
): Promise<EmployeeTraining[]> {
  let query = supabase
    .from('employee_training')
    .select('*')
    .order('training_date', { ascending: false });

  if (filters?.userId) {
    query = query.eq('user_id', filters.userId);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Two-step: fetch matching profiles (user_id → auth.users, not users_profile)
  const userIds = [...new Set(data.map((r: any) => r.user_id as string))];
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, employee_id, department_id')
    .in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return data.map((row: any) => {
    const profile = profileMap.get(row.user_id);
    return {
      ...row,
      employee_name: profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : undefined,
      employee_id: profile?.employee_id ?? undefined,
      department: profile?.department_id ?? undefined,
    } as EmployeeTraining;
  });
}

export async function getMyTraining(): Promise<EmployeeTraining[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('employee_training')
    .select('*')
    .eq('user_id', user.id)
    .order('training_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EmployeeTraining[];
}

export async function saveEmployeeTraining(
  t: Partial<EmployeeTraining>
): Promise<EmployeeTraining> {
  // Strip joined fields before upsert
  const { employee_name, employee_id: _empId, department, ...payload } = t as any;
  void employee_name; void _empId; void department;

  const { data, error } = await supabase
    .from('employee_training')
    .upsert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as EmployeeTraining;
}

export async function deleteEmployeeTraining(id: string): Promise<void> {
  const { error } = await supabase
    .from('employee_training')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ─── Employee Skills ──────────────────────────────────────────────────────────

export async function getAllSkills(userId?: string): Promise<EmployeeSkill[]> {
  let query = supabase
    .from('employee_skills')
    .select('*')
    .order('skill_name');

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Two-step: user_id → auth.users, not users_profile
  const userIds = [...new Set(data.map((r: any) => r.user_id as string))];
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name')
    .in('id', userIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return data.map((row: any) => {
    const profile = profileMap.get(row.user_id);
    return {
      ...row,
      employee_name: profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : undefined,
    } as EmployeeSkill;
  });
}

export async function getMySkills(): Promise<EmployeeSkill[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('employee_skills')
    .select('*')
    .eq('user_id', user.id)
    .order('skill_category', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EmployeeSkill[];
}

export async function saveSkill(s: Partial<EmployeeSkill>): Promise<EmployeeSkill> {
  const { employee_name, ...payload } = s as any;
  void employee_name;

  const { data, error } = await supabase
    .from('employee_skills')
    .upsert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data as EmployeeSkill;
}

export async function deleteSkill(id: string): Promise<void> {
  const { error } = await supabase
    .from('employee_skills')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
