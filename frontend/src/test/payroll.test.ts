// Kenya payroll calculations. Expected values are computed by hand from the
// statutory rules (not from the code):
//   PAYE bands (monthly): 10% to 24,000 · 25% to 32,333 · 30% to 500,000 · 32.5% to 800,000 · 35% above
//   Personal relief 2,400. SHIF 2.75% (min 300). Housing Levy 1.5% + 1.5% employer.
//   NSSF Year 4 (Feb 2026): 6%/6%, LEL 9,000, UEL 108,000.
//   Taxable income = gross − pension (NSSF + supplementary, cap 30,000) − SHIF − Housing Levy
//   (Tax Laws (Amendment) Act 2024, effective 27 Dec 2024; KRA public notice 2157).
import { vi, describe, expect, test } from 'vitest';

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));

import {
  computeHousingLevy, computeNSSF, computePAYE, computePayrollLine, computeSHA,
  type PayrollSettings,
} from '../services/payrollService';

const SETTINGS: PayrollSettings = {
  paye_bands: [
    { min: 0, max: 24000, rate: 0.10 },
    { min: 24000, max: 32333, rate: 0.25 },
    { min: 32333, max: 500000, rate: 0.30 },
    { min: 500000, max: 800000, rate: 0.325 },
    { min: 800000, max: null, rate: 0.35 },
  ],
  paye_personal_relief: 2400,
  nssf_tier1_ceiling: 9000,
  nssf_tier2_ceiling: 108000,
  nssf_employee_rate: 0.06,
  nssf_employer_rate: 0.06,
  sha_rate: 0.0275,
  sha_minimum: 300,
  housing_levy_employee_rate: 0.015,
  housing_levy_employer_rate: 0.015,
};

const employee = (over: Partial<Parameters<typeof computePayrollLine>[0]> = {}) => ({
  id: 'u1', employee_id: 'FKF001', basic_salary: 0, allowances: {},
  helb_monthly_amount: 0, sacco_contribution: 0, sacco_loan_repayment: 0,
  medical_premium: 0, supplementary_pension: 0, salary_advance_monthly_recovery: 0,
  ...over,
});

describe('NSSF (Year 4)', () => {
  test.each([
    // gross, tier1, tier2, employee total
    [5_000, 300, 0, 300],
    [9_000, 540, 0, 540],
    [20_000, 540, 660, 1_200],
    [100_000, 540, 5_460, 6_000],
    [108_000, 540, 5_940, 6_480],
    [500_000, 540, 5_940, 6_480], // capped at the UEL
  ])('gross %i → tier I %i, tier II %i', (gross, t1, t2, total) => {
    const n = computeNSSF(gross, SETTINGS);
    expect([n.tier1, n.tier2, n.employee, n.employer]).toEqual([t1, t2, total, total]);
  });
});

describe('PAYE bands', () => {
  test.each([
    [10_000, 1_000, 0],          // below relief
    [24_000, 2_400, 0],          // exactly the first band: fully relieved
    [32_333, 4_483, 2_083],      // 2,400 + 8,333×25% = 4,483.25
    [89_750, 21_708, 19_308],    // + 57,417×30%
    [600_000, 177_283, 174_883],   // 4,483.25 + 467,667×30% (140,300.10) + 100,000×32.5% (32,500)
    [1_000_000, 312_283, 309_883], // 4,483.25 + 140,300.10 + 300,000×32.5% + 200,000×35%
  ])('taxable %i → before relief %i, after %i', (taxable, before, after) => {
    const r = computePAYE(taxable, SETTINGS.paye_bands, SETTINGS.paye_personal_relief);
    expect([r.payeBeforeRelief, r.paye]).toEqual([before, after]);
  });
});

describe('SHIF and Housing Levy', () => {
  test('SHIF is 2.75% with a KES 300 minimum', () => {
    expect(computeSHA(100_000, SETTINGS)).toBe(2_750);
    expect(computeSHA(8_000, SETTINGS)).toBe(300);
  });
  test('Housing Levy is 1.5% each side', () => {
    expect(computeHousingLevy(100_000, SETTINGS)).toEqual({ employee: 1_500, employer: 1_500 });
  });
});

describe('full payroll line', () => {
  test('KES 100,000 gross: SHIF and Housing Levy reduce taxable income', () => {
    const l = computePayrollLine(employee({ basic_salary: 80_000, allowances: { house: 20_000 } }), SETTINGS);
    expect(l.gross_pay).toBe(100_000);
    expect(l.nssf_tier1 + l.nssf_tier2).toBe(6_000);
    expect(l.sha_amount).toBe(2_750);
    expect(l.housing_levy_employee).toBe(1_500);
    expect(l.taxable_income).toBe(89_750);   // 100,000 − 6,000 − 2,750 − 1,500
    expect(l.paye_amount).toBe(19_308);
    expect(l.total_deductions).toBe(29_558);
    expect(l.net_pay).toBe(70_442);
    expect(l.nssf_employer).toBe(6_000);
    expect(l.housing_levy_employer).toBe(1_500);
  });

  test('low earner (KES 20,000): no PAYE after personal relief', () => {
    const l = computePayrollLine(employee({ basic_salary: 20_000 }), SETTINGS);
    expect(l.taxable_income).toBe(17_950);   // 20,000 − 1,200 − 550 − 300
    expect(l.paye_amount).toBe(0);
    expect(l.net_pay).toBe(17_950);
  });

  test('high earner (KES 300,000)', () => {
    const l = computePayrollLine(employee({ basic_salary: 300_000 }), SETTINGS);
    expect(l.taxable_income).toBe(280_770);  // 300,000 − 6,480 − 8,250 − 4,500
    expect(l.paye_amount).toBe(76_614);
    expect(l.net_pay).toBe(300_000 - 6_480 - 8_250 - 4_500 - 76_614);
  });

  test('pension deduction (NSSF + supplementary) is capped at KES 30,000', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, supplementary_pension: 30_000 }), SETTINGS);
    expect(l.taxable_income).toBe(65_750);   // 100,000 − 30,000 cap − 2,750 − 1,500
    expect(l.paye_amount).toBe(12_108);
    expect(l.net_pay).toBe(100_000 - (6_000 + 2_750 + 1_500 + 12_108) - 30_000);
  });

  test('insurance relief is 15% of the medical premium, capped at KES 5,000', () => {
    const small = computePayrollLine(employee({ basic_salary: 100_000, medical_premium: 10_000 }), SETTINGS);
    expect(small.insurance_relief).toBe(1_500);
    expect(small.paye_amount).toBe(19_308 - 1_500);
    const big = computePayrollLine(employee({ basic_salary: 100_000, medical_premium: 40_000 }), SETTINGS);
    expect(big.insurance_relief).toBe(5_000);
  });

  test('unpaid days prorate fixed pay; variable pay is not prorated', () => {
    const l = computePayrollLine(employee({ basic_salary: 66_000 }), SETTINGS, [], 11, 22, { overtime_amount: 5_000 });
    expect(l.gross_pay).toBe(33_000 + 5_000);
  });

  test('benefits in kind are taxed but not paid in cash', () => {
    const base = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS);
    const bik = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22, { benefits_in_kind: 10_000 });
    expect(bik.gross_pay).toBe(100_000);
    expect(bik.taxable_income).toBe(base.taxable_income + 10_000);
    expect(bik.paye_amount).toBe(base.paye_amount + 3_000);  // 30% band
  });

  test('HELB, SACCO, advances and other deductions come off net pay, not taxable income', () => {
    const l = computePayrollLine(
      employee({ basic_salary: 100_000, helb_monthly_amount: 2_000, sacco_contribution: 3_000,
                 sacco_loan_repayment: 1_000, salary_advance_monthly_recovery: 4_000 }),
      SETTINGS, [{ name: 'Welfare', amount: 500 }]);
    expect(l.taxable_income).toBe(89_750);
    expect(l.net_pay).toBe(70_442 - 2_000 - 3_000 - 1_000 - 4_000 - 500);
  });

  test('benefits in kind within the annual exemption (≤ 60,000/yr = 5,000/month) are not taxed', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22, { benefits_in_kind: 4_000 });
    expect(l.bik_taxable).toBe(0);
    expect(l.taxable_income).toBe(89_750);
    expect(l.paye_amount).toBe(19_308);
  });

  test('net pay never goes negative', () => {
    const l = computePayrollLine(employee({ basic_salary: 10_000, salary_advance_monthly_recovery: 50_000 }), SETTINGS);
    expect(l.net_pay).toBe(0);
  });
});

// ─── Special cases (migration 077) ───────────────────────────────────────────
// Base: KES 100,000 gross → NSSF 6,000, SHIF 2,750, Housing Levy 1,500,
// taxable 89,750, PAYE before relief 21,708, PAYE 19,308.
const PERIOD = { periodEnd: '2026-09-30' };

describe('per diem (ITA s.5(2)(a), KES 10,000/day tax-free)', () => {
  test('within the daily limit: all tax-free, and outside the NSSF/SHIF/Housing Levy base', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22,
      { per_diem_amount: 15_000, per_diem_days: 3 }, PERIOD);
    expect(l.per_diem_exempt).toBe(15_000);
    expect(l.gross_pay).toBe(115_000);
    expect(l.taxable_income).toBe(89_750);
    expect(l.paye_amount).toBe(19_308);
    expect(l.net_pay).toBe(115_000 - 29_558);
  });

  test('above the limit: only the excess is pay', () => {
    // 30,000 for 2 days → 20,000 tax-free, 10,000 taxable → base 110,000
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22,
      { per_diem_amount: 30_000, per_diem_days: 2 }, PERIOD);
    expect(l.per_diem_exempt).toBe(20_000);
    expect(l.nssf_tier1 + l.nssf_tier2).toBe(6_480);
    expect(l.sha_amount).toBe(3_025);
    expect(l.housing_levy_employee).toBe(1_650);
    expect(l.taxable_income).toBe(98_845);   // 110,000 − 6,480 − 3,025 − 1,650
    expect(l.paye_amount).toBe(22_037);
    expect(l.net_pay).toBe(130_000 - (6_480 + 3_025 + 1_650 + 22_037));
  });

  test('no travel days recorded: the whole per diem is taxable pay', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22,
      { per_diem_amount: 30_000 }, PERIOD);
    expect(l.per_diem_exempt).toBe(0);
    expect(l.taxable_income).toBe(117_995);  // 130,000 − 6,480 − 3,575 − 1,950
    expect(l.paye_amount).toBe(27_782);
  });

  test('the daily limit comes from payroll settings when set', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), { ...SETTINGS, limits: { per_diem_daily_exempt: 2_000 } },
      [], 0, 22, { per_diem_amount: 30_000, per_diem_days: 2 }, PERIOD);
    expect(l.per_diem_exempt).toBe(4_000);
  });
});

describe('deductions from taxable income', () => {
  test('owner-occupier mortgage interest, capped at 30,000/month', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, mortgage_interest_monthly: 40_000 }), SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.mortgage_interest_deduction).toBe(30_000);
    expect(l.taxable_income).toBe(59_750);
    expect(l.paye_amount).toBe(10_308);
    expect(l.net_pay).toBe(100_000 - (6_000 + 2_750 + 1_500 + 10_308));  // tax only — not a payroll deduction
  });

  test('post-retirement medical fund, capped at 15,000/month', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, post_retirement_medical_monthly: 20_000 }), SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.prmf_deduction).toBe(15_000);
    expect(l.taxable_income).toBe(74_750);
    expect(l.paye_amount).toBe(14_808);
  });
});

describe('persons with disability (first 150,000/month exempt)', () => {
  const cert = { disability_exemption_cert_no: 'KRA/PWD/123', disability_exemption_expiry: '2028-12-31' };

  test('income under the exemption: no PAYE', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, ...cert }), SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.disability_exemption).toBe(89_750);
    expect(l.taxable_income).toBe(0);
    expect(l.paye_amount).toBe(0);
  });

  test('income above it: taxed on the excess, with personal relief', () => {
    const l = computePayrollLine(employee({ basic_salary: 300_000, ...cert }), SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.disability_exemption).toBe(150_000);
    expect(l.taxable_income).toBe(130_770);  // 280,770 − 150,000
    expect(l.paye_amount).toBe(31_614);
  });

  test('expired certificate: no exemption', () => {
    const l = computePayrollLine(employee({ basic_salary: 300_000, ...cert, disability_exemption_expiry: '2026-09-29' }),
      SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.disability_exemption).toBe(0);
    expect(l.paye_amount).toBe(76_614);
  });

  test('no certificate number: no exemption', () => {
    const l = computePayrollLine(employee({ basic_salary: 300_000, ...cert, disability_exemption_cert_no: ' ' }),
      SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.disability_exemption).toBe(0);
  });
});

describe('non-resident employee', () => {
  test('normal bands and deductions, but no personal or insurance relief', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, tax_residency: 'non_resident', medical_premium: 10_000 }),
      SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.tax_basis).toBe('non_resident');
    expect(l.taxable_income).toBe(89_750);
    expect(l.personal_relief).toBe(0);
    expect(l.insurance_relief).toBe(0);
    expect(l.paye_amount).toBe(21_708);
  });

  test('mortgage interest deduction does not apply', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, tax_residency: 'non_resident', mortgage_interest_monthly: 30_000 }),
      SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.mortgage_interest_deduction).toBe(0);
  });
});

describe('secondary employment', () => {
  test('35% on the whole taxable pay, no deductions or reliefs', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000, tax_employment_category: 'secondary',
      mortgage_interest_monthly: 30_000, medical_premium: 10_000 }), SETTINGS, [], 0, 22, {}, PERIOD);
    expect(l.tax_basis).toBe('secondary');
    expect(l.taxable_income).toBe(100_000);
    expect(l.personal_relief).toBe(0);
    expect(l.insurance_relief).toBe(0);
    expect(l.paye_amount).toBe(35_000);
    // statutory contributions are still deducted from pay
    expect(l.nssf_tier1 + l.nssf_tier2 + l.sha_amount + l.housing_levy_employee).toBe(10_250);
    expect(l.net_pay).toBe(100_000 - (10_250 + 35_000) - 10_000);
  });
});

describe('salary arrears on a payslip line', () => {
  test('arrears are paid in cash now; SHIF and Housing Levy charged on them; PAYE from the spread-back', () => {
    // arrears 30,000 for Jul–Sep 2026; spread-back PAYE 8,619 (see arrears.test.ts)
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22,
      { arrears_amount: 30_000, arrears_paye: 8_619 }, PERIOD);
    expect(l.gross_pay).toBe(130_000);
    expect(l.nssf_tier1 + l.nssf_tier2).toBe(6_000);      // not recomputed for past months
    expect(l.sha_amount).toBe(3_575);                     // 2,750 + 825
    expect(l.housing_levy_employee).toBe(1_950);          // 1,500 + 450
    expect([l.arrears_sha, l.arrears_housing_levy]).toEqual([825, 450]);
    expect(l.taxable_income).toBe(89_750);                // this month only
    expect(l.arrears_paye).toBe(8_619);
    expect(l.paye_amount).toBe(27_927);                   // 19,308 + 8,619
    expect(l.net_pay).toBe(90_548);
  });

  test('no arrears amount → arrears PAYE ignored', () => {
    const l = computePayrollLine(employee({ basic_salary: 100_000 }), SETTINGS, [], 0, 22, { arrears_paye: 5_000 }, PERIOD);
    expect(l.paye_amount).toBe(19_308);
  });
});
