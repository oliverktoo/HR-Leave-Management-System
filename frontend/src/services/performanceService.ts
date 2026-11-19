import { supabase } from '../lib/supabaseClient';

export interface AppraisalCycle {
  id: string;
  name: string;
  cycle_type: 'annual' | 'mid_year' | 'quarterly' | 'probation';
  year: number;
  start_date: string;
  end_date: string;
  self_assessment_due: string | null;
  manager_review_due: string | null;
  status: 'draft' | 'active' | 'completed' | 'archived';
  created_by: string;
  created_at: string;
  updated_at: string;
  participant_count?: number;
  completed_count?: number;
}

export interface KPI {
  title: string;
  description: string;
  weight_pct: number;
  target: string;
  actual: string;
  self_score: number | null;   // 1-5
  manager_score: number | null; // 1-5
}

export interface EmployeeAppraisal {
  id: string;
  cycle_id: string;
  user_id: string;
  employee_id: string;
  reviewer_id: string | null;
  kpis: KPI[];
  self_overall_score: number | null;
  manager_overall_score: number | null;
  final_score: number | null;
  self_assessment_comments: string | null;
  manager_comments: string | null;
  hr_comments: string | null;
  status: 'pending' | 'self_assessment' | 'manager_review' | 'hr_review' | 'completed';
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
  rating: 'exceptional' | 'exceeds_expectations' | 'meets_expectations' | 'needs_improvement' | 'unsatisfactory' | null;
  recommended_action: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  department_name?: string;
  reviewer_name?: string;
  cycle_name?: string;
}

// ── Cycles ───────────────────────────────────────────────────────────────────

export const getAppraisalCycles = async (): Promise<{ data: AppraisalCycle[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('appraisal_cycles')
      .select('*')
      .order('year', { ascending: false })
      .order('created_at', { ascending: false });
    if (error || !data) return { data: null, error };

    // Count participants per cycle
    const { data: appraisals } = await supabase
      .from('employee_appraisals')
      .select('cycle_id, status');
    const countMap = new Map<string, { total: number; completed: number }>();
    appraisals?.forEach(a => {
      const existing = countMap.get(a.cycle_id) || { total: 0, completed: 0 };
      existing.total++;
      if (a.status === 'completed') existing.completed++;
      countMap.set(a.cycle_id, existing);
    });

    return {
      data: data.map(c => ({
        ...c,
        participant_count: countMap.get(c.id)?.total || 0,
        completed_count: countMap.get(c.id)?.completed || 0,
      })),
      error: null,
    };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const createAppraisalCycle = async (cycle: Omit<AppraisalCycle, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'participant_count' | 'completed_count'>): Promise<{ data: AppraisalCycle | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('appraisal_cycles')
      .insert({ ...cycle, created_by: user.id })
      .select()
      .single();
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

export const updateAppraisalCycle = async (id: string, updates: Partial<AppraisalCycle>): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('appraisal_cycles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
};

// Enrol all active employees in a cycle (creates pending records)
export const enrolAllInCycle = async (cycleId: string): Promise<{ count: number; error: any }> => {
  try {
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, employee_id, department_id')
      .in('role', ['employee', 'hod', 'fleet_manager', 'hr_admin']);

    if (!profiles?.length) return { count: 0, error: null };

    // Get HODs per department for reviewer assignment
    const { data: hods } = await supabase
      .from('users_profile')
      .select('id, department_id')
      .eq('role', 'hod');
    const hodMap = new Map(hods?.map(h => [h.department_id, h.id]) || []);

    const rows = profiles.map(p => ({
      cycle_id: cycleId,
      user_id: p.id,
      employee_id: p.employee_id,
      reviewer_id: p.department_id ? hodMap.get(p.department_id) || null : null,
    }));

    const { error } = await supabase
      .from('employee_appraisals')
      .upsert(rows, { onConflict: 'cycle_id,user_id', ignoreDuplicates: true });

    return { count: rows.length, error };
  } catch (err) {
    return { count: 0, error: err };
  }
};

// ── Appraisals ────────────────────────────────────────────────────────────────

export const getAppraisalsByCycle = async (cycleId: string): Promise<{ data: EmployeeAppraisal[] | null; error: any }> => {
  try {
    const { data, error } = await supabase
      .from('employee_appraisals')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('created_at');
    if (error || !data) return { data: null, error };

    const userIds = [...new Set([...data.map(a => a.user_id), ...data.map(a => a.reviewer_id).filter(Boolean)])];
    const { data: profiles } = await supabase.from('users_profile').select('id, first_name, last_name, department_id').in('id', userIds);
    const deptIds = [...new Set(profiles?.map(p => p.department_id).filter(Boolean) || [])];
    const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
    const deptMap = new Map(depts?.map(d => [d.id, d.name]) || []);
    const pMap = new Map(profiles?.map(p => [p.id, p]) || []);

    const { data: cycle } = await supabase.from('appraisal_cycles').select('name').eq('id', cycleId).single();

    const enriched = data.map(a => {
      const p = pMap.get(a.user_id);
      const r = a.reviewer_id ? pMap.get(a.reviewer_id) : null;
      return {
        ...a,
        employee_name: p ? `${p.first_name} ${p.last_name}` : 'Unknown',
        department_name: p?.department_id ? deptMap.get(p.department_id) || null : null,
        reviewer_name: r ? `${r.first_name} ${r.last_name}` : null,
        cycle_name: cycle?.name || '',
      };
    });
    return { data: enriched, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Employee: get own appraisals
export const getMyAppraisals = async (): Promise<{ data: EmployeeAppraisal[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('employee_appraisals')
      .select('*, cycle:cycle_id(name, cycle_type, year, status, self_assessment_due)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Reviewer: get appraisals to review
export const getAppraisalsToReview = async (): Promise<{ data: EmployeeAppraisal[] | null; error: any }> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    const { data, error } = await supabase
      .from('employee_appraisals')
      .select('*, cycle:cycle_id(name, cycle_type, year, status)')
      .eq('reviewer_id', user.id)
      .in('status', ['self_assessment', 'manager_review'])
      .order('created_at');
    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
};

// Submit self-assessment
export const submitSelfAssessment = async (id: string, kpis: KPI[], comments: string, overallScore: number): Promise<{ error: any }> => {
  const { error } = await supabase
    .from('employee_appraisals')
    .update({
      kpis,
      self_assessment_comments: comments,
      self_overall_score: overallScore,
      status: 'manager_review',
      self_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { error };
};

// Manager review
export const submitManagerReview = async (id: string, kpis: KPI[], comments: string, overallScore: number, rating: EmployeeAppraisal['rating'], recommendedAction?: string): Promise<{ error: any }> => {
  const finalScore = overallScore;
  const { error } = await supabase
    .from('employee_appraisals')
    .update({
      kpis,
      manager_comments: comments,
      manager_overall_score: overallScore,
      final_score: finalScore,
      rating,
      recommended_action: recommendedAction || 'none',
      status: 'hr_review',
      manager_submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  return { error };
};

// HR complete
export const completeAppraisal = async (id: string, hrComments: string, finalScore?: number): Promise<{ error: any }> => {
  const updates: any = {
    hr_comments: hrComments,
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (finalScore !== undefined) updates.final_score = finalScore;
  const { error } = await supabase.from('employee_appraisals').update(updates).eq('id', id);
  return { error };
};
