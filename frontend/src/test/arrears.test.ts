// Salary arrears: tax spread back to the months they relate to.
// Expected values worked out by hand from the PAYE bands in force each month.
import { describe, expect, test } from 'vitest';
import { bandTax, computeArrearsTax, monthsBetween, rulesFor, spreadArrears, type Month } from '../services/arrears';

const flat = (v: number) => (_m: Month) => v;

describe('rates on record', () => {
  test('Jan 2021 – Jun 2023: three bands', () => {
    expect(rulesFor('2022-05')!.bands).toHaveLength(3);
    expect(rulesFor('2023-06')!.bands).toHaveLength(3);
  });
  test('from Jul 2023: five bands', () => {
    expect(rulesFor('2023-07')!.bands).toHaveLength(5);
  });
  test('nothing before 2021', () => {
    expect(rulesFor('2020-12')).toBeNull();
  });
  test('band tax', () => {
    expect(bandTax(600_000, rulesFor('2023-06')!.bands)).toBeCloseTo(174_783.35, 2);
    expect(bandTax(600_000, rulesFor('2023-07')!.bands)).toBeCloseTo(177_283.35, 2);
  });
});

describe('spreading', () => {
  test('months between', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  test('evenly over the months it relates to', () => {
    const { shares } = spreadArrears([{ description: 'Increment', amount: 30_000, from: '2026-07', to: '2026-09' }], '2026-11');
    expect([...shares.entries()]).toEqual([['2026-07', 10_000], ['2026-08', 10_000], ['2026-09', 10_000]]);
  });

  test('older than 4 years: treated as income of the 5th year back', () => {
    // paid in 2026 → 2022–2025 spread normally; 2020 amounts go to 2021
    const { shares, deemed } = spreadArrears([{ description: 'Old', amount: 24_000, from: '2020-01', to: '2020-12' }], '2026-11');
    expect([...shares.keys()]).toEqual(monthsBetween('2021-01', '2021-12'));
    expect(shares.get('2021-06')).toBe(2_000);
    expect(deemed.size).toBe(12);
  });

  test('rejects arrears for the payment month or later', () => {
    const { errors } = spreadArrears([{ description: 'X', amount: 1_000, from: '2026-10', to: '2026-11' }], '2026-11');
    expect(errors[0]).toMatch(/before the payment month/);
  });
});

describe('extra PAYE', () => {
  test('within one band, Dec-2024 rules: SHIF and Housing Levy on the arrears are deductible', () => {
    // KES 100,000 earner (taxable 89,750); 30,000 arrears for Jul–Sep 2026 paid in Nov
    // per month: 10,000 − 4.25% = 9,575 more taxable at 30% → 2,872.50
    //   tax(89,750) = 21,708 − 2,400 = 19,308; tax(99,325) = 24,581 − 2,400 = 22,181 → 2,873
    const r = computeArrearsTax([{ description: 'Increment', amount: 30_000, from: '2026-07', to: '2026-09' }],
      flat(89_750), { paymentMonth: '2026-11' });
    expect(r.months.map(m => m.extra)).toEqual([2_873, 2_873, 2_873]);
    expect(r.extraPaye).toBe(8_619);
  });

  test('2022 arrears use the 2021–2023 bands and no SHIF/Housing Levy deduction', () => {
    // base 20,000 taxable/month; 120,000 for 2022 → 10,000/month
    // before: 2,000 − 2,400 → 0; after: 30,000 → 2,400 + 6,000×25% = 3,900 − 2,400 = 1,500
    const r = computeArrearsTax([{ description: 'Back pay', amount: 120_000, from: '2022-01', to: '2022-12' }],
      flat(20_000), { paymentMonth: '2026-11' });
    expect(r.months.every(m => m.deductible === 0)).toBe(true);
    expect(r.months.every(m => m.extra === 1_500)).toBe(true);
    expect(r.extraPaye).toBe(18_000);
  });

  test('the rate change in July 2023 is respected month by month', () => {
    // base 600,000: June 2023 marginal 30%, July 2023 marginal 32.5%
    const r = computeArrearsTax([{ description: 'X', amount: 20_000, from: '2023-06', to: '2023-07' }],
      flat(600_000), { paymentMonth: '2026-11' });
    expect(r.months.map(m => [m.month, m.extra])).toEqual([['2023-06', 3_000], ['2023-07', 3_250]]);
  });

  test('crossing into a higher band', () => {
    // base 30,000 (25% band to 32,333); +10,000 (Jul 2026, less 4.25% = 9,575)
    // before: 2,400 + 6,000×25% = 3,900 → 1,500
    // after 39,575: 2,400 + 2,083.25 + 7,242×30% = 6,655.85 → 6,656 − 2,400 = 4,256 → extra 2,756
    const r = computeArrearsTax([{ description: 'X', amount: 10_000, from: '2026-07', to: '2026-07' }],
      flat(30_000), { paymentMonth: '2026-11' });
    expect(r.extraPaye).toBe(2_756);
  });

  test('non-resident: no relief', () => {
    // base 20,000: before 2,000; after 29,575 (Jul 2026): 2,400 + 5,575×25% = 3,793.75 → 3,794 → extra 1,794
    const r = computeArrearsTax([{ description: 'X', amount: 10_000, from: '2026-07', to: '2026-07' }],
      flat(20_000), { paymentMonth: '2026-11', basis: 'non_resident' });
    expect(r.extraPaye).toBe(1_794);
  });

  test('secondary employment: flat 35% on the share, no deductions', () => {
    const r = computeArrearsTax([{ description: 'X', amount: 10_000, from: '2026-07', to: '2026-07' }],
      flat(50_000), { paymentMonth: '2026-11', basis: 'secondary' });
    expect(r.extraPaye).toBe(3_500);
  });

  test('unknown original pay for a month blocks the result', () => {
    const r = computeArrearsTax([{ description: 'X', amount: 20_000, from: '2026-06', to: '2026-07' }],
      m => (m === '2026-07' ? 89_750 : null), { paymentMonth: '2026-11' });
    expect(r.missing).toEqual(['2026-06']);
    expect(r.extraPaye).toBe(0);
  });

  test('several entries add up per month', () => {
    const r = computeArrearsTax([
      { description: 'Increment', amount: 10_000, from: '2026-07', to: '2026-07' },
      { description: 'Acting', amount: 10_000, from: '2026-07', to: '2026-07' },
    ], flat(89_750), { paymentMonth: '2026-11' });
    expect(r.months).toHaveLength(1);
    expect(r.months[0].share).toBe(20_000);
    expect(r.totalArrears).toBe(20_000);
  });
});
