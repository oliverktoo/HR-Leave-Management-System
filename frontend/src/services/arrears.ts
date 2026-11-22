// Salary arrears (back pay): tax by spreading back to the months they relate to.
//
// KRA method: the arrears are spread over the period they were earned; each
// month's tax is recomputed on (pay originally taxed + its share of the arrears)
// at the rates in force THEN; the extra tax is deducted now. Arrears relating to
// periods more than four years before the year of payment are treated as income
// of the fifth year back (KRA, 2025).
//
// This module is pure (no database) so it can be tested against hand-worked
// examples. Statutory rates for past months come from PAYE_HISTORY below.

export interface PayeBand { min: number; max: number | null; rate: number }

/** Monthly PAYE rules by start month (YYYY-MM). Only periods arrears can reach (≤ 5 years back). */
export const PAYE_HISTORY: Array<{ from: string; bands: PayeBand[]; relief: number; note: string }> = [
  {
    from: '2021-01',
    bands: [
      { min: 0, max: 24_000, rate: 0.10 },
      { min: 24_000, max: 32_333, rate: 0.25 },
      { min: 32_333, max: null, rate: 0.30 },
    ],
    relief: 2_400,
    note: 'Jan 2021 – Jun 2023 (Finance Act 2020) — confirm with KRA',
  },
  {
    from: '2023-07',
    bands: [
      { min: 0, max: 24_000, rate: 0.10 },
      { min: 24_000, max: 32_333, rate: 0.25 },
      { min: 32_333, max: 500_000, rate: 0.30 },
      { min: 500_000, max: 800_000, rate: 0.325 },
      { min: 800_000, max: null, rate: 0.35 },
    ],
    relief: 2_400,
    note: 'From Jul 2023 (Finance Act 2023)',
  },
];

/** SHIF and Housing Levy became deductible in computing taxable pay from Dec 2024 (TLAA 2024). */
export const STATUTORY_DEDUCTIBLE_FROM = '2024-12';

export type Month = string; // YYYY-MM

export function rulesFor(month: Month) {
  let found: (typeof PAYE_HISTORY)[number] | null = null;
  for (const r of PAYE_HISTORY) if (month >= r.from) found = r;
  return found;
}

export function bandTax(taxable: number, bands: PayeBand[]): number {
  let tax = 0;
  for (const b of bands) {
    if (taxable <= b.min) break;
    const top = b.max == null ? taxable : Math.min(taxable, b.max);
    tax += (top - b.min) * b.rate;
  }
  return tax;
}

export function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export interface ArrearsEntry {
  description: string;
  amount: number;
  from: Month;   // first month the arrears relate to
  to: Month;     // last month
}

export type TaxBasis = 'resident' | 'non_resident' | 'secondary';

export interface ArrearsOptions {
  /** Month the arrears are paid in (YYYY-MM). Arrears must relate to earlier months. */
  paymentMonth: Month;
  basis?: TaxBasis;
  secondaryRate?: number;   // default 0.35
  shaRate?: number;         // default 0.0275
  housingLevyRate?: number; // default 0.015
}

export interface ArrearsMonthResult {
  month: Month;
  share: number;          // arrears attributed to this month
  deductible: number;     // SHIF + Housing Levy on the share, deductible for months from Dec 2024
  base: number | null;    // taxable pay originally taxed that month
  taxBefore: number;
  taxAfter: number;
  extra: number;          // extra PAYE for this month
  deemed: boolean;        // older than 4 years → treated as income of the 5th year back
}

export interface ArrearsResult {
  months: ArrearsMonthResult[];
  totalArrears: number;
  extraPaye: number;
  /** Months whose original taxable pay is unknown — must be supplied before saving. */
  missing: Month[];
  errors: string[];
}

/**
 * Spread arrears entries over their months (applying the 4-year window) and
 * return the share per month.
 */
export function spreadArrears(entries: ArrearsEntry[], paymentMonth: Month): { shares: Map<Month, number>; deemed: Set<Month>; errors: string[] } {
  const shares = new Map<Month, number>();
  const deemed = new Set<Month>();
  const errors: string[] = [];
  const payYear = Number(paymentMonth.slice(0, 4));
  const oldestNormalYear = payYear - 4;
  const fifthYear = payYear - 5;
  const fifthYearMonths = monthsBetween(`${fifthYear}-01`, `${fifthYear}-12`);
  let deemedPool = 0;

  for (const e of entries) {
    if (!(e.amount > 0)) { errors.push(`"${e.description || 'Arrears'}": amount must be more than 0`); continue; }
    if (!/^\d{4}-\d{2}$/.test(e.from) || !/^\d{4}-\d{2}$/.test(e.to) || e.from > e.to) {
      errors.push(`"${e.description || 'Arrears'}": choose a valid from–to period`); continue;
    }
    if (e.to >= paymentMonth) {
      errors.push(`"${e.description || 'Arrears'}": arrears must relate to months before the payment month (${paymentMonth})`); continue;
    }
    const months = monthsBetween(e.from, e.to);
    const each = e.amount / months.length;
    for (const m of months) {
      if (Number(m.slice(0, 4)) < oldestNormalYear) deemedPool += each;
      else shares.set(m, (shares.get(m) ?? 0) + each);
    }
  }
  if (deemedPool > 0) {
    for (const m of fifthYearMonths) {
      shares.set(m, (shares.get(m) ?? 0) + deemedPool / 12);
      deemed.add(m);
    }
  }
  return { shares, deemed, errors };
}

/**
 * Extra PAYE due on arrears.
 * @param baseFor taxable pay originally taxed in a month, or null if unknown
 */
export function computeArrearsTax(
  entries: ArrearsEntry[],
  baseFor: (month: Month) => number | null,
  opts: ArrearsOptions,
): ArrearsResult {
  const basis = opts.basis ?? 'resident';
  const sha = opts.shaRate ?? 0.0275;
  const ahl = opts.housingLevyRate ?? 0.015;
  const { shares, deemed, errors } = spreadArrears(entries, opts.paymentMonth);

  const months: ArrearsMonthResult[] = [];
  const missing: Month[] = [];
  for (const month of [...shares.keys()].sort()) {
    const share = shares.get(month)!;
    const rules = rulesFor(month);
    if (!rules) { errors.push(`No PAYE rates on record for ${month}`); continue; }
    // SHIF and Housing Levy charged on the arrears are deductible for months under the Dec 2024 rules
    const deductible = basis !== 'secondary' && month >= STATUTORY_DEDUCTIBLE_FROM ? share * (sha + ahl) : 0;
    const base = baseFor(month);
    if (base == null) {
      missing.push(month);
      months.push({ month, share, deductible, base: null, taxBefore: 0, taxAfter: 0, extra: 0, deemed: deemed.has(month) });
      continue;
    }
    const tax = (t: number) => {
      if (basis === 'secondary') return Math.round(t * (opts.secondaryRate ?? 0.35));
      const relief = basis === 'resident' ? rules.relief : 0;
      return Math.max(0, Math.round(bandTax(t, rules.bands)) - relief);
    };
    const taxBefore = tax(base);
    const taxAfter = tax(base + share - deductible);
    months.push({ month, share, deductible, base, taxBefore, taxAfter, extra: taxAfter - taxBefore, deemed: deemed.has(month) });
  }

  const totalArrears = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const extraPaye = missing.length || errors.length ? 0 : months.reduce((s, m) => s + m.extra, 0);
  return { months, totalArrears, extraPaye, missing, errors };
}
