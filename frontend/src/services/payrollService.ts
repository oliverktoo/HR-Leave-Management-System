// Payroll Service — Kenya-law-compliant computation engine + CRUD for runs/lines

import { supabase } from '../lib/supabaseClient';
import { computeArrearsTax, monthsBetween, spreadArrears, type ArrearsEntry, type ArrearsResult, type Month, type TaxBasis } from './arrears';
import { splitGratuity, terminalTax, type TerminalTax } from './finalDues';

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
  /** Statutory thresholds (migration 077); missing keys fall back to TAX_LIMIT_DEFAULTS. */
  limits?: Partial<Record<string, number>>;
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
  is_active?: boolean;   // staff account active (login); separate from payroll_active
  // Tax circumstances (migration 077)
  tax_residency?: 'resident' | 'non_resident' | null;
  tax_employment_category?: 'primary' | 'secondary' | null;
  disability_exemption_cert_no?: string | null;
  disability_exemption_expiry?: string | null;
  mortgage_interest_monthly?: number | null;
  post_retirement_medical_monthly?: number | null;
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
  per_diem_days: number;       // days away on official duty (tax-free per diem = days × daily limit)
  arrears_amount: number;      // back pay for earlier months, paid this month
  arrears_paye: number;        // extra PAYE on the arrears, worked out by spreading back (arrears.ts)
  // Final dues on leaving (finalDues.ts, migration 079)
  leave_pay: number;           // untaken leave — ordinary pay this month
  notice_pay: number;          // pay in lieu of notice — ordinary pay this month
  severance_pay: number;       // lump sum — taxed by terminal_paye
  gratuity_amount: number;     // cash gratuity — taxable part (pre-Jul 2025) taxed by terminal_paye
  gratuity_exempt: number;     // part of gratuity_amount earned from Jul 2025 (tax-free)
  compensation_amount: number; // compensation for loss of office — taxed by terminal_paye
  terminal_paye: number;       // PAYE on severance + gratuity + compensation
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
  per_diem_days: number;
  per_diem_exempt: number;        // tax-free part (days × daily limit)
  arrears_amount: number;         // back pay included in gross pay
  arrears_paye: number;           // PAYE on the arrears (included in paye_amount)
  arrears_sha: number;            // SHIF on the arrears (included in sha_amount)
  arrears_housing_levy: number;   // Housing Levy on the arrears (included in housing_levy_employee)
  leave_pay: number;
  notice_pay: number;
  severance_pay: number;
  gratuity_amount: number;
  gratuity_exempt: number;
  compensation_amount: number;
  terminal_paye: number;          // included in paye_amount
  other_variable_pay: Array<{ name: string; amount: number }>;
  benefits_in_kind: number;       // non-cash BIK (not cash gross)
  bik_taxable: number;            // BIK added to taxable income (0 when within the annual exemption)
  gross_pay: number;
  nssf_tier1: number;
  nssf_tier2: number;
  sha_amount: number;
  housing_levy_employee: number;
  pension_deduction: number;
  mortgage_interest_deduction: number;
  prmf_deduction: number;
  disability_exemption: number;
  tax_basis: 'resident' | 'non_resident' | 'secondary';
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
  // Payslip release (migration 076): staff can see payslips only once set
  payslips_distributed_at: string | null;
  payslips_released_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A payslip period visible to the signed-in employee (no company totals). */
export type MyPayslipRun = Pick<PayrollRun,
  'id' | 'pay_period_year' | 'pay_period_month' | 'status' | 'working_days_in_period' | 'payslips_distributed_at'>;

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
  // Special-case tax detail (migration 077); absent on lines computed before it
  per_diem_days?: number;
  per_diem_exempt?: number;
  arrears_amount?: number;
  arrears_paye?: number;
  arrears_sha?: number;
  arrears_housing_levy?: number;
  leave_pay?: number;
  notice_pay?: number;
  severance_pay?: number;
  gratuity_amount?: number;
  gratuity_exempt?: number;
  compensation_amount?: number;
  terminal_paye?: number;
  bik_taxable?: number;
  pension_deduction?: number;
  mortgage_interest_deduction?: number;
  prmf_deduction?: number;
  disability_exemption?: number;
  tax_basis?: 'resident' | 'non_resident' | 'secondary' | null;
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
    limits: Object.fromEntries(
      Object.keys(TAX_LIMIT_DEFAULTS)
        .filter(k => map[k] !== undefined && map[k] !== null)
        .map(k => [k, Number(map[k])])
    ),
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

// ─── Statutory limits (Kenya) ────────────────────────────────────────────────
// Every legal threshold is a payroll setting (payroll_settings, migration 077),
// so payroll can follow a change in the law without a code change. These are
// the defaults used when a setting is missing.
export const TAX_LIMIT_DEFAULTS = {
  /** ITA s.5(2)(a): tax-free per diem per day away from usual place of work (Finance Act 2025). */
  per_diem_daily_exempt: 10_000,
  /** Non-cash benefits tax-free when their aggregate value is ≤ this per year (Tax Laws (Amendment) Act 2024). */
  bik_annual_exempt: 60_000,
  /** Registered pension contributions (incl. NSSF) deductible per month (TLAA 2024). */
  pension_deduction_cap_monthly: 30_000,
  /** Owner-occupier mortgage interest deductible per month (KES 360,000/yr, TLAA 2024). */
  mortgage_interest_cap_monthly: 30_000,
  /** Post-retirement medical fund contributions deductible per month (TLAA 2024, KRA notice 2157). */
  prmf_cap_monthly: 15_000,
  /** Persons with disability: income exempt per month with a valid KRA exemption certificate. */
  disability_exemption_monthly: 150_000,
  /** Secondary employment: PAYE at the highest rate on the whole taxable pay, no reliefs. */
  secondary_employment_rate: 0.35,
  /** Insurance relief: share of qualifying premiums, and monthly cap. */
  insurance_relief_rate: 0.15,
  insurance_relief_cap_monthly: 5_000,
} as const;
export type TaxLimits = { -readonly [K in keyof typeof TAX_LIMIT_DEFAULTS]: number };

export function taxLimits(settings: PayrollSettings): TaxLimits {
  const out = { ...TAX_LIMIT_DEFAULTS } as TaxLimits;
  for (const k of Object.keys(out) as Array<keyof TaxLimits>) {
    const v = settings.limits?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/** @deprecated use taxLimits(settings).pension_deduction_cap_monthly */
export const PENSION_DEDUCTION_CAP_MONTHLY = TAX_LIMIT_DEFAULTS.pension_deduction_cap_monthly;

export type TaxResidency = 'resident' | 'non_resident';
export type TaxEmploymentCategory = 'primary' | 'secondary';

/** Per-employee tax circumstances (users_profile, migration 077). All optional: defaults = resident, primary. */
export interface EmployeeTaxProfile {
  tax_residency?: TaxResidency | null;
  tax_employment_category?: TaxEmploymentCategory | null;
  disability_exemption_cert_no?: string | null;
  disability_exemption_expiry?: string | null;   // YYYY-MM-DD
  mortgage_interest_monthly?: number | null;
  post_retirement_medical_monthly?: number | null;
}

export interface ComputeOptions {
  /** Last day of the pay period (YYYY-MM-DD) — used to check the disability certificate is still valid. */
  periodEnd?: string;
}

/** True when the employee holds a disability exemption certificate valid for the period. */
export function hasValidDisabilityExemption(p: EmployeeTaxProfile, periodEnd?: string): boolean {
  if (!p.disability_exemption_cert_no?.trim()) return false;
  if (!p.disability_exemption_expiry) return false;
  const end = periodEnd ?? new Date().toISOString().slice(0, 10);
  return p.disability_exemption_expiry >= end;
}

export function computePayrollLine(
  profile: Pick<
    EmployeePayrollProfile,
    'id' | 'employee_id' | 'basic_salary' | 'allowances' | 'helb_monthly_amount' |
    'sacco_contribution' | 'sacco_loan_repayment' | 'medical_premium' |
    'supplementary_pension' | 'salary_advance_monthly_recovery'
  > & EmployeeTaxProfile,
  settings: PayrollSettings,
  otherDeductions: Array<{ name: string; amount: number }> = [],
  unpaidDays = 0,
  workingDaysInMonth = 22,
  variablePay: Partial<VariablePayInput> = {},
  options: ComputeOptions = {}
): ComputedPayrollLine {
  const L = taxLimits(settings);
  const residency: TaxResidency = profile.tax_residency === 'non_resident' ? 'non_resident' : 'resident';
  const secondary = profile.tax_employment_category === 'secondary';

  const allowancesTotal = Object.values(profile.allowances || {}).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );

  // Variable pay components (SOP 6.2)
  const overtimeAmount    = variablePay.overtime_amount    || 0;
  const bonusAmount       = variablePay.bonus_amount       || 0;
  const actingAllowance   = variablePay.acting_allowance   || 0;
  const perDiemAmount     = variablePay.per_diem_amount    || 0;
  const perDiemDays       = Math.max(0, variablePay.per_diem_days || 0);
  const bik               = variablePay.benefits_in_kind   || 0;
  const otherVariablePay  = variablePay.other_variable_pay || [];
  const otherVariableTotal = otherVariablePay.reduce((s, v) => s + v.amount, 0);
  // Back pay for earlier months: paid in cash now; its PAYE is worked out by
  // spreading back (arrears.ts) and passed in as arrears_paye.
  const arrearsAmount     = Math.max(0, variablePay.arrears_amount || 0);
  const arrearsPaye       = arrearsAmount > 0 ? Math.max(0, variablePay.arrears_paye || 0) : 0;
  // Final dues: leave and notice pay are ordinary pay this month; severance, gratuity and
  // compensation are lump sums taxed separately (finalDues.ts) via terminal_paye.
  const leavePay          = Math.max(0, variablePay.leave_pay || 0);
  const noticePay         = Math.max(0, variablePay.notice_pay || 0);
  const severancePay      = Math.max(0, variablePay.severance_pay || 0);
  const gratuityAmount    = Math.max(0, variablePay.gratuity_amount || 0);
  const gratuityExempt    = Math.min(gratuityAmount, Math.max(0, variablePay.gratuity_exempt || 0));
  const compensationAmount = Math.max(0, variablePay.compensation_amount || 0);
  const terminalLumps     = severancePay + gratuityAmount + compensationAmount;
  const terminalPaye      = terminalLumps > 0 ? Math.max(0, variablePay.terminal_paye || 0) : 0;

  const fixedGross = profile.basic_salary + allowancesTotal;

  // Prorate fixed pay for unpaid absence days
  const prorationFactor = workingDaysInMonth > 0 && unpaidDays > 0
    ? Math.max(0, (workingDaysInMonth - unpaidDays) / workingDaysInMonth)
    : 1;

  // Variable pay is NOT prorated (paid for what was earned)
  // gross_pay = cash paid (BIK excluded — not a bank transfer)
  const currentGross = Math.round(fixedGross * prorationFactor)
    + overtimeAmount + bonusAmount + actingAllowance + perDiemAmount + otherVariableTotal
    + leavePay + noticePay;
  const grossPay = currentGross + arrearsAmount + terminalLumps;

  // Per diem (ITA s.5(2)(a)): up to the daily limit × days away on official duty is a
  // reimbursement, not income — excluded from tax and from the NSSF/SHIF/Housing Levy
  // base. Any excess, or per diem with no travel days recorded, is taxable pay.
  const perDiemExempt = Math.min(perDiemAmount, Math.round(perDiemDays * L.per_diem_daily_exempt));
  // This month's earnings only — arrears are handled separately below
  const statutoryBase = currentGross - perDiemExempt;

  // Benefits in kind: tax-free when the aggregate value is within the annual limit
  // (applied monthly: ≤ limit/12); above it the whole value is taxable.
  const bikTaxable = bik > L.bik_annual_exempt / 12 ? bik : 0;

  // NSSF, SHA/SHIF and Housing Levy on cash earnings (BIK and per-diem reimbursement excluded)
  const nssf = computeNSSF(statutoryBase, settings);
  const shaCurrent = computeSHA(statutoryBase, settings);
  const housingCurrent = computeHousingLevy(statutoryBase, settings);
  // SHIF and Housing Levy are also charged on arrears paid now (NSSF is not recomputed
  // for past months). Their tax effect is in the spread-back calculation.
  const shaArrears = Math.round(arrearsAmount * settings.sha_rate);
  const housingArrears = computeHousingLevy(arrearsAmount, settings);
  const sha = shaCurrent + shaArrears;
  const housing = {
    employee: housingCurrent.employee + housingArrears.employee,
    employer: housingCurrent.employer + housingArrears.employer,
  };

  // Allowable deductions (Tax Laws (Amendment) Act 2024, effective 27 Dec 2024 — KRA
  // notice 2157). Secondary employment gets none: they are claimed at the main employer.
  const pensionDeduction = secondary ? 0 : Math.min(
    nssf.employee + (profile.supplementary_pension || 0), L.pension_deduction_cap_monthly);
  const mortgageDeduction = secondary || residency === 'non_resident' ? 0
    : Math.min(Math.max(0, profile.mortgage_interest_monthly || 0), L.mortgage_interest_cap_monthly);
  const prmfDeduction = secondary ? 0
    : Math.min(Math.max(0, profile.post_retirement_medical_monthly || 0), L.prmf_cap_monthly);
  const shaDeduction = secondary ? 0 : shaCurrent;
  const housingDeduction = secondary ? 0 : housingCurrent.employee;

  const incomeAfterDeductions = Math.max(0,
    statutoryBase + bikTaxable - pensionDeduction - shaDeduction - housingDeduction - mortgageDeduction - prmfDeduction);

  // Persons with disability: first KES 150,000/month exempt with a valid certificate
  const disabilityExemption = hasValidDisabilityExemption(profile, options.periodEnd)
    ? Math.min(incomeAfterDeductions, L.disability_exemption_monthly) : 0;
  const taxableIncome = incomeAfterDeductions - disabilityExemption;

  // PAYE
  let payeBeforeRelief: number;
  let personalRelief: number;
  let insuranceRelief: number;
  if (secondary) {
    // Highest marginal rate on the whole taxable pay; reliefs are given by the main employer
    payeBeforeRelief = Math.round(taxableIncome * L.secondary_employment_rate);
    personalRelief = 0;
    insuranceRelief = 0;
  } else {
    payeBeforeRelief = computePAYE(taxableIncome, settings.paye_bands, 0).payeBeforeRelief;
    // Reliefs are for residents only (KRA: non-residents get no personal relief)
    personalRelief = residency === 'resident' ? settings.paye_personal_relief : 0;
    insuranceRelief = residency === 'resident'
      ? Math.min(Math.round((profile.medical_premium || 0) * L.insurance_relief_rate), L.insurance_relief_cap_monthly)
      : 0;
  }
  const paye = Math.max(0, payeBeforeRelief - personalRelief - insuranceRelief) + arrearsPaye + terminalPaye;

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
    per_diem_days:      perDiemDays,
    per_diem_exempt:    perDiemExempt,
    arrears_amount:     arrearsAmount,
    arrears_paye:       arrearsPaye,
    arrears_sha:        shaArrears,
    arrears_housing_levy: housingArrears.employee,
    leave_pay:          leavePay,
    notice_pay:         noticePay,
    severance_pay:      severancePay,
    gratuity_amount:    gratuityAmount,
    gratuity_exempt:    gratuityExempt,
    compensation_amount: compensationAmount,
    terminal_paye:      terminalPaye,
    benefits_in_kind:   bik,
    bik_taxable:        bikTaxable,
    other_variable_pay: otherVariablePay,
    gross_pay: grossPay,
    nssf_tier1: nssf.tier1,
    nssf_tier2: nssf.tier2,
    sha_amount: sha,
    housing_levy_employee: housing.employee,
    pension_deduction:           pensionDeduction,
    mortgage_interest_deduction: mortgageDeduction,
    prmf_deduction:              prmfDeduction,
    disability_exemption:        disabilityExemption,
    tax_basis: secondary ? 'secondary' : residency,
    taxable_income: taxableIncome,
    paye_before_relief: payeBeforeRelief,
    personal_relief: personalRelief,
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

/** users_profile columns needed to compute a payroll line. */
export const PAYROLL_PROFILE_COLUMNS =
  'id, employee_id, basic_salary, allowances, helb_monthly_amount, ' +
  'sacco_contribution, sacco_loan_repayment, medical_premium, supplementary_pension, salary_advance_monthly_recovery, ' +
  'tax_residency, tax_employment_category, disability_exemption_cert_no, disability_exemption_expiry, ' +
  'mortgage_interest_monthly, post_retirement_medical_monthly';

/** Map a users_profile row (PAYROLL_PROFILE_COLUMNS) to computePayrollLine's profile input. */
export function toPayrollProfile(emp: Record<string, unknown>): Parameters<typeof computePayrollLine>[0] {
  const num = (k: string) => Number(emp[k]) || 0;
  return {
    id:                              emp.id as string,
    employee_id:                     emp.employee_id as string,
    basic_salary:                    num('basic_salary'),
    allowances:                      (emp.allowances as Record<string, number>) || {},
    helb_monthly_amount:             num('helb_monthly_amount'),
    sacco_contribution:              num('sacco_contribution'),
    sacco_loan_repayment:            num('sacco_loan_repayment'),
    medical_premium:                 num('medical_premium'),
    supplementary_pension:           num('supplementary_pension'),
    salary_advance_monthly_recovery: num('salary_advance_monthly_recovery'),
    tax_residency:                   (emp.tax_residency as TaxResidency) ?? 'resident',
    tax_employment_category:         (emp.tax_employment_category as TaxEmploymentCategory) ?? 'primary',
    disability_exemption_cert_no:    (emp.disability_exemption_cert_no as string) ?? null,
    disability_exemption_expiry:     (emp.disability_exemption_expiry as string) ?? null,
    mortgage_interest_monthly:       num('mortgage_interest_monthly'),
    post_retirement_medical_monthly: num('post_retirement_medical_monthly'),
  };
}

/** Final-dues amounts stored on a payroll line, as variable-pay input. */
export function finalDuesFields(row: Record<string, unknown>): Partial<VariablePayInput> {
  const n = (k: string) => Number(row[k]) || 0;
  return {
    leave_pay: n('leave_pay'), notice_pay: n('notice_pay'), severance_pay: n('severance_pay'),
    gratuity_amount: n('gratuity_amount'), gratuity_exempt: n('gratuity_exempt'),
    compensation_amount: n('compensation_amount'), terminal_paye: n('terminal_paye'),
  };
}

/** Last day of a pay period as YYYY-MM-DD. */
export function periodEndDate(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 0));
  return d.toISOString().slice(0, 10);
}

/** payroll_lines columns written for a computed line (shared by run compute and per-line save). */
export function lineToDbFields(c: ComputedPayrollLine) {
  return {
    overtime_amount:        c.overtime_amount,
    overtime_hours:         c.overtime_hours,
    bonus_amount:           c.bonus_amount,
    acting_allowance:       c.acting_allowance,
    per_diem_amount:        c.per_diem_amount,
    per_diem_days:          c.per_diem_days,
    per_diem_exempt:        c.per_diem_exempt,
    arrears_amount:         c.arrears_amount,
    arrears_paye:           c.arrears_paye,
    arrears_sha:            c.arrears_sha,
    arrears_housing_levy:   c.arrears_housing_levy,
    leave_pay:              c.leave_pay,
    notice_pay:             c.notice_pay,
    severance_pay:          c.severance_pay,
    gratuity_amount:        c.gratuity_amount,
    gratuity_exempt:        c.gratuity_exempt,
    compensation_amount:    c.compensation_amount,
    terminal_paye:          c.terminal_paye,
    benefits_in_kind:       c.benefits_in_kind,
    bik_taxable:            c.bik_taxable,
    other_variable_pay:     c.other_variable_pay,
    court_deduction_amount: c.court_deduction_amount,
    court_deduction_ref:    c.court_deduction_ref || null,
    gross_pay:              c.gross_pay,
    nssf_tier1:             c.nssf_tier1,
    nssf_tier2:             c.nssf_tier2,
    sha_amount:             c.sha_amount,
    housing_levy_employee:  c.housing_levy_employee,
    pension_deduction:           c.pension_deduction,
    mortgage_interest_deduction: c.mortgage_interest_deduction,
    prmf_deduction:              c.prmf_deduction,
    disability_exemption:        c.disability_exemption,
    tax_basis:                   c.tax_basis,
    taxable_income:         c.taxable_income,
    paye_before_relief:     c.paye_before_relief,
    personal_relief:        c.personal_relief,
    insurance_relief:       c.insurance_relief,
    paye_amount:            c.paye_amount,
    helb_amount:            c.helb_amount,
    sacco_contribution:     c.sacco_contribution,
    sacco_loan_repayment:   c.sacco_loan_repayment,
    medical_premium:        c.medical_premium,
    supplementary_pension:  c.supplementary_pension,
    salary_advance_recovery: c.salary_advance_recovery,
    other_deductions:       c.other_deductions,
    total_deductions:       c.total_deductions,
    net_pay:                c.net_pay,
    nssf_employer:          c.nssf_employer,
    housing_levy_employer:  c.housing_levy_employer,
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
      .select(PAYROLL_PROFILE_COLUMNS)
      .eq('payroll_active', true)
      .eq('is_active', true),
    supabase.rpc('count_working_days_in_month', { p_year: year, p_month: month }),
    supabase.rpc('get_payroll_absence_days', { p_year: year, p_month: month }),
    supabase
      .from('payroll_lines')
      .select('user_id, overtime_amount, overtime_hours, bonus_amount, acting_allowance, per_diem_amount, per_diem_days, arrears_amount, arrears_paye, ' +
        'leave_pay, notice_pay, severance_pay, gratuity_amount, gratuity_exempt, compensation_amount, terminal_paye, ' +
        'benefits_in_kind, other_variable_pay, court_deduction_amount, court_deduction_ref')
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
  for (const row of ((existingLinesResult.data || []) as unknown as Array<Record<string, any>>)) {
    existingVarPayMap[row.user_id] = {
      overtime_amount:        row.overtime_amount        || 0,
      overtime_hours:         row.overtime_hours         || 0,
      bonus_amount:           row.bonus_amount           || 0,
      acting_allowance:       row.acting_allowance       || 0,
      per_diem_amount:        row.per_diem_amount        || 0,
      per_diem_days:          row.per_diem_days          || 0,
      arrears_amount:         row.arrears_amount         || 0,
      arrears_paye:           row.arrears_paye           || 0,
      ...finalDuesFields(row),
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
      toPayrollProfile(emp),
      settings,
      [],
      unpaidDays,
      workingDaysInMonth,
      varPay,
      { periodEnd: periodEndDate(year, month) }
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
    ...lineToDbFields(l),
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

export async function getEmployeePayrollProfiles(includeInactive = false): Promise<EmployeePayrollProfile[]> {
  let query = supabase
    .from('users_profile')
    .select(
      'id, employee_id, first_name, last_name, department_id, job_title, is_active, ' +
      'kra_pin, nssf_number, sha_number, helb_account, helb_monthly_amount, ' +
      'bank_name, bank_branch, bank_account_number, employment_type, ' +
      'basic_salary, allowances, salary_grade, payroll_active, ' +
      'tax_residency, tax_employment_category, disability_exemption_cert_no, disability_exemption_expiry, ' +
      'mortgage_interest_monthly, post_retirement_medical_monthly'
    )
    .order('employee_id', { ascending: true });
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as EmployeePayrollProfile[]) || [];
}

// ─── Payslip release (migration 076) ─────────────────────────────────────────

/** HR admin / super admin: release (true) or withdraw (false) a run's payslips. */
export async function setPayslipsReleased(runId: string, release: boolean): Promise<PayrollRun> {
  const { data, error } = await supabase.rpc('set_payslips_released', { p_run_id: runId, p_release: release });
  if (error) throw error;
  return data as PayrollRun;
}

/** The signed-in employee's released payslip periods, newest first. */
export async function getMyPayslipRuns(): Promise<MyPayslipRun[]> {
  const { data, error } = await supabase.rpc('my_payslip_runs');
  if (error) throw error;
  return (data as MyPayslipRun[]) || [];
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

/** "Tax computation" section of the payslip — only for lines computed with migration 077's rules. */
function taxComputationHtml(line: PayrollLine, kes: (n: number) => string): string {
  if (!line.tax_basis) return '';
  const secondary = line.tax_basis === 'secondary';
  const row = (label: string, amount: number, sign = '', strong = false) =>
    `<tr${strong ? ' class="total-row"' : ''}><td>${label}</td><td class="num">${sign}${kes(amount)}</td></tr>`;
  const n = (v: number | undefined | null) => Number(v) || 0;
  const rows = [
    row('Gross pay', line.gross_pay),
    n(line.arrears_amount) > 0 ? row('Less: salary arrears (taxed separately, below)', n(line.arrears_amount), '− ') : '',
    n(line.severance_pay) + n(line.gratuity_amount) + n(line.compensation_amount) > 0
      ? row('Less: severance, gratuity, compensation (taxed separately, below)',
            n(line.severance_pay) + n(line.gratuity_amount) + n(line.compensation_amount), '− ') : '',
    n(line.per_diem_exempt) > 0 ? row('Less: tax-free per diem', n(line.per_diem_exempt), '− ') : '',
    n(line.bik_taxable) > 0 ? row('Add: taxable benefits in kind', n(line.bik_taxable), '+ ') : '',
    n(line.benefits_in_kind) > 0 && n(line.bik_taxable) === 0
      ? `<tr><td colspan="2" style="color:#6b7280">Benefits in kind ${kes(n(line.benefits_in_kind))} — within the tax-free limit</td></tr>` : '',
    !secondary && n(line.pension_deduction) > 0 ? row('Less: pension (NSSF + registered scheme)', n(line.pension_deduction), '− ') : '',
    !secondary ? row('Less: SHIF', line.sha_amount - n(line.arrears_sha), '− ') : '',
    !secondary ? row('Less: Housing Levy', line.housing_levy_employee - n(line.arrears_housing_levy), '− ') : '',
    n(line.mortgage_interest_deduction) > 0 ? row('Less: mortgage interest', n(line.mortgage_interest_deduction), '− ') : '',
    n(line.prmf_deduction) > 0 ? row('Less: post-retirement medical fund', n(line.prmf_deduction), '− ') : '',
    n(line.disability_exemption) > 0 ? row('Less: disability exemption', n(line.disability_exemption), '− ') : '',
    row('Taxable income', line.taxable_income, '', true),
    row(secondary ? 'PAYE at secondary-employment rate' : 'Tax on taxable income', line.paye_before_relief),
    n(line.personal_relief) > 0 ? row('Less: personal relief', n(line.personal_relief), '− ') : '',
    n(line.insurance_relief) > 0 ? row('Less: insurance relief', n(line.insurance_relief), '− ') : '',
    n(line.arrears_paye) > 0 ? row('Add: PAYE on salary arrears (spread back to the months earned)', n(line.arrears_paye), '+ ') : '',
    n(line.terminal_paye) > 0 ? row('Add: PAYE on severance, gratuity and compensation', n(line.terminal_paye), '+ ') : '',
    row('PAYE', line.paye_amount, '', true),
  ].join('');
  const basis = secondary ? 'Secondary employment — reliefs claimed at main employer'
    : line.tax_basis === 'non_resident' ? 'Non-resident — no personal or insurance relief' : 'Resident';
  return `<table style="margin-top:16px;font-size:11px;">
    <thead><tr><th>Tax computation <span style="font-weight:400;text-transform:none;color:#6b7280">· ${basis}</span></th><th class="num">KES</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export type PayslipPeriod = Pick<PayrollRun, 'pay_period_month' | 'pay_period_year' | 'working_days_in_period'>;

export function generatePayslipHtml(line: PayrollLine, run: PayslipPeriod): string {
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
    line.per_diem_amount  > 0 ? `<tr><td>Per Diem${(line.per_diem_exempt || 0) > 0
      ? ` <span style="font-size:10px;color:#6b7280">(${kes(line.per_diem_exempt || 0)} tax-free · ${line.per_diem_days || 0} day${line.per_diem_days === 1 ? '' : 's'})</span>` : ''}</td><td class="num">${kes(line.per_diem_amount)}</td></tr>` : '',
    (line.arrears_amount || 0) > 0 ? `<tr><td>Salary arrears <span style="font-size:10px;color:#6b7280">(back pay for earlier months)</span></td><td class="num">${kes(line.arrears_amount || 0)}</td></tr>` : '',
    (line.leave_pay || 0) > 0 ? `<tr><td>Leave pay (untaken leave)</td><td class="num">${kes(line.leave_pay || 0)}</td></tr>` : '',
    (line.notice_pay || 0) > 0 ? `<tr><td>Pay in lieu of notice</td><td class="num">${kes(line.notice_pay || 0)}</td></tr>` : '',
    (line.severance_pay || 0) > 0 ? `<tr><td>Severance pay</td><td class="num">${kes(line.severance_pay || 0)}</td></tr>` : '',
    (line.gratuity_amount || 0) > 0 ? `<tr><td>Gratuity${(line.gratuity_exempt || 0) > 0 ? ` <span style="font-size:10px;color:#6b7280">(${kes(line.gratuity_exempt || 0)} tax-free)</span>` : ''}</td><td class="num">${kes(line.gratuity_amount || 0)}</td></tr>` : '',
    (line.compensation_amount || 0) > 0 ? `<tr><td>Compensation for loss of office</td><td class="num">${kes(line.compensation_amount || 0)}</td></tr>` : '',
    // Benefits in kind are not cash pay — shown under Tax computation, not Earnings
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

${taxComputationHtml(line, kes)}

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

export function openPayslip(line: PayrollLine, run: PayslipPeriod): void {
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

  // Load the employee profile (fixed pay + tax circumstances)
  const { data: empData, error: empErr } = await supabase
    .from('users_profile')
    .select(PAYROLL_PROFILE_COLUMNS)
    .eq('id', line.user_id)
    .single();
  if (empErr) throw empErr;
  const emp = empData as unknown as Record<string, unknown>;

  // Load run for working days and period
  const run = await getPayrollRunById(line.run_id);
  if (!run) throw new Error('Run not found');

  const settings = await getPayrollSettings();
  const workingDays = run.working_days_in_period ?? 22;
  const unpaidDays = workingDays - (line.days_worked ?? workingDays);

  // Keep arrears and final dues already on the line unless this save sets them
  const withArrears: Partial<VariablePayInput> = {
    arrears_amount: line.arrears_amount || 0,
    arrears_paye:   line.arrears_paye   || 0,
    ...finalDuesFields(line as unknown as Record<string, unknown>),
    ...variablePay,
  };

  const computed = computePayrollLine(
    toPayrollProfile(emp),
    settings,
    (line.other_deductions as Array<{ name: string; amount: number }>) || [],
    unpaidDays,
    workingDays,
    withArrears,
    { periodEnd: periodEndDate(run.pay_period_year, run.pay_period_month) }
  );

  const { error: updateErr } = await supabase
    .from('payroll_lines')
    .update(lineToDbFields(computed))
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

// ─── Salary arrears (migration 078) ──────────────────────────────────────────

export interface ArrearsBase { taxable: number; source: 'payroll' | 'p9' | 'manual' }

export interface SavedArrearsEntry extends ArrearsEntry {
  id: string;
  extra_paye: number;
}

/**
 * Taxable pay originally taxed for an employee in the given months: from saved
 * payroll runs first, then from imported P9 history. Months not found are absent.
 */
export async function loadArrearsBases(
  userId: string,
  months: Month[],
  excludeRunId?: string,
): Promise<Record<Month, ArrearsBase>> {
  const out: Record<Month, ArrearsBase> = {};
  if (months.length === 0) return out;

  // 1. Saved payroll runs
  const { data: runs, error: runErr } = await supabase
    .from('payroll_runs')
    .select('id, pay_period_year, pay_period_month, status')
    .not('status', 'in', '(rejected,superseded)');
  if (runErr) throw runErr;
  const runMonth = new Map<string, Month>();
  for (const r of runs || []) {
    if (r.id === excludeRunId) continue;
    const m = `${r.pay_period_year}-${String(r.pay_period_month).padStart(2, '0')}`;
    if (months.includes(m)) runMonth.set(r.id, m);
  }
  if (runMonth.size > 0) {
    const { data: lines, error } = await supabase
      .from('payroll_lines')
      .select('run_id, taxable_income')
      .eq('user_id', userId)
      .in('run_id', [...runMonth.keys()]);
    if (error) throw error;
    for (const l of lines || []) {
      const m = runMonth.get(l.run_id);
      if (m) out[m] = { taxable: Number(l.taxable_income) || 0, source: 'payroll' };
    }
  }

  // 2. Imported P9 history for months still unknown
  const remaining = months.filter(m => !out[m]);
  if (remaining.length > 0) {
    const { data: emp } = await supabase
      .from('users_profile').select('employee_id, kra_pin').eq('id', userId).maybeSingle();
    const years = [...new Set(remaining.map(m => Number(m.slice(0, 4))))];
    const { data: imports, error } = await supabase
      .from('p9_historical_imports').select('year, data').in('year', years);
    if (error) throw error;
    const pin = (emp?.kra_pin || '').trim().toUpperCase();
    for (const imp of imports || []) {
      const rows = (imp.data || []) as Array<{ employee_id?: string; kra_pin?: string;
        monthly?: Array<{ month: number; taxable_income: number }> }>;
      const person = rows.find(r => (emp?.employee_id && r.employee_id === emp.employee_id)
        || (pin && (r.kra_pin || '').trim().toUpperCase() === pin));
      for (const mm of person?.monthly || []) {
        const m = `${imp.year}-${String(mm.month).padStart(2, '0')}`;
        if (remaining.includes(m) && !out[m]) out[m] = { taxable: Number(mm.taxable_income) || 0, source: 'p9' };
      }
    }
  }
  return out;
}

/** Work out the extra PAYE on arrears for a payroll line, without saving. */
export async function previewArrearsForLine(
  lineId: string,
  entries: ArrearsEntry[],
  manualBases: Record<Month, number> = {},
): Promise<{ result: ArrearsResult; bases: Record<Month, ArrearsBase>; paymentMonth: Month }> {
  const { data: line, error: lineErr } = await supabase
    .from('payroll_lines').select('id, run_id, user_id').eq('id', lineId).single();
  if (lineErr) throw lineErr;
  const run = await getPayrollRunById(line.run_id);
  if (!run) throw new Error('Run not found');
  const paymentMonth = `${run.pay_period_year}-${String(run.pay_period_month).padStart(2, '0')}`;

  const { data: prof, error: profErr } = await supabase
    .from('users_profile').select('tax_residency, tax_employment_category').eq('id', line.user_id).single();
  if (profErr) throw profErr;
  const basis: TaxBasis = prof.tax_employment_category === 'secondary' ? 'secondary'
    : prof.tax_residency === 'non_resident' ? 'non_resident' : 'resident';

  const settings = await getPayrollSettings();
  const L = taxLimits(settings);
  const { shares } = spreadArrears(entries, paymentMonth);
  const bases = await loadArrearsBases(line.user_id, [...shares.keys()], run.id);
  for (const [m, v] of Object.entries(manualBases)) {
    if (Number.isFinite(v) && !bases[m]) bases[m] = { taxable: v, source: 'manual' };
  }

  const result = computeArrearsTax(entries, m => bases[m]?.taxable ?? null, {
    paymentMonth, basis,
    secondaryRate: L.secondary_employment_rate,
    shaRate: settings.sha_rate,
    housingLevyRate: settings.housing_levy_employee_rate,
  });
  return { result, bases, paymentMonth };
}

/** Arrears entries saved on a payroll line. */
export async function getArrearsForLine(lineId: string): Promise<SavedArrearsEntry[]> {
  const { data, error } = await supabase
    .from('payroll_arrears')
    .select('id, description, amount, from_month, to_month, extra_paye')
    .eq('line_id', lineId)
    .order('created_at');
  if (error) throw error;
  return (data || []).map(r => ({
    id: r.id, description: r.description, amount: Number(r.amount),
    from: String(r.from_month).slice(0, 7), to: String(r.to_month).slice(0, 7),
    extra_paye: Number(r.extra_paye),
  }));
}

/**
 * Save arrears on a payroll line (replaces any saved before) and recompute the
 * line. Pass an empty list to remove arrears.
 */
export async function saveArrearsForLine(
  lineId: string,
  entries: ArrearsEntry[],
  manualBases: Record<Month, number> = {},
): Promise<ArrearsResult> {
  const { result, bases } = await previewArrearsForLine(lineId, entries, manualBases);
  if (result.errors.length) throw new Error(result.errors.join('; '));
  if (result.missing.length) {
    throw new Error(`Enter the taxable pay originally taxed for: ${result.missing.join(', ')}`);
  }

  const { data: line, error: lineErr } = await supabase
    .from('payroll_lines').select('run_id, user_id').eq('id', lineId).single();
  if (lineErr) throw lineErr;
  const { data: { user } } = await supabase.auth.getUser();

  const { error: delErr } = await supabase.from('payroll_arrears').delete().eq('line_id', lineId);
  if (delErr) throw delErr;

  if (entries.length > 0) {
    // Split the extra PAYE across entries by amount, for the record
    let allocated = 0;
    const rows = entries.map((e, i) => {
      const share = i === entries.length - 1
        ? result.extraPaye - allocated
        : Math.round(result.extraPaye * (e.amount / result.totalArrears));
      allocated += share;
      return {
        run_id: line.run_id, line_id: lineId, user_id: line.user_id,
        description: e.description.trim() || 'Salary arrears',
        amount: e.amount, from_month: `${e.from}-01`, to_month: `${e.to}-01`,
        breakdown: result.months.map(m => ({ ...m, source: bases[m.month]?.source ?? null })),
        extra_paye: share,
        created_by: user?.id ?? null,
      };
    });
    const { error: insErr } = await supabase.from('payroll_arrears').insert(rows);
    if (insErr) throw insErr;
  }

  await saveVariablePayForLine(lineId, {
    arrears_amount: result.totalArrears,
    arrears_paye: result.extraPaye,
  });
  return result;
}


// ─── Final dues on leaving (migration 079) ───────────────────────────────────

export interface FinalDuesInputs {
  exitRequestId: string | null;
  lastWorkingDate: string;       // YYYY-MM-DD
  daysWorked: number;            // working days paid in the final month
  leaveDays: number;
  leaveDailyRate: number;
  leavePay: number;
  noticeMonths: number;
  noticePay: number;
  severanceYears: number;
  severancePay: number;
  gratuityAmount: number;
  gratuityFrom: Month;           // YYYY-MM
  gratuityTo: Month;
  compensationAmount: number;
  compensationBasis: 'none' | 'fixed_term' | 'no_provision';
  compensationMonths: number;
}

export interface FinalDuesContext {
  employeeName: string;
  monthlyBasic: number;
  monthlyPay: number;            // basic + fixed allowances
  hireDate: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  workingDaysInMonth: number;
  periodStart: string;
  periodEnd: string;
  paymentMonth: Month;
  exit: { id: string; exit_type: string; last_working_date: string; notice_date: string } | null;
  leaveDaysRemaining: number | null;
  saved: FinalDuesInputs | null;
}

/** Everything needed to pre-fill the final dues form for a payroll line. */
export async function getFinalDuesContext(lineId: string): Promise<FinalDuesContext> {
  const { data: line, error: lineErr } = await supabase
    .from('payroll_lines').select('id, run_id, user_id').eq('id', lineId).single();
  if (lineErr) throw lineErr;
  const run = await getPayrollRunById(line.run_id);
  if (!run) throw new Error('Run not found');
  const paymentMonth = `${run.pay_period_year}-${String(run.pay_period_month).padStart(2, '0')}`;
  const periodStart = `${paymentMonth}-01`;
  const periodEnd = periodEndDate(run.pay_period_year, run.pay_period_month);

  const [profRes, exitRes, savedRes, wdRes] = await Promise.all([
    supabase.from('users_profile')
      .select('first_name, last_name, basic_salary, allowances, hire_date, contract_start_date, contract_end_date')
      .eq('id', line.user_id).single(),
    supabase.from('exit_requests')
      .select('id, exit_type, last_working_date, notice_date, status')
      .eq('user_id', line.user_id).neq('status', 'cancelled')
      .order('created_at', { ascending: false }).limit(1),
    supabase.from('final_dues').select('inputs').eq('line_id', lineId).maybeSingle(),
    run.working_days_in_period
      ? Promise.resolve({ data: run.working_days_in_period, error: null })
      : supabase.rpc('count_working_days_in_month', { p_year: run.pay_period_year, p_month: run.pay_period_month }),
  ]);
  if (profRes.error) throw profRes.error;
  const p = profRes.data as Record<string, unknown>;
  const allowances = Object.values((p.allowances as Record<string, number>) || {}).reduce((s, v) => s + (Number(v) || 0), 0);

  // Untaken annual leave this year
  let leaveDaysRemaining: number | null = null;
  const { data: bal } = await supabase
    .from('leave_balances')
    .select('annual_allocation, carryforward_days, used_days, pending_days, leave_types(name)')
    .eq('user_id', line.user_id).eq('year', run.pay_period_year);
  const annual = (bal || []).find(b => /annual/i.test(String((b as { leave_types?: { name?: string } }).leave_types?.name ?? '')));
  if (annual) {
    leaveDaysRemaining = Math.max(0, Number(annual.annual_allocation) + Number(annual.carryforward_days)
      - Number(annual.used_days) - Number(annual.pending_days));
  }

  return {
    employeeName: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    monthlyBasic: Number(p.basic_salary) || 0,
    monthlyPay: (Number(p.basic_salary) || 0) + allowances,
    hireDate: (p.hire_date as string) ?? null,
    contractStart: (p.contract_start_date as string) ?? null,
    contractEnd: (p.contract_end_date as string) ?? null,
    workingDaysInMonth: Number(wdRes.data) || 22,
    periodStart, periodEnd, paymentMonth,
    exit: exitRes.data?.[0] ?? null,
    leaveDaysRemaining,
    saved: (savedRes.data?.inputs as FinalDuesInputs) ?? null,
  };
}

/** Work out the final payslip and the tax on terminal lump sums, without saving. */
export async function previewFinalDues(lineId: string, inp: FinalDuesInputs): Promise<{
  tax: TerminalTax;
  line: ComputedPayrollLine;
  bases: Record<Month, ArrearsBase>;
  paymentMonth: Month;
}> {
  const { data: lineRow, error: lineErr } = await supabase.from('payroll_lines').select('*').eq('id', lineId).single();
  if (lineErr) throw lineErr;
  const line = lineRow as PayrollLine & { run_id: string };
  const run = await getPayrollRunById(line.run_id);
  if (!run) throw new Error('Run not found');
  const paymentMonth = `${run.pay_period_year}-${String(run.pay_period_month).padStart(2, '0')}`;

  const { data: emp, error: empErr } = await supabase
    .from('users_profile').select(PAYROLL_PROFILE_COLUMNS).eq('id', line.user_id).single();
  if (empErr) throw empErr;
  const profile = toPayrollProfile(emp as unknown as Record<string, unknown>);
  const basis: TaxBasis = profile.tax_employment_category === 'secondary' ? 'secondary'
    : profile.tax_residency === 'non_resident' ? 'non_resident' : 'resident';

  const settings = await getPayrollSettings();
  const L = taxLimits(settings);
  const workingDays = run.working_days_in_period ?? 22;
  const unpaidDays = Math.max(0, workingDays - Math.max(0, inp.daysWorked));
  const periodEnd = periodEndDate(run.pay_period_year, run.pay_period_month);
  const otherDeds = (line.other_deductions as Array<{ name: string; amount: number }>) || [];

  const g = splitGratuity(inp.gratuityAmount, inp.gratuityFrom, inp.gratuityTo);
  const vp: Partial<VariablePayInput> = {
    overtime_amount: line.overtime_amount || 0, overtime_hours: line.overtime_hours || 0,
    bonus_amount: line.bonus_amount || 0, acting_allowance: line.acting_allowance || 0,
    per_diem_amount: line.per_diem_amount || 0, per_diem_days: line.per_diem_days || 0,
    benefits_in_kind: line.benefits_in_kind || 0,
    other_variable_pay: (line.other_variable_pay as Array<{ name: string; amount: number }>) || [],
    court_deduction_amount: line.court_deduction_amount || 0, court_deduction_ref: line.court_deduction_ref || '',
    arrears_amount: line.arrears_amount || 0, arrears_paye: line.arrears_paye || 0,
    leave_pay: inp.leavePay, notice_pay: inp.noticePay,
    severance_pay: inp.severancePay, gratuity_amount: inp.gratuityAmount, gratuity_exempt: g.exempt,
    compensation_amount: inp.compensationAmount,
  };

  // This month's ordinary taxable pay (salary to last day + leave + notice)
  const ordinary = computePayrollLine(profile, settings, otherDeds, unpaidDays, workingDays,
    { ...vp, severance_pay: 0, gratuity_amount: 0, compensation_amount: 0, terminal_paye: 0 }, { periodEnd });

  // Taxable pay earlier this year (other runs of the same year)
  const { data: runs, error: runErr } = await supabase
    .from('payroll_runs').select('id, pay_period_month, status')
    .eq('pay_period_year', run.pay_period_year).lt('pay_period_month', run.pay_period_month)
    .not('status', 'in', '(rejected,superseded)');
  if (runErr) throw runErr;
  let yearTaxable = ordinary.taxable_income;
  if ((runs || []).length > 0) {
    const { data: prior, error } = await supabase.from('payroll_lines').select('taxable_income')
      .eq('user_id', line.user_id).in('run_id', (runs || []).map(r => r.id));
    if (error) throw error;
    yearTaxable += (prior || []).reduce((s, l) => s + (Number(l.taxable_income) || 0), 0);
  }

  const gMonths = g.taxableFrom && g.taxableTo ? monthsBetween(g.taxableFrom, g.taxableTo) : [];
  const bases = await loadArrearsBases(line.user_id, gMonths, run.id);

  const tax = terminalTax({
    paymentMonth, basis, secondaryRate: L.secondary_employment_rate, yearTaxable,
    severance: inp.severancePay,
    gratuity: { amount: inp.gratuityAmount, from: inp.gratuityFrom, to: inp.gratuityTo },
    compensation: { amount: inp.compensationAmount, months: inp.compensationMonths },
  }, m => bases[m]?.taxable ?? null);

  const finalLine = computePayrollLine(profile, settings, otherDeds, unpaidDays, workingDays,
    { ...vp, terminal_paye: tax.total }, { periodEnd });
  return { tax, line: finalLine, bases, paymentMonth };
}

/** Save final dues on a payroll line and recompute it. */
export async function saveFinalDues(lineId: string, inp: FinalDuesInputs): Promise<TerminalTax> {
  if (!inp.lastWorkingDate) throw new Error('Enter the last working day');
  const { tax } = await previewFinalDues(lineId, inp);
  if (tax.errors.length) throw new Error(tax.errors.join('; '));
  if (tax.missing.length) {
    throw new Error(`Gratuity before Jul 2025 needs the taxable pay originally taxed for: ${tax.missing.join(', ')}. ` +
      'Load the P9 history for those months, or ask for manual entry.');
  }

  const { data: line, error: lineErr } = await supabase
    .from('payroll_lines').select('run_id, user_id').eq('id', lineId).single();
  if (lineErr) throw lineErr;
  const { data: { user } } = await supabase.auth.getUser();

  const { error: upErr } = await supabase.from('final_dues').upsert({
    line_id: lineId, run_id: line.run_id, user_id: line.user_id,
    exit_request_id: inp.exitRequestId, last_working_date: inp.lastWorkingDate,
    days_worked: inp.daysWorked, inputs: inp,
    tax_working: {
      severanceTax: tax.severanceTax, gratuityTaxable: tax.gratuityTaxable, gratuityExempt: tax.gratuityExempt,
      gratuityTax: tax.gratuityTax, gratuityMonths: tax.gratuitySpread?.months ?? [],
      compensationTax: tax.compensationTax, total: tax.total,
    },
    terminal_paye: tax.total, created_by: user?.id ?? null, updated_at: new Date().toISOString(),
  }, { onConflict: 'line_id' });
  if (upErr) throw upErr;

  const { error: dwErr } = await supabase.from('payroll_lines').update({ days_worked: inp.daysWorked }).eq('id', lineId);
  if (dwErr) throw dwErr;

  const g = splitGratuity(inp.gratuityAmount, inp.gratuityFrom, inp.gratuityTo);
  await saveVariablePayForLine(lineId, {
    leave_pay: inp.leavePay, notice_pay: inp.noticePay, severance_pay: inp.severancePay,
    gratuity_amount: inp.gratuityAmount, gratuity_exempt: g.exempt,
    compensation_amount: inp.compensationAmount, terminal_paye: tax.total,
  });

  // Tick "Final payroll processed" on the exit clearance checklist
  if (inp.exitRequestId) {
    const { data: ex } = await supabase.from('exit_requests').select('clearance_items').eq('id', inp.exitRequestId).maybeSingle();
    const items = (ex?.clearance_items as Array<{ key: string; cleared: boolean }>) || [];
    if (items.some(i => i.key === 'final_payroll' && !i.cleared)) {
      await supabase.from('exit_requests').update({
        clearance_items: items.map(i => (i.key === 'final_payroll' ? { ...i, cleared: true } : i)),
        updated_at: new Date().toISOString(),
      }).eq('id', inp.exitRequestId);
    }
  }
  return tax;
}

/** Remove final dues from a payroll line (back to a normal full month). */
export async function removeFinalDues(lineId: string): Promise<void> {
  const { data: line, error } = await supabase.from('payroll_lines').select('run_id').eq('id', lineId).single();
  if (error) throw error;
  const run = await getPayrollRunById(line.run_id);
  const { error: delErr } = await supabase.from('final_dues').delete().eq('line_id', lineId);
  if (delErr) throw delErr;
  await supabase.from('payroll_lines').update({ days_worked: run?.working_days_in_period ?? null }).eq('id', lineId);
  await saveVariablePayForLine(lineId, {
    leave_pay: 0, notice_pay: 0, severance_pay: 0, gratuity_amount: 0, gratuity_exempt: 0,
    compensation_amount: 0, terminal_paye: 0,
  });
}


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
