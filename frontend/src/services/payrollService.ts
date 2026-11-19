// Payroll Service — Kenya-law-compliant computation engine + CRUD for runs/lines

import { supabase } from '../lib/supabaseClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PayrollSettings {
  paye_bands: Array<{ min: number; max: number | null; rate: number }>;
  paye_personal_relief: number;
  nssf_tier1_ceiling: number;
  nssf_tier2_ceiling: number;
  nssf_employee_rate: number;
  nssf_employer_rate: number;
  sha_rate: number;
  sha_minimum: number;
  housing_levy_employee_rate: number;
  housing_levy_employer_rate: number;
}

export interface EmployeePayrollProfile {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  department_id: string | null;
  job_title: string | null;
  kra_pin: string | null;
  nssf_number: string | null;
  sha_number: string | null;
  helb_account: string | null;
  helb_monthly_amount: number;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_number: string | null;
  employment_type: string;
  basic_salary: number;
  allowances: Record<string, number>;
  salary_grade: string | null;
  payroll_active: boolean;
  // Non-statutory deductions (SOP 6.4)
  sacco_contribution: number;
  sacco_loan_repayment: number;
  medical_premium: number;
  supplementary_pension: number;
  salary_advance_monthly_recovery: number;
}

// Variable pay inputs per employee for a run (SOP 6.2)
export interface VariablePayInput {
  user_id: string;
  overtime_hours: number;
  overtime_amount: number;     // pre-approved by HOD
  bonus_amount: number;
  acting_allowance: number;
  per_diem_amount: number;
  benefits_in_kind: number;    // non-cash taxable benefits (company car, housing, etc.)
  court_deduction_amount: number;
  court_deduction_ref: string;
  other_variable_pay: Array<{ name: string; amount: number }>;
}

// Statutory remittance record
export interface PayrollRemittance {
  id: string;
  run_id: string;
  remittance_type: 'paye' | 'nssf' | 'shif' | 'housing_levy';
  amount: number;
  due_date: string;
  remitted_at: string | null;
  remitted_by: string | null;
  reference_number: string | null;
  status: 'pending' | 'remitted' | 'late' | 'cancelled';
  notes: string | null;
}

// Salary change record
export interface SalaryChange {
  id: string;
  user_id: string;
  change_type: 'increment' | 'decrement' | 'promotion' | 'grade_change' | 'acting' | 'correction' | 'joining' | 'termination';
  old_basic_salary: number | null;
  new_basic_salary: number | null;
  old_allowances: Record<string, number> | null;
  new_allowances: Record<string, number> | null;
  old_grade: string | null;
  new_grade: string | null;
  effective_date: string;
  reason: string;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ComputedPayrollLine {
  user_id: string;
  employee_id: string;
  basic_salary: number;
  allowances: Record<string, number>;
  // Variable pay (SOP 6.2)
  overtime_hours: number;
  overtime_amount: number;
  bonus_amount: number;
  acting_allowance: number;
  per_diem_amount: number;
  other_variable_pay: Array<{ name: string; amount: number }>;
  benefits_in_kind: number;       // non-cash BIK (added to taxable income, not cash gross)
  gross_pay: number;
  nssf_tier1: number;
  nssf_tier2: number;
  sha_amount: number;
  housing_levy_employee: number;
  taxable_income: number;
  paye_before_relief: number;
  personal_relief: number;
  insurance_relief: number;       // 15% of medical_premium, capped KES 5,000/month
  paye_amount: number;
  helb_amount: number;
  // Non-statutory deductions (SOP 6.4)
  sacco_contribution: number;
  sacco_loan_repayment: number;
  medical_premium: number;
  supplementary_pension: number;
  salary_advance_recovery: number;
  court_deduction_amount: number;
  court_deduction_ref: string;
  other_deductions: Array<{ name: string; amount: number }>;
  total_deductions: number;
  net_pay: number;
  nssf_employer: number;
  housing_levy_employer: number;
}

export interface PayrollRun {
  id: string;
  pay_period_year: number;
  pay_period_month: number;
  run_label: string | null;
  status: string;
  prepared_by: string | null;
  prepared_at: string | null;
  hr_reviewer_id: string | null;
  hr_approved_at: string | null;
  hr_comments: string | null;
  finance_reviewer_id: string | null;
  finance_approved_at: string | null;
  finance_comments: string | null;
  ceo_reviewer_id: string | null;
  ceo_approved_at: string | null;
  ceo_comments: string | null;
  total_gross: number | null;
  total_nssf_employee: number | null;
  total_sha: number | null;
  total_housing_levy_employee: number | null;
  total_paye: number | null;
  total_helb: number | null;
  total_net: number | null;
  total_nssf_employer: number | null;
  total_housing_levy_employer: number | null;
  notes: string | null;
  working_days_in_period: number | null;
  // SOP cycle phase tracking (migration 057)
  cycle_phase: string | null;
  revision_of: string | null;
  revision_notes: string | null;
  revision_number: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollLine {
  id: string;
  run_id: string;
  user_id: string;
  employee_id: string | null;
  basic_salary: number;
  allowances: Record<string, number>;
  // Variable pay (SOP 6.2)
  overtime_amount: number;
  overtime_hours: number;
  bonus_amount: number;
  acting_allowance: number;
  per_diem_amount: number;
  other_variable_pay: Array<{ name: string; amount: number }>;
  benefits_in_kind: number;
  gross_pay: number;
  nssf_tier1: number;
  nssf_tier2: number;
  nssf_total: number;
  sha_amount: number;
  housing_levy_employee: number;
  taxable_income: number;
  paye_before_relief: number;
  personal_relief: number;
  insurance_relief: number;
  paye_amount: number;
  helb_amount: number;
  // Non-statutory deductions (SOP 6.4)
  sacco_contribution: number;
  sacco_loan_repayment: number;
  medical_premium: number;
  supplementary_pension: number;
  salary_advance_recovery: number;
  court_deduction_amount: number;
  court_deduction_ref: string | null;
  other_deductions: Array<{ name: string; amount: number }>;
  total_deductions: number;
  net_pay: number;
  nssf_employer: number;
  housing_levy_employer: number;
  is_override: boolean;
  override_reason: string | null;
  days_worked: number | null;
  leave_days: number;
  ooo_days: number;
  created_at: string;
  updated_at: string;
  // Joined
  profile?: {
    first_name: string;
    last_name: string;
    kra_pin?: string;
    nssf_number?: string;
    bank_name?: string;
    bank_account_number?: string;
    department_id?: string;
  };
}

export interface SalaryGrade {
  id: string;
  grade_code: string;
  grade_name: string;
  basic_salary_min: number | null;
  basic_salary_max: number | null;
}

// ─── Settings loader ─────────────────────────────────────────────────────────

let _settingsCache: PayrollSettings | null = null;

export async function getPayrollSettings(): Promise<PayrollSettings> {
  if (_settingsCache) return _settingsCache;

  const { data, error } = await supabase
    .from('payroll_settings')
    .select('setting_key, setting_value');
  if (error) throw error;

  const map: Record<string, unknown> = {};
  for (const row of data || []) {
    map[row.setting_key] = row.setting_value;
  }

  _settingsCache = {
    paye_bands:                   map.paye_bands as PayrollSettings['paye_bands'],
    paye_personal_relief:         Number(map.paye_personal_relief),
    nssf_tier1_ceiling:           Number(map.nssf_tier1_ceiling),
    nssf_tier2_ceiling:           Number(map.nssf_tier2_ceiling),
    nssf_employee_rate:           Number(map.nssf_employee_rate),
    nssf_employer_rate:           Number(map.nssf_employer_rate),
    sha_rate:                     Number(map.sha_rate),
    sha_minimum:                  Number(map.sha_minimum),
    housing_levy_employee_rate:   Number(map.housing_levy_employee_rate),
    housing_levy_employer_rate:   Number(map.housing_levy_employer_rate),
  };
  return _settingsCache;
}

export function clearPayrollSettingsCache(): void {
  _settingsCache = null;
}

export async function updatePayrollSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('payroll_settings')
    .update({ setting_value: value })
    .eq('setting_key', key);
  if (error) throw error;
  clearPayrollSettingsCache();
}

// ─── Computation Engine ──────────────────────────────────────────────────────

export function computeNSSF(
  grossPay: number,
  s: Pick<PayrollSettings, 'nssf_tier1_ceiling' | 'nssf_tier2_ceiling' | 'nssf_employee_rate' | 'nssf_employer_rate'>
): { tier1: number; tier2: number; employee: number; employer: number } {
  const tier1Base = Math.min(grossPay, s.nssf_tier1_ceiling);
  const tier1 = Math.round(tier1Base * s.nssf_employee_rate);

  const tier2Base = Math.max(0, Math.min(grossPay, s.nssf_tier2_ceiling) - s.nssf_tier1_ceiling);
  const tier2 = Math.round(tier2Base * s.nssf_employee_rate);

  const employerTier1 = Math.round(tier1Base * s.nssf_employer_rate);
  const employerTier2 = Math.round(tier2Base * s.nssf_employer_rate);

  return {
    tier1,
    tier2,
    employee: tier1 + tier2,
    employer: employerTier1 + employerTier2,
  };
}

export function computePAYE(
  taxableIncome: number,
  bands: PayrollSettings['paye_bands'],
  personalRelief: number
): { payeBeforeRelief: number; paye: number } {
  let payeBeforeRelief = 0;
  let remaining = taxableIncome;

  for (const band of bands) {
    if (remaining <= 0) break;
    const bandSize = band.max != null ? band.max - band.min : Infinity;
    const inBand = Math.min(remaining, bandSize);
    payeBeforeRelief += inBand * band.rate;
    remaining -= inBand;
  }

  payeBeforeRelief = Math.round(payeBeforeRelief);
  const paye = Math.max(0, Math.round(payeBeforeRelief - personalRelief));

  return { payeBeforeRelief, paye };
}

export function computeSHA(
  grossPay: number,
  s: Pick<PayrollSettings, 'sha_rate' | 'sha_minimum'>
): number {
  return Math.max(s.sha_minimum, Math.round(grossPay * s.sha_rate));
}

export function computeHousingLevy(
  grossPay: number,
  s: Pick<PayrollSettings, 'housing_levy_employee_rate' | 'housing_levy_employer_rate'>
): { employee: number; employer: number } {
  return {
    employee: Math.round(grossPay * s.housing_levy_employee_rate),
    employer: Math.round(grossPay * s.housing_levy_employer_rate),
  };
}

/** Max monthly pension contribution (incl. NSSF) deductible for PAYE — ITA as amended Dec 2024. */
export const PENSION_DEDUCTION_CAP_MONTHLY = 30_000;

export function computePayrollLine(
  profile: Pick<
    EmployeePayrollProfile,
    'id' | 'employee_id' | 'basic_salary' | 'allowances' | 'helb_monthly_amount' |
    'sacco_contribution' | 'sacco_loan_repayment' | 'medical_premium' |
    'supplementary_pension' | 'salary_advance_monthly_recovery'
  >,
  settings: PayrollSettings,
  otherDeductions: Array<{ name: string; amount: number }> = [],
  unpaidDays = 0,
  workingDaysInMonth = 22,
  variablePay: Partial<VariablePayInput> = {}
): ComputedPayrollLine {
  const allowancesTotal = Object.values(profile.allowances || {}).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );

  // Variable pay components (SOP 6.2)
  const overtimeAmount    = variablePay.overtime_amount    || 0;
  const bonusAmount       = variablePay.bonus_amount       || 0;
  const actingAllowance   = variablePay.acting_allowance   || 0;
  const perDiemAmount     = variablePay.per_diem_amount    || 0;
  const bik               = variablePay.benefits_in_kind   || 0;
  const otherVariablePay  = variablePay.other_variable_pay || [];
  const otherVariableTotal = otherVariablePay.reduce((s, v) => s + v.amount, 0);

  const fixedGross = profile.basic_salary + allowancesTotal;

  // Prorate fixed pay for unpaid absence days
  const prorationFactor = workingDaysInMonth > 0 && unpaidDays > 0
    ? Math.max(0, (workingDaysInMonth - unpaidDays) / workingDaysInMonth)
    : 1;

  // Variable pay is NOT prorated (paid for what was earned)
  // gross_pay = cash components only (BIK excluded — not a bank transfer)
  const grossPay = Math.round(fixedGross * prorationFactor)
    + overtimeAmount + bonusAmount + actingAllowance + perDiemAmount + otherVariableTotal;

  // NSSF — computed on cash gross (BIK excluded per NSSF Act)
  const nssf = computeNSSF(grossPay, settings);

  // SHA/SHIF and Housing Levy (employee shares)
  const sha = computeSHA(grossPay, settings);
  const housing = computeHousingLevy(grossPay, settings);

  // Taxable income (Tax Laws (Amendment) Act 2024, effective 27 Dec 2024 — KRA
  // public notice 2157): SHIF and the Affordable Housing Levy are deducted in
  // full, and pension contributions (NSSF + registered supplementary pension)
  // up to KES 30,000/month.
  const pensionDeduction = Math.min(
    nssf.employee + (profile.supplementary_pension || 0),
    PENSION_DEDUCTION_CAP_MONTHLY
  );
  const taxableIncome = Math.max(0, grossPay + bik - pensionDeduction - sha - housing.employee);

  // PAYE (before reliefs)
  const { payeBeforeRelief, paye: payeAfterPersonalRelief } = computePAYE(
    taxableIncome,
    settings.paye_bands,
    settings.paye_personal_relief
  );

  // Insurance relief = 15% of qualifying medical premium, capped KES 5,000/month
  const insuranceRelief = Math.min(Math.round((profile.medical_premium || 0) * 0.15), 5000);
  const paye = Math.max(0, payeAfterPersonalRelief - insuranceRelief);

  // Statutory deductions total
  const statutoryTotal = nssf.employee + sha + housing.employee + paye;

  // Non-statutory deductions (SOP 6.4)
  const helb               = profile.helb_monthly_amount            || 0;
  const sacco              = (profile.sacco_contribution            || 0) + (profile.sacco_loan_repayment || 0);
  const medical            = profile.medical_premium                || 0;
  const pension            = profile.supplementary_pension          || 0;
  const advanceRecovery    = profile.salary_advance_monthly_recovery || 0;
  const courtDeduction     = variablePay.court_deduction_amount     || 0;
  const otherDeductTotal   = otherDeductions.reduce((s, d) => s + d.amount, 0);

  const nonStatutoryTotal = helb + sacco + medical + pension + advanceRecovery + courtDeduction + otherDeductTotal;

  const totalDeductions = statutoryTotal + nonStatutoryTotal;
  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    user_id: profile.id,
    employee_id: profile.employee_id,
    basic_salary: profile.basic_salary,
    allowances: profile.allowances || {},
    overtime_hours:     variablePay.overtime_hours  || 0,
    overtime_amount:    overtimeAmount,
    bonus_amount:       bonusAmount,
    acting_allowance:   actingAllowance,
    per_diem_amount:    perDiemAmount,
    benefits_in_kind:   bik,
    other_variable_pay: otherVariablePay,
    gross_pay: grossPay,
    nssf_tier1: nssf.tier1,
    nssf_tier2: nssf.tier2,
    sha_amount: sha,
    housing_levy_employee: housing.employee,
    taxable_income: taxableIncome,
    paye_before_relief: payeBeforeRelief,
    personal_relief: settings.paye_personal_relief,
    insurance_relief:   insuranceRelief,
    paye_amount: paye,
    helb_amount: helb,
    sacco_contribution:        profile.sacco_contribution          || 0,
    sacco_loan_repayment:      profile.sacco_loan_repayment        || 0,
    medical_premium:           medical,
    supplementary_pension:     pension,
    salary_advance_recovery:   advanceRecovery,
    court_deduction_amount:    courtDeduction,
    court_deduction_ref:       variablePay.court_deduction_ref     || '',
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay: netPay,
    nssf_employer: nssf.employer,
    housing_levy_employer: housing.employer,
  };
}

// ─── Payroll Runs CRUD ───────────────────────────────────────────────────────

export async function getPayrollRuns(): Promise<PayrollRun[]> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .order('pay_period_year', { ascending: false })
    .order('pay_period_month', { ascending: false });
  if (error) throw error;
  return (data as PayrollRun[]) || [];
}

export async function getPayrollRunById(id: string): Promise<PayrollRun | null> {
  const { data, error } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as PayrollRun;
}

export async function createPayrollRun(
  year: number,
  month: number,
  notes?: string
): Promise<PayrollRun> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({
      pay_period_year: year,
      pay_period_month: month,
      notes: notes ?? null,
      prepared_by: user.id,
      prepared_at: new Date().toISOString(),
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  return data as PayrollRun;
}

// ─── Payroll Lines CRUD ───────────────────────────────────────────────────────

export async function getPayrollLines(runId: string): Promise<PayrollLine[]> {
  const { data, error } = await supabase
    .from('payroll_lines')
    .select('*')
    .eq('run_id', runId)
    .order('employee_id', { ascending: true });
  if (error) throw error;

  const lines = (data as PayrollLine[]) || [];

  // Batch-fetch profiles
  const userIds = [...new Set(lines.map(l => l.user_id))];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('users_profile')
      .select('id, first_name, last_name, kra_pin, nssf_number, bank_name, bank_account_number, department_id')
      .in('id', userIds);
    const profileMap: Record<string, PayrollLine['profile']> = {};
    for (const p of (profiles || [])) profileMap[p.id] = p;
    for (const line of lines) line.profile = profileMap[line.user_id];
  }

  return lines;
}

export async function upsertPayrollLines(
  runId: string,
  lines: ComputedPayrollLine[]
): Promise<void> {
  const rows = lines.map(l => ({
    run_id: runId,
    user_id: l.user_id,
    employee_id: l.employee_id,
    basic_salary: l.basic_salary,
    allowances: l.allowances,
    gross_pay: l.gross_pay,
    nssf_tier1: l.nssf_tier1,
    nssf_tier2: l.nssf_tier2,
    sha_amount: l.sha_amount,
    housing_levy_employee: l.housing_levy_employee,
    taxable_income: l.taxable_income,
    paye_before_relief: l.paye_before_relief,
    personal_relief: l.personal_relief,
    paye_amount: l.paye_amount,
    helb_amount: l.helb_amount,
    other_deductions: l.other_deductions,
    total_deductions: l.total_deductions,
    net_pay: l.net_pay,
    nssf_employer: l.nssf_employer,
    housing_levy_employer: l.housing_levy_employer,
  }));

  const { error } = await supabase
    .from('payroll_lines')
    .upsert(rows, { onConflict: 'run_id,user_id' });
  if (error) throw error;
}

export async function overridePayrollLine(
  lineId: string,
  overrides: Partial<Pick<PayrollLine,
    'basic_salary' | 'allowances' | 'gross_pay' | 'nssf_tier1' | 'nssf_tier2' |
    'sha_amount' | 'housing_levy_employee' | 'paye_amount' | 'helb_amount' |
    'other_deductions' | 'total_deductions' | 'net_pay' | 'nssf_employer' |
    'housing_levy_employer'>>,
  reason: string
): Promise<void> {
  const { error } = await supabase
    .from('payroll_lines')
    .update({ ...overrides, is_override: true, override_reason: reason })
    .eq('id', lineId);
  if (error) throw error;
}

// ─── Absence data types ───────────────────────────────────────────────────────

interface AbsenceRow {
  user_id: string;
  leave_days: number;
  ooo_days: number;
  unpaid_days: number;
}

// ─── Compute & save an entire run ────────────────────────────────────────────

export async function computeAndSaveRun(runId: string): Promise<{
  linesCount: number;
  totals: Partial<PayrollRun>;
}> {
  // Load run to get period
  const run = await getPayrollRunById(runId);
  if (!run) throw new Error('Payroll run not found');

  const year  = run.pay_period_year;
  const month = run.pay_period_month;

  // Load settings, active employees, working days, absence data, and existing lines in parallel
  const [settings, empResult, wdResult, absenceResult, existingLinesResult] = await Promise.all([
    getPayrollSettings(),
    supabase
      .from('users_profile')
      .select(
        'id, employee_id, basic_salary, allowances, helb_monthly_amount, payroll_active, ' +
        'sacco_contribution, sacco_loan_repayment, medical_premium, supplementary_pension, salary_advance_monthly_recovery'
      )
      .eq('payroll_active', true)
      .eq('is_active', true),
    supabase.rpc('count_working_days_in_month', { p_year: year, p_month: month }),
    supabase.rpc('get_payroll_absence_days', { p_year: year, p_month: month }),
    supabase
      .from('payroll_lines')
      .select('user_id, overtime_amount, overtime_hours, bonus_amount, acting_allowance, per_diem_amount, benefits_in_kind, other_variable_pay, court_deduction_amount, court_deduction_ref')
      .eq('run_id', runId),
  ]);

  if (empResult.error) throw empResult.error;
  // Without these, a recompute would silently wipe overtime/bonuses already entered
  if (existingLinesResult.error) throw existingLinesResult.error;
  if (absenceResult.error) throw absenceResult.error;

  const workingDaysInMonth: number = (wdResult.data as number) || 22;

  // Build absence map: user_id -> absence row
  const absenceMap: Record<string, AbsenceRow> = {};
  for (const row of (absenceResult.data as AbsenceRow[]) || []) {
    absenceMap[row.user_id] = row;
  }

  // Preserve any variable pay already entered on existing lines
  const existingVarPayMap: Record<string, Partial<VariablePayInput>> = {};
  for (const row of (existingLinesResult.data || [])) {
    existingVarPayMap[row.user_id] = {
      overtime_amount:        row.overtime_amount        || 0,
      overtime_hours:         row.overtime_hours         || 0,
      bonus_amount:           row.bonus_amount           || 0,
      acting_allowance:       row.acting_allowance       || 0,
      per_diem_amount:        row.per_diem_amount        || 0,
      benefits_in_kind:       row.benefits_in_kind       || 0,
      other_variable_pay:     row.other_variable_pay     || [],
      court_deduction_amount: row.court_deduction_amount || 0,
      court_deduction_ref:    row.court_deduction_ref    || '',
    };
  }

  const computed = ((empResult.data as unknown as Array<Record<string, unknown>>) || []).map(emp => {
    const absence = absenceMap[emp.id as string];
    const unpaidDays = absence?.unpaid_days ?? 0;
    const varPay = existingVarPayMap[emp.id as string] ?? {};
    return computePayrollLine(
      {
        id:                               emp.id as string,
        employee_id:                      emp.employee_id as string,
        basic_salary:                     (emp.basic_salary as number) || 0,
        allowances:                       (emp.allowances as Record<string, number>) || {},
        helb_monthly_amount:              (emp.helb_monthly_amount as number) || 0,
        sacco_contribution:               (emp.sacco_contribution as number) || 0,
        sacco_loan_repayment:             (emp.sacco_loan_repayment as number) || 0,
        medical_premium:                  (emp.medical_premium as number) || 0,
        supplementary_pension:            (emp.supplementary_pension as number) || 0,
        salary_advance_monthly_recovery:  (emp.salary_advance_monthly_recovery as number) || 0,
      },
      settings,
      [],
      unpaidDays,
      workingDaysInMonth,
      varPay
    );
  });

  // Store leave/ooo days on lines
  const linesWithAbsence = computed.map(line => {
    const absence = absenceMap[line.user_id];
    return {
      ...line,
      _leave_days: absence?.leave_days ?? 0,
      _ooo_days:   absence?.ooo_days   ?? 0,
      _days_worked: workingDaysInMonth - (absence?.unpaid_days ?? 0),
    };
  });

  await upsertPayrollLinesWithAbsence(runId, linesWithAbsence);

  // Aggregate totals
  const totals: Partial<PayrollRun> = {
    working_days_in_period:       workingDaysInMonth,
    total_gross:                  sum(computed, 'gross_pay'),
    total_nssf_employee:          sum(computed, c => c.nssf_tier1 + c.nssf_tier2),
    total_sha:                    sum(computed, 'sha_amount'),
    total_housing_levy_employee:  sum(computed, 'housing_levy_employee'),
    total_paye:                   sum(computed, 'paye_amount'),
    total_helb:                   sum(computed, 'helb_amount'),
    total_net:                    sum(computed, 'net_pay'),
    total_nssf_employer:          sum(computed, 'nssf_employer'),
    total_housing_levy_employer:  sum(computed, 'housing_levy_employer'),
  };

  const { error: runErr } = await supabase
    .from('payroll_runs')
    .update(totals)
    .eq('id', runId);
  if (runErr) throw runErr;

  return { linesCount: computed.length, totals };
}

async function upsertPayrollLinesWithAbsence(
  runId: string,
  lines: Array<ComputedPayrollLine & { _leave_days: number; _ooo_days: number; _days_worked: number }>
): Promise<void> {
  const rows = lines.map(l => ({
    run_id: runId,
    user_id: l.user_id,
    employee_id: l.employee_id,
    basic_salary: l.basic_salary,
    allowances: l.allowances,
    // Variable pay columns (SOP 6.2)
    overtime_amount:   l.overtime_amount,
    overtime_hours:    l.overtime_hours,
    bonus_amount:      l.bonus_amount,
    acting_allowance:  l.acting_allowance,
    per_diem_amount:   l.per_diem_amount,
    benefits_in_kind:  l.benefits_in_kind,
    other_variable_pay: l.other_variable_pay,
    gross_pay: l.gross_pay,
    nssf_tier1: l.nssf_tier1,
    nssf_tier2: l.nssf_tier2,
    sha_amount: l.sha_amount,
    housing_levy_employee: l.housing_levy_employee,
    taxable_income: l.taxable_income,
    paye_before_relief: l.paye_before_relief,
    personal_relief: l.personal_relief,
    insurance_relief:  l.insurance_relief,
    paye_amount: l.paye_amount,
    helb_amount: l.helb_amount,
    // Non-statutory deductions (SOP 6.4)
    sacco_contribution:        l.sacco_contribution,
    sacco_loan_repayment:      l.sacco_loan_repayment,
    medical_premium:           l.medical_premium,
    supplementary_pension:     l.supplementary_pension,
    salary_advance_recovery:   l.salary_advance_recovery,
    court_deduction_amount:    l.court_deduction_amount,
    court_deduction_ref:       l.court_deduction_ref || null,
    other_deductions: l.other_deductions,
    total_deductions: l.total_deductions,
    net_pay: l.net_pay,
    nssf_employer: l.nssf_employer,
    housing_levy_employer: l.housing_levy_employer,
    days_worked: l._days_worked,
    leave_days: l._leave_days,
    ooo_days: l._ooo_days,
  }));

  const { error } = await supabase
    .from('payroll_lines')
    .upsert(rows, { onConflict: 'run_id,user_id' });
  if (error) throw error;
}

// ─── Approval workflow ────────────────────────────────────────────────────────

export type ApprovalAction = 'submit' | 'approve_hr' | 'reject_hr' | 'approve_finance' | 'reject_finance' | 'approve_ceo' | 'reject_ceo' | 'mark_paid';

export async function advancePayrollRunStatus(
  runId: string,
  action: ApprovalAction,
  comments?: string
): Promise<PayrollRun> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const now = new Date().toISOString();

  const statusMap: Record<ApprovalAction, string> = {
    submit:           'pending_hr',
    approve_hr:       'pending_finance',
    reject_hr:        'rejected',
    approve_finance:  'pending_ceo',
    reject_finance:   'rejected',
    approve_ceo:      'approved',
    reject_ceo:       'rejected',
    mark_paid:        'paid',
  };

  const updates: Record<string, unknown> = { status: statusMap[action] };

  if (action === 'approve_hr' || action === 'reject_hr') {
    updates.hr_reviewer_id = user.id;
    updates.hr_approved_at = now;
    updates.hr_comments = comments ?? null;
  } else if (action === 'approve_finance' || action === 'reject_finance') {
    updates.finance_reviewer_id = user.id;
    updates.finance_approved_at = now;
    updates.finance_comments = comments ?? null;
  } else if (action === 'approve_ceo' || action === 'reject_ceo') {
    updates.ceo_reviewer_id = user.id;
    updates.ceo_approved_at = now;
    updates.ceo_comments = comments ?? null;
  }

  const { data, error } = await supabase
    .from('payroll_runs')
    .update(updates)
    .eq('id', runId)
    .select()
    .single();
  if (error) throw error;
  return data as PayrollRun;
}

// ─── Employee payroll profile ─────────────────────────────────────────────────

export async function getEmployeePayrollProfiles(): Promise<EmployeePayrollProfile[]> {
  const { data, error } = await supabase
    .from('users_profile')
    .select(
      'id, employee_id, first_name, last_name, department_id, job_title, ' +
      'kra_pin, nssf_number, sha_number, helb_account, helb_monthly_amount, ' +
      'bank_name, bank_branch, bank_account_number, employment_type, ' +
      'basic_salary, allowances, salary_grade, payroll_active'
    )
    .eq('is_active', true)
    .order('employee_id', { ascending: true });
  if (error) throw error;
  return (data as unknown as EmployeePayrollProfile[]) || [];
}

export async function updateEmployeePayrollProfile(
  userId: string,
  updates: Partial<Omit<EmployeePayrollProfile, 'id' | 'employee_id' | 'first_name' | 'last_name' | 'department_id' | 'job_title'>>
): Promise<void> {
  const { error } = await supabase
    .from('users_profile')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
}

// ─── Salary grades ───────────────────────────────────────────────────────────

export async function getSalaryGrades(): Promise<SalaryGrade[]> {
  const { data, error } = await supabase
    .from('salary_grades')
    .select('*')
    .order('grade_code');
  if (error) throw error;
  return data || [];
}

export async function upsertSalaryGrade(
  grade: Omit<SalaryGrade, 'id'>
): Promise<SalaryGrade> {
  const { data, error } = await supabase
    .from('salary_grades')
    .upsert(grade, { onConflict: 'grade_code' })
    .select()
    .single();
  if (error) throw error;
  return data as SalaryGrade;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sum<T>(
  arr: T[],
  key: keyof T | ((item: T) => number)
): number {
  return arr.reduce((total, item) => {
    const val = typeof key === 'function' ? key(item) : Number(item[key]);
    return total + (isNaN(val) ? 0 : val);
  }, 0);
}

export function formatKES(amount: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString('en-KE', { month: 'long' });
}

// ─── Remittance tracking (SOP Step 6) ────────────────────────────────────────

export async function getRemittances(runId: string): Promise<PayrollRemittance[]> {
  const { data, error } = await supabase
    .from('payroll_remittances')
    .select('*')
    .eq('run_id', runId)
    .order('remittance_type');
  if (error) throw error;
  return (data as PayrollRemittance[]) || [];
}

export async function markRemittanceDone(
  remittanceId: string,
  referenceNumber: string,
  notes?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('payroll_remittances')
    .update({
      status: 'remitted',
      remitted_at: new Date().toISOString(),
      remitted_by: user?.id,
      reference_number: referenceNumber,
      notes: notes ?? null,
    })
    .eq('id', remittanceId);
  if (error) throw error;
}

export async function getPendingRemittances(): Promise<PayrollRemittance[]> {
  const { data, error } = await supabase
    .from('payroll_remittances')
    .select('*')
    .in('status', ['pending', 'late'])
    .order('due_date');
  if (error) throw error;
  // Mark overdue ones
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  return (data || []).map((r: any) => ({
    ...r,
    status: r.status === 'pending' && r.due_date < today ? 'late' : r.status,
  })) as PayrollRemittance[];
}

// ─── Salary change log (SOP Step 1) ──────────────────────────────────────────

export async function recordSalaryChange(
  change: Omit<SalaryChange, 'id' | 'created_at' | 'created_by'>
): Promise<SalaryChange> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('salary_changes')
    .insert({ ...change, created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as SalaryChange;
}

export async function getSalaryHistory(userId: string): Promise<SalaryChange[]> {
  const { data, error } = await supabase
    .from('salary_changes')
    .select('*')
    .eq('user_id', userId)
    .order('effective_date', { ascending: false });
  if (error) throw error;
  return (data as SalaryChange[]) || [];
}

// ─── Rejected → revise (SOP Step 4 / gap fix) ────────────────────────────────
// Creates a new draft run as a revision of the rejected one. Copies all lines.

export async function createRevision(
  rejectedRunId: string,
  revisionNotes: string
): Promise<PayrollRun> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const original = await getPayrollRunById(rejectedRunId);
  if (!original) throw new Error('Original run not found');
  if (original.status !== 'rejected') throw new Error('Can only revise a rejected run');

  // Create new draft as revision
  const { data: newRun, error: runErr } = await supabase
    .from('payroll_runs')
    .insert({
      pay_period_year:  original.pay_period_year,
      pay_period_month: original.pay_period_month,
      status:           'draft',
      prepared_by:      user.id,
      prepared_at:      new Date().toISOString(),
      revision_of:      rejectedRunId,
      revision_notes:   revisionNotes,
      revision_number:  (original.revision_number || 1) + 1,
      notes:            original.notes,
    })
    .select()
    .single();
  if (runErr) throw runErr;

  // Mark original as superseded
  await supabase
    .from('payroll_runs')
    .update({ status: 'superseded' })
    .eq('id', rejectedRunId);

  // Re-compute lines into the new run
  await computeAndSaveRun(newRun.id);

  return newRun as PayrollRun;
}

// ─── Bank file generation (SOP Step 5) ───────────────────────────────────────
// Generates a CSV suitable for Kenyan bank bulk payment upload.

export function generateBankFile(lines: PayrollLine[], runLabel: string): string {
  const headers = [
    'Employee ID', 'Employee Name', 'Bank Name', 'Branch', 'Account Number',
    'Net Pay (KES)', 'Currency', 'Narration'
  ];

  const rows = lines
    .filter(l => l.net_pay > 0)
    .map(l => {
      const name = l.profile
        ? `${l.profile.first_name} ${l.profile.last_name}`
        : l.employee_id || l.user_id;
      return [
        l.employee_id || '',
        name,
        l.profile?.bank_name || '',
        '',
        l.profile?.bank_account_number || '',
        l.net_pay.toFixed(2),
        'KES',
        `Salary ${runLabel}`,
      ];
    });

  const csvLines = [headers, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  );
  return csvLines.join('\r\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Payslip HTML generation (SOP 8.2) ───────────────────────────────────────
// Returns a complete HTML string that can be opened in a new tab and printed/saved.

export function generatePayslipHtml(line: PayrollLine, run: PayrollRun): string {
  const empName = line.profile
    ? `${line.profile.first_name} ${line.profile.last_name}`
    : line.employee_id || 'Employee';
  const period  = `${monthName(run.pay_period_month)} ${run.pay_period_year}`;
  const kes     = (n: number) => formatKES(n);

  const allowanceRows = Object.entries((line.allowances as Record<string, number>) || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `<tr><td>${k.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</td><td class="num">${kes(v)}</td></tr>`)
    .join('');

  const variableRows = [
    line.overtime_amount  > 0 ? `<tr><td>Overtime (${line.overtime_hours || 0} hrs)</td><td class="num">${kes(line.overtime_amount)}</td></tr>` : '',
    line.bonus_amount     > 0 ? `<tr><td>Performance Bonus</td><td class="num">${kes(line.bonus_amount)}</td></tr>` : '',
    line.acting_allowance > 0 ? `<tr><td>Acting Allowance</td><td class="num">${kes(line.acting_allowance)}</td></tr>` : '',
    line.per_diem_amount  > 0 ? `<tr><td>Per Diem</td><td class="num">${kes(line.per_diem_amount)}</td></tr>` : '',
    line.benefits_in_kind > 0 ? `<tr><td>Benefits in Kind</td><td class="num">${kes(line.benefits_in_kind)}</td></tr>` : '',
    ...(line.other_variable_pay || []).map((v: { name: string; amount: number }) =>
      `<tr><td>${v.name}</td><td class="num">${kes(v.amount)}</td></tr>`
    ),
  ].join('');

  const nonStatRows = [
    line.helb_amount               > 0 ? `<tr><td>HELB</td><td class="num">${kes(line.helb_amount)}</td></tr>` : '',
    line.sacco_contribution        > 0 ? `<tr><td>SACCO Contribution</td><td class="num">${kes(line.sacco_contribution)}</td></tr>` : '',
    line.sacco_loan_repayment      > 0 ? `<tr><td>SACCO Loan Repayment</td><td class="num">${kes(line.sacco_loan_repayment)}</td></tr>` : '',
    line.medical_premium           > 0 ? `<tr><td>Medical Insurance</td><td class="num">${kes(line.medical_premium)}</td></tr>` : '',
    line.insurance_relief          > 0 ? `<tr><td style="padding-left:16px;color:#10b981">  Insurance Relief</td><td class="num" style="color:#10b981">(${kes(line.insurance_relief)})</td></tr>` : '',
    line.supplementary_pension     > 0 ? `<tr><td>Supplementary Pension</td><td class="num">${kes(line.supplementary_pension)}</td></tr>` : '',
    line.salary_advance_recovery   > 0 ? `<tr><td>Salary Advance Recovery</td><td class="num">${kes(line.salary_advance_recovery)}</td></tr>` : '',
    line.court_deduction_amount    > 0 ? `<tr><td>Court Order${line.court_deduction_ref ? ` (${line.court_deduction_ref})` : ''}</td><td class="num">${kes(line.court_deduction_amount)}</td></tr>` : '',
    ...(line.other_deductions || []).map((d: { name: string; amount: number }) =>
      `<tr><td>${d.name}</td><td class="num">${kes(d.amount)}</td></tr>`
    ),
  ].join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Payslip — ${empName} — ${period}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; background: #fff; padding: 24px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #4f46e5; }
  .org { font-size: 18px; font-weight: 700; color: #4f46e5; }
  .org-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .payslip-title { text-align: right; }
  .payslip-title h2 { font-size: 14px; font-weight: 700; color: #1f2937; }
  .payslip-title p { font-size: 11px; color: #6b7280; }
  .employee-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 20px; padding: 12px; background: #f8fafc; border-radius: 6px; }
  .employee-grid .label { color: #6b7280; font-size: 11px; }
  .employee-grid .value { font-weight: 600; }
  .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  thead th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
  thead th.num { text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row td { font-weight: 700; border-top: 2px solid #e5e7eb; border-bottom: none; }
  .net-box { margin-top: 16px; padding: 14px; background: #4f46e5; color: #fff; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
  .net-box .label { font-size: 13px; font-weight: 600; }
  .net-box .amount { font-size: 22px; font-weight: 700; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  @media print { body { padding: 0; } }
</style>
</head><body>
<div class="header">
  <div>
    <div class="org">Football Kenya Federation</div>
    <div class="org-sub">FKF HQ, Kasarani, Nairobi</div>
  </div>
  <div class="payslip-title">
    <h2>PAYSLIP</h2>
    <p>${period}</p>
    <p style="margin-top:2px;font-size:10px;color:#9ca3af">Confidential</p>
  </div>
</div>

<div class="employee-grid">
  <div><div class="label">Employee Name</div><div class="value">${empName}</div></div>
  <div><div class="label">Employee ID</div><div class="value">${line.employee_id || '—'}</div></div>
  <div><div class="label">KRA PIN</div><div class="value">${line.profile?.kra_pin || '—'}</div></div>
  <div><div class="label">Bank Account</div><div class="value">${line.profile?.bank_name ? `${line.profile.bank_name} — ${line.profile.bank_account_number || ''}` : '—'}</div></div>
  <div><div class="label">Days Worked</div><div class="value">${line.days_worked ?? run.working_days_in_period ?? '—'} / ${run.working_days_in_period ?? '—'}</div></div>
  <div><div class="label">Pay Period</div><div class="value">${period}</div></div>
</div>

<div class="columns">
  <div>
    <table>
      <thead><tr><th>Earnings</th><th class="num">Amount (KES)</th></tr></thead>
      <tbody>
        <tr><td>Basic Salary</td><td class="num">${kes(line.basic_salary)}</td></tr>
        ${allowanceRows}
        ${variableRows}
        <tr class="total-row"><td>Gross Pay</td><td class="num">${kes(line.gross_pay)}</td></tr>
      </tbody>
    </table>
  </div>
  <div>
    <table>
      <thead><tr><th>Deductions</th><th class="num">Amount (KES)</th></tr></thead>
      <tbody>
        <tr><td>NSSF (Tier I)</td><td class="num">${kes(line.nssf_tier1)}</td></tr>
        ${line.nssf_tier2 > 0 ? `<tr><td>NSSF (Tier II)</td><td class="num">${kes(line.nssf_tier2)}</td></tr>` : ''}
        <tr><td>SHIF/SHA</td><td class="num">${kes(line.sha_amount)}</td></tr>
        <tr><td>Housing Levy</td><td class="num">${kes(line.housing_levy_employee)}</td></tr>
        <tr><td>PAYE${line.insurance_relief > 0 ? ` <span style="font-size:10px;color:#6b7280">(incl. ins. relief)</span>` : ''}</td><td class="num">${kes(line.paye_amount)}</td></tr>
        ${nonStatRows}
        <tr class="total-row"><td>Total Deductions</td><td class="num">${kes(line.total_deductions)}</td></tr>
      </tbody>
    </table>

    <table style="margin-top:12px;font-size:11px;">
      <thead><tr><th colspan="2">Employer Contributions (not deducted)</th></tr></thead>
      <tbody>
        <tr><td>NSSF Employer</td><td class="num">${kes(line.nssf_employer)}</td></tr>
        <tr><td>Housing Levy Employer</td><td class="num">${kes(line.housing_levy_employer)}</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="net-box">
  <span class="label">NET PAY — ${period}</span>
  <span class="amount">${kes(line.net_pay)}</span>
</div>

<div class="footer">
  This payslip is computer-generated and does not require a signature. &nbsp;|&nbsp;
  FKF/HR/POL/2026/004 &nbsp;|&nbsp; Records retained for 7 years per Employment Act 2007.
  <br>For queries contact: payroll@fkf.co.ke
</div>
</body></html>`;
}

export function openPayslip(line: PayrollLine, run: PayrollRun): void {
  const html = generatePayslipHtml(line, run);
  const w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

// ─── Per-line variable pay save (SOP Day 24: Payroll Officer input) ──────────
// Recomputes a single line with new variable pay and saves back to DB.

export async function saveVariablePayForLine(
  lineId: string,
  variablePay: Partial<VariablePayInput>
): Promise<void> {
  // Load the existing line
  const { data: lineData, error: lineErr } = await supabase
    .from('payroll_lines')
    .select('*')
    .eq('id', lineId)
    .single();
  if (lineErr) throw lineErr;
  const line = lineData as PayrollLine & { run_id: string };

  // Load the employee profile for fixed pay
  const { data: empData, error: empErr } = await supabase
    .from('users_profile')
    .select(
      'id, employee_id, basic_salary, allowances, helb_monthly_amount, ' +
      'sacco_contribution, sacco_loan_repayment, medical_premium, ' +
      'supplementary_pension, salary_advance_monthly_recovery'
    )
    .eq('id', line.user_id)
    .single();
  if (empErr) throw empErr;
  const emp = empData as unknown as Record<string, unknown>;

  // Load run for working days
  const run = await getPayrollRunById(line.run_id);
  if (!run) throw new Error('Run not found');

  const settings = await getPayrollSettings();
  const workingDays = run.working_days_in_period ?? 22;
  const unpaidDays = workingDays - (line.days_worked ?? workingDays);

  const computed = computePayrollLine(
    {
      id:                               emp.id as string,
      employee_id:                      emp.employee_id as string,
      basic_salary:                     (emp.basic_salary as number) || 0,
      allowances:                       (emp.allowances as Record<string, number>) || {},
      helb_monthly_amount:              (emp.helb_monthly_amount as number) || 0,
      sacco_contribution:               (emp.sacco_contribution as number) || 0,
      sacco_loan_repayment:             (emp.sacco_loan_repayment as number) || 0,
      medical_premium:                  (emp.medical_premium as number) || 0,
      supplementary_pension:            (emp.supplementary_pension as number) || 0,
      salary_advance_monthly_recovery:  (emp.salary_advance_monthly_recovery as number) || 0,
    },
    settings,
    (line.other_deductions as Array<{ name: string; amount: number }>) || [],
    unpaidDays,
    workingDays,
    variablePay
  );

  const { error: updateErr } = await supabase
    .from('payroll_lines')
    .update({
      overtime_amount:        computed.overtime_amount,
      overtime_hours:         computed.overtime_hours,
      bonus_amount:           computed.bonus_amount,
      acting_allowance:       computed.acting_allowance,
      per_diem_amount:        computed.per_diem_amount,
      benefits_in_kind:       computed.benefits_in_kind,
      other_variable_pay:     computed.other_variable_pay,
      court_deduction_amount: computed.court_deduction_amount,
      court_deduction_ref:    computed.court_deduction_ref || null,
      gross_pay:              computed.gross_pay,
      nssf_tier1:             computed.nssf_tier1,
      nssf_tier2:             computed.nssf_tier2,
      sha_amount:             computed.sha_amount,
      housing_levy_employee:  computed.housing_levy_employee,
      taxable_income:         computed.taxable_income,
      paye_before_relief:     computed.paye_before_relief,
      personal_relief:        computed.personal_relief,
      insurance_relief:       computed.insurance_relief,
      paye_amount:            computed.paye_amount,
      helb_amount:            computed.helb_amount,
      sacco_contribution:     computed.sacco_contribution,
      sacco_loan_repayment:   computed.sacco_loan_repayment,
      medical_premium:        computed.medical_premium,
      supplementary_pension:  computed.supplementary_pension,
      salary_advance_recovery: computed.salary_advance_recovery,
      total_deductions:       computed.total_deductions,
      net_pay:                computed.net_pay,
      nssf_employer:          computed.nssf_employer,
      housing_levy_employer:  computed.housing_levy_employer,
    })
    .eq('id', lineId);
  if (updateErr) throw updateErr;

  // Update run-level totals
  const { data: allLines, error: linesErr } = await supabase
    .from('payroll_lines')
    .select('gross_pay, paye_amount, nssf_tier1, nssf_tier2, sha_amount, housing_levy_employee, helb_amount, net_pay, nssf_employer, housing_levy_employer')
    .eq('run_id', line.run_id);
  if (linesErr) throw linesErr;

  const totals = (allLines || []).reduce(
    (acc, l) => ({
      total_gross:                   acc.total_gross                  + (l.gross_pay              || 0),
      total_paye:                    acc.total_paye                   + (l.paye_amount             || 0),
      total_nssf_employee:           acc.total_nssf_employee          + (l.nssf_tier1 || 0) + (l.nssf_tier2 || 0),
      total_sha:                     acc.total_sha                    + (l.sha_amount              || 0),
      total_housing_levy_employee:   acc.total_housing_levy_employee  + (l.housing_levy_employee   || 0),
      total_helb:                    acc.total_helb                   + (l.helb_amount             || 0),
      total_net:                     acc.total_net                    + (l.net_pay                 || 0),
      total_nssf_employer:           acc.total_nssf_employer          + (l.nssf_employer           || 0),
      total_housing_levy_employer:   acc.total_housing_levy_employer  + (l.housing_levy_employer   || 0),
    }),
    {
      total_gross: 0, total_paye: 0, total_nssf_employee: 0, total_sha: 0,
      total_housing_levy_employee: 0, total_helb: 0, total_net: 0,
      total_nssf_employer: 0, total_housing_levy_employer: 0,
    }
  );

  await supabase.from('payroll_runs').update(totals).eq('id', line.run_id);
}

// ─── Ghost worker check ───────────────────────────────────────────────────────

export async function getGhostWorkerCheck(): Promise<Array<{
  id: string; employee_id: string; full_name: string;
  hr_active: boolean; payroll_active: boolean;
  basic_salary: number; payroll_status: string;
}>> {
  const { data, error } = await supabase
    .from('v_ghost_worker_check')
    .select('*');
  if (error) throw error;
  return data || [];
}

// ─── Month-on-month variance ──────────────────────────────────────────────────

export async function getPayrollVariance(year: number, month: number): Promise<{
  current: PayrollRun | null;
  previous: PayrollRun | null;
  gross_variance: number;
  net_variance: number;
  paye_variance: number;
  headcount_change: number;
} | null> {
  const runs = await getPayrollRuns();
  const current = runs.find(r =>
    r.pay_period_year === year && r.pay_period_month === month &&
    ['approved','paid'].includes(r.status)
  ) ?? null;

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const previous  = runs.find(r =>
    r.pay_period_year === prevYear && r.pay_period_month === prevMonth &&
    ['approved','paid'].includes(r.status)
  ) ?? null;

  if (!current) return null;

  const [currentCountResult, prevCountResult] = await Promise.all([
    supabase.from('payroll_lines').select('*', { count: 'exact', head: true }).eq('run_id', current.id),
    previous
      ? supabase.from('payroll_lines').select('*', { count: 'exact', head: true }).eq('run_id', previous.id)
      : Promise.resolve({ count: 0 as number | null }),
  ]);

  return {
    current,
    previous,
    gross_variance: (current.total_gross ?? 0) - (previous?.total_gross ?? 0),
    net_variance:   (current.total_net   ?? 0) - (previous?.total_net   ?? 0),
    paye_variance:  (current.total_paye  ?? 0) - (previous?.total_paye  ?? 0),
    headcount_change: (currentCountResult.count ?? 0) - (prevCountResult.count ?? 0),
  };
}
