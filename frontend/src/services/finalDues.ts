// Final dues on leaving: suggested amounts (Employment Act) and how each
// terminal payment is taxed (KRA). Pure functions — no database — so they can
// be tested against hand-worked examples.
//
//   Salary to last day, notice pay, leave pay   normal pay in the final month
//   Severance (redundancy)                      lump sum: added to the year's taxable pay and taxed at
//                                               annual rates; the difference is the tax due (KRA lump-sum method)
//   Gratuity earned before 1 Jul 2025           spread back to the months earned, up to 4 years (KRA notice 2246)
//   Gratuity earned from 1 Jul 2025             tax-free (Finance Act 2025)
//   Compensation for loss of office             spread forward: over the unexpired term of a fixed-term
//                                               contract, or over 3 years if the contract makes no provision
import { bandTax, computeArrearsTax, monthsBetween, rulesFor, type ArrearsResult, type Month, type TaxBasis } from './arrears';

/** Gratuity earned from this month on is exempt from income tax (Finance Act 2025, KRA notice 2246). */
export const GRATUITY_EXEMPT_FROM: Month = '2025-07';

// ─── Suggested amounts ───────────────────────────────────────────────────────

/** Completed years of service between two YYYY-MM-DD dates. */
export function completedYears(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  let years = ey - sy;
  if (em < sm || (em === sm && ed < sd)) years--;
  return Math.max(0, years);
}

/** Redundancy severance (Employment Act s.40): not less than 15 days' pay per completed year. */
export function suggestSeverance(monthlyBasic: number, years: number): number {
  return Math.round((monthlyBasic / 30) * 15 * years);
}

/** Leave pay for untaken days at monthly pay ÷ working days per month. */
export function suggestLeavePay(monthlyPay: number, days: number, workingDaysPerMonth = 22): number {
  return Math.round((monthlyPay / workingDaysPerMonth) * Math.max(0, days));
}

/** Pay in lieu of notice. */
export function suggestNoticePay(monthlyPay: number, months: number): number {
  return Math.round(monthlyPay * Math.max(0, months));
}

/** Whole months between the month after the last working day and the contract end (unexpired term). */
export function unexpiredMonths(lastWorkingDay: string, contractEnd: string): number {
  if (contractEnd <= lastWorkingDay) return 0;
  const [ly, lm] = lastWorkingDay.split('-').map(Number);
  const [cy, cm] = contractEnd.split('-').map(Number);
  return Math.max(0, (cy - ly) * 12 + (cm - lm));
}

// ─── Tax on terminal lump sums ───────────────────────────────────────────────

export interface Rules { bands: Array<{ min: number; max: number | null; rate: number }>; relief: number }

function annualRules(month: Month): Rules {
  const r = rulesFor(month);
  if (!r) throw new Error(`No PAYE rates on record for ${month}`);
  return {
    bands: r.bands.map(b => ({ min: b.min * 12, max: b.max == null ? null : b.max * 12, rate: b.rate })),
    relief: r.relief * 12,
  };
}

/**
 * KRA lump-sum method for the year of payment: tax on (year's taxable pay + lump sum)
 * at annual rates, less tax on the year's taxable pay alone.
 */
export function lumpSumTax(yearTaxable: number, lump: number, paymentMonth: Month, basis: TaxBasis = 'resident', secondaryRate = 0.35): number {
  if (lump <= 0) return 0;
  if (basis === 'secondary') return Math.round(lump * secondaryRate);
  const a = annualRules(paymentMonth);
  const relief = basis === 'resident' ? a.relief : 0;
  const tax = (t: number) => Math.max(0, Math.round(bandTax(t, a.bands)) - relief);
  return tax(yearTaxable + lump) - tax(yearTaxable);
}

/** Split gratuity for a service period into the taxable (before Jul 2025) and exempt parts, evenly by month. */
export function splitGratuity(amount: number, from: Month, to: Month): { taxable: number; exempt: number; taxableFrom: Month | null; taxableTo: Month | null } {
  if (amount <= 0 || !from || !to || from > to) return { taxable: 0, exempt: Math.max(0, amount), taxableFrom: null, taxableTo: null };
  const months = monthsBetween(from, to);
  const before = months.filter(m => m < GRATUITY_EXEMPT_FROM);
  const taxable = Math.round((amount * before.length) / months.length);
  return {
    taxable,
    exempt: amount - taxable,
    taxableFrom: before[0] ?? null,
    taxableTo: before[before.length - 1] ?? null,
  };
}

/**
 * Compensation for loss of office, spread forward evenly over `months` after the
 * last working month and taxed at the payment month's rates. No personal relief
 * (the employee claims it against later income).
 */
export function compensationTax(amount: number, months: number, paymentMonth: Month, basis: TaxBasis = 'resident', secondaryRate = 0.35): number {
  if (amount <= 0) return 0;
  const n = Math.max(1, Math.round(months));
  if (basis === 'secondary') return Math.round(amount * secondaryRate);
  const r = rulesFor(paymentMonth);
  if (!r) throw new Error(`No PAYE rates on record for ${paymentMonth}`);
  const perMonth = amount / n;
  return Math.round(bandTax(perMonth, r.bands) * n);
}

export interface TerminalInputs {
  paymentMonth: Month;
  basis?: TaxBasis;
  secondaryRate?: number;
  /** Taxable pay for the year of payment so far, INCLUDING this month's ordinary pay (salary, leave, notice). */
  yearTaxable: number;
  severance: number;
  gratuity: { amount: number; from: Month; to: Month };
  compensation: { amount: number; months: number };
}

export interface TerminalTax {
  severanceTax: number;
  gratuityTaxable: number;
  gratuityExempt: number;
  gratuityTax: number;
  gratuitySpread: ArrearsResult | null;
  compensationTax: number;
  total: number;
  missing: Month[];
  errors: string[];
}

/** Tax on severance, gratuity and compensation. `baseFor` gives the taxable pay originally taxed in past months. */
export function terminalTax(input: TerminalInputs, baseFor: (m: Month) => number | null): TerminalTax {
  const basis = input.basis ?? 'resident';
  const severanceTax = lumpSumTax(input.yearTaxable, input.severance, input.paymentMonth, basis, input.secondaryRate);

  const g = splitGratuity(input.gratuity.amount, input.gratuity.from, input.gratuity.to);
  let gratuitySpread: ArrearsResult | null = null;
  if (g.taxable > 0 && g.taxableFrom && g.taxableTo) {
    gratuitySpread = computeArrearsTax(
      [{ description: 'Gratuity (before Jul 2025)', amount: g.taxable, from: g.taxableFrom, to: g.taxableTo }],
      baseFor,
      // Gratuity is not salary: no SHIF/Housing Levy deduction in the recomputation
      { paymentMonth: input.paymentMonth, basis, secondaryRate: input.secondaryRate, shaRate: 0, housingLevyRate: 0 },
    );
  }
  const gratuityTax = gratuitySpread?.extraPaye ?? 0;
  const compTax = compensationTax(input.compensation.amount, input.compensation.months, input.paymentMonth, basis, input.secondaryRate);

  const missing = gratuitySpread?.missing ?? [];
  const errors = gratuitySpread?.errors ?? [];
  return {
    severanceTax,
    gratuityTaxable: g.taxable,
    gratuityExempt: g.exempt,
    gratuityTax,
    gratuitySpread,
    compensationTax: compTax,
    total: missing.length || errors.length ? 0 : severanceTax + gratuityTax + compTax,
    missing,
    errors,
  };
}
