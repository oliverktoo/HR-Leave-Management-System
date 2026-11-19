// Benefits Administration Service — Kenya HR System

import { supabase } from '../lib/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BenefitType =
  | 'health_insurance'
  | 'nssf_tier2'
  | 'helb'
  | 'group_life'
  | 'personal_accident'
  | 'pension'
  | 'other';

export interface EmployeeBenefit {
  id: string;
  user_id: string;
  benefit_type: BenefitType;
  scheme_name: string | null;
  provider: string | null;
  policy_number: string | null;
  cover_level: string | null;
  employee_contribution: number | null;
  employer_contribution: number | null;
  effective_date: string | null;
  expiry_date: string | null;
  is_active: boolean;
  details: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined fields
  employee_name?: string;
  employee_id_code?: string;
  department?: string;
}

export const BENEFIT_TYPE_LABELS: Record<BenefitType, string> = {
  health_insurance:  'Health Insurance',
  nssf_tier2:        'NSSF Tier II',
  helb:              'HELB',
  group_life:        'Group Life',
  personal_accident: 'Personal Accident',
  pension:           'Pension',
  other:             'Other',
};

// ─── HR: all benefits (optionally filtered by user_id) ───────────────────────

export async function getAllBenefits(userId?: string): Promise<EmployeeBenefit[]> {
  // Step 1: fetch benefits (no join — user_id → auth.users, not users_profile)
  let query = supabase
    .from('employee_benefits')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Step 2: fetch matching profiles from users_profile
  const userIds = [...new Set(data.map((r: any) => r.user_id as string))];
  const { data: profiles } = await supabase
    .from('users_profile')
    .select('id, first_name, last_name, employee_id, department_id, departments!users_profile_department_id_fkey(name)')
    .in('id', userIds);

  const profileMap = new Map<string, any>();
  (profiles ?? []).forEach((p: any) => profileMap.set(p.id, p));

  return data.map((row: any) => {
    const profile = profileMap.get(row.user_id);
    const deptName =
      profile?.departments?.name ??
      (Array.isArray(profile?.departments) ? profile.departments[0]?.name : null) ??
      null;

    return {
      id:                    row.id,
      user_id:               row.user_id,
      benefit_type:          row.benefit_type as BenefitType,
      scheme_name:           row.scheme_name,
      provider:              row.provider,
      policy_number:         row.policy_number,
      cover_level:           row.cover_level,
      employee_contribution: row.employee_contribution,
      employer_contribution: row.employer_contribution,
      effective_date:        row.effective_date,
      expiry_date:           row.expiry_date,
      is_active:             row.is_active,
      details:               row.details ?? {},
      notes:                 row.notes,
      created_at:            row.created_at,
      updated_at:            row.updated_at,
      employee_name:         profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : undefined,
      employee_id_code:      profile?.employee_id ?? undefined,
      department:            deptName ?? undefined,
    };
  });
}

// ─── Employee: own benefits ───────────────────────────────────────────────────

export async function getMyBenefits(): Promise<EmployeeBenefit[]> {
  const { data, error } = await supabase
    .from('employee_benefits')
    .select('*')
    .order('benefit_type', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id:                    row.id,
    user_id:               row.user_id,
    benefit_type:          row.benefit_type as BenefitType,
    scheme_name:           row.scheme_name,
    provider:              row.provider,
    policy_number:         row.policy_number,
    cover_level:           row.cover_level,
    employee_contribution: row.employee_contribution,
    employer_contribution: row.employer_contribution,
    effective_date:        row.effective_date,
    expiry_date:           row.expiry_date,
    is_active:             row.is_active,
    details:               row.details ?? {},
    notes:                 row.notes,
    created_at:            row.created_at,
    updated_at:            row.updated_at,
  }));
}

// ─── Save (create / update) ───────────────────────────────────────────────────

export async function saveBenefit(b: Partial<EmployeeBenefit>): Promise<EmployeeBenefit> {
  const {
    employee_name: _en,
    employee_id_code: _eid,
    department: _dept,
    ...payload
  } = b as any;

  // Ensure updated_at is refreshed on update
  const record = { ...payload, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from('employee_benefits')
    .upsert(record, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as EmployeeBenefit;
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivateBenefit(id: string): Promise<void> {
  const { error } = await supabase
    .from('employee_benefits')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Hard delete ──────────────────────────────────────────────────────────────

export async function deleteBenefit(id: string): Promise<void> {
  const { error } = await supabase
    .from('employee_benefits')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatKES(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function isExpiringSoon(expiryDate: string | null, days = 30): boolean {
  if (!expiryDate) return false;
  const diff = new Date(expiryDate).getTime() - Date.now();
  return diff > 0 && diff < days * 86_400_000;
}

export function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return new Date(expiryDate).getTime() < Date.now();
}
