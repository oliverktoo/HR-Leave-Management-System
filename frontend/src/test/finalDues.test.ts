// Final dues: suggested amounts and tax on terminal payments.
// Expected values worked out by hand. Annual bands (×12 monthly, from Jul 2023):
//   10% to 288,000 · 25% to 387,996 · 30% to 6,000,000 · 32.5% to 9,600,000 · 35% above; relief 28,800/yr.
import { describe, expect, test } from 'vitest';
import {
  completedYears, compensationTax, lumpSumTax, splitGratuity, suggestLeavePay, suggestNoticePay,
  suggestSeverance, terminalTax, unexpiredMonths,
} from '../services/finalDues';

describe('suggested amounts', () => {
  test('completed years of service', () => {
    expect(completedYears('2018-03-15', '2026-11-30')).toBe(8);
    expect(completedYears('2018-12-01', '2026-11-30')).toBe(7);
    expect(completedYears('2026-01-01', '2026-11-30')).toBe(0);
  });

  test('redundancy severance: 15 days per completed year (basic ÷ 30 × 15)', () => {
    expect(suggestSeverance(100_000, 8)).toBe(400_000);
  });

  test('leave pay: monthly pay ÷ 22 working days × days', () => {
    expect(suggestLeavePay(110_000, 11)).toBe(55_000);
  });

  test('notice pay', () => {
    expect(suggestNoticePay(110_000, 1)).toBe(110_000);
  });

  test('unexpired term of a fixed-term contract', () => {
    expect(unexpiredMonths('2026-11-30', '2027-06-30')).toBe(7);
    expect(unexpiredMonths('2026-11-30', '2026-10-31')).toBe(0);
  });
});

describe('severance: KRA lump-sum method, year of payment', () => {
  test('all within the 30% band', () => {
    // year so far 897,500 (10 × 89,750): tax 177,850; with 400,000: 297,850 → 120,000
    expect(lumpSumTax(897_500, 400_000, '2026-11')).toBe(120_000);
  });

  test('low earner: part of the lump sum uses unused lower bands', () => {
    // year 200,000 → 20,000 − 28,800 = 0; with 100,000 → 300,000: 28,800 + 3,000 − 28,800 = 3,000
    expect(lumpSumTax(200_000, 100_000, '2026-11')).toBe(3_000);
  });

  test('secondary employment: 35% flat', () => {
    expect(lumpSumTax(897_500, 100_000, '2026-11', 'secondary')).toBe(35_000);
  });
});

describe('gratuity (Finance Act 2025: tax-free when earned from Jul 2025)', () => {
  test('split evenly by months of service', () => {
    expect(splitGratuity(240_000, '2024-07', '2026-06')).toEqual(
      { taxable: 120_000, exempt: 120_000, taxableFrom: '2024-07', taxableTo: '2025-06' });
  });

  test('service entirely after Jul 2025: all tax-free', () => {
    expect(splitGratuity(120_000, '2025-07', '2026-06')).toMatchObject({ taxable: 0, exempt: 120_000 });
  });

  test('taxable part is spread back to the months earned (no SHIF/Housing Levy deduction)', () => {
    // 120,000 over Jul 2024 – Jun 2025 = 10,000/month on a 89,750 base:
    // 19,308 → 22,308 = 3,000/month × 12
    const t = terminalTax({
      paymentMonth: '2026-11', yearTaxable: 897_500, severance: 0,
      gratuity: { amount: 240_000, from: '2024-07', to: '2026-06' },
      compensation: { amount: 0, months: 0 },
    }, () => 89_750);
    expect(t.gratuityTaxable).toBe(120_000);
    expect(t.gratuityExempt).toBe(120_000);
    expect(t.gratuityTax).toBe(36_000);
  });

  test('missing past pay blocks the result', () => {
    const t = terminalTax({
      paymentMonth: '2026-11', yearTaxable: 897_500, severance: 0,
      gratuity: { amount: 120_000, from: '2025-01', to: '2025-06' },
      compensation: { amount: 0, months: 0 },
    }, m => (m === '2025-01' ? null : 89_750));
    expect(t.missing).toEqual(['2025-01']);
    expect(t.total).toBe(0);
  });
});

describe('compensation for loss of office: spread forward', () => {
  test('no contractual provision: over 3 years', () => {
    // 360,000 / 36 = 10,000/month at 10% = 1,000 × 36
    expect(compensationTax(360_000, 36, '2026-11')).toBe(36_000);
  });

  test('fixed-term contract: over the unexpired term', () => {
    // 700,000 / 7 = 100,000/month: 4,483.25 + 67,667 × 30% = 24,783.35 × 7 = 173,483.45
    expect(compensationTax(700_000, 7, '2026-11')).toBe(173_483);
  });
});

describe('all terminal payments together', () => {
  test('total tax adds up', () => {
    const t = terminalTax({
      paymentMonth: '2026-11', yearTaxable: 897_500, severance: 400_000,
      gratuity: { amount: 240_000, from: '2024-07', to: '2026-06' },
      compensation: { amount: 360_000, months: 36 },
    }, () => 89_750);
    expect(t.total).toBe(120_000 + 36_000 + 36_000);
  });
});
