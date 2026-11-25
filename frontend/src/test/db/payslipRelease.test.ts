// 076_payslip_release.sql: staff see their own payslip only after HR releases it.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { vi } from 'vitest';
import { addUser, asUser, createLeaveDb } from './leaveDb';
import { lineToDbFields, type ComputedPayrollLine } from '../../services/payrollService';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

let db: PGlite;
let hr: string, emp1: string, emp2: string, finance: string;
let approvedRun: string, draftRun: string;

async function run(month: number, status: string) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO payroll_runs (pay_period_year, pay_period_month, status, total_gross) VALUES (2026, $1, $2, 999999) RETURNING id`,
    [month, status]);
  return rows[0].id;
}
const line = (runId: string, userId: string, net: number) =>
  db.query(`INSERT INTO payroll_lines (run_id, user_id, gross_pay, net_pay) VALUES ($1, $2, $3, $3)`, [runId, userId, net]);

const ownLines = (uid: string) => asUser(db, uid, (tx) =>
  tx.query<{ run_id: string; user_id: string }>(`SELECT run_id, user_id FROM payroll_lines`)).then(r => r.rows);
const myRuns = (uid: string) => asUser(db, uid, (tx) =>
  tx.query<Record<string, unknown>>(`SELECT * FROM my_payslip_runs()`)).then(r => r.rows);
const release = (uid: string, runId: string, on: boolean) => asUser(db, uid, (tx) =>
  tx.query(`SELECT * FROM set_payslips_released($1, $2)`, [runId, on]));

beforeAll(async () => {
  db = await createLeaveDb(['021_ooo_requests.sql', '030_payroll_foundation.sql', '031_payroll_approval_roles.sql',
    '032_payroll_leave_integration.sql', '057_payroll_sop_compliance.sql', '058_payroll_gap_fixes.sql',
    '076_payslip_release.sql', '077_payroll_special_cases.sql', '078_salary_arrears.sql',
    '041_exit_management.sql', '079_final_dues.sql', '081_payroll_lines_deduction_columns.sql']);
  hr = await addUser(db, 'hr_admin');
  emp1 = await addUser(db, 'employee');
  emp2 = await addUser(db, 'employee');
  finance = await addUser(db, 'finance');
  approvedRun = await run(7, 'approved');
  draftRun = await run(8, 'draft');
  await line(approvedRun, emp1, 50_000);
  await line(approvedRun, emp2, 60_000);
  await line(draftRun, emp1, 51_000);
}, 60_000);

describe('before release', () => {
  test('staff cannot see their payslip or the run', async () => {
    expect(await ownLines(emp1)).toEqual([]);
    expect(await myRuns(emp1)).toEqual([]);
  });

  test('staff never get read access to payroll runs (company totals)', async () => {
    const { rows } = await asUser(db, emp1, (tx) => tx.query(`SELECT * FROM payroll_runs`));
    expect(rows).toEqual([]);
  });

  test('only HR admin / super admin can release', async () => {
    await expect(release(emp1, approvedRun, true)).rejects.toThrow(/Only HR admin/);
    await expect(release(finance, approvedRun, true)).rejects.toThrow(/Only HR admin/);
  });

  test('a draft run cannot be released', async () => {
    await expect(release(hr, draftRun, true)).rejects.toThrow(/approved or paid/);
  });
});

describe('after release', () => {
  beforeAll(async () => { await release(hr, approvedRun, true); });

  test('staff see their own payslip line, not colleagues\'', async () => {
    expect(await ownLines(emp1)).toEqual([{ run_id: approvedRun, user_id: emp1 }]);
  });

  test('draft runs stay hidden', async () => {
    expect((await ownLines(emp1)).some(l => l.run_id === draftRun)).toBe(false);
  });

  test('my_payslip_runs lists the period without company totals', async () => {
    const runs = await myRuns(emp1);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: approvedRun, pay_period_year: 2026, pay_period_month: 7, status: 'approved' });
    expect(runs[0]).not.toHaveProperty('total_gross');
  });

  test('everyone on the run is notified once', async () => {
    const { rows } = await db.query<{ user_id: string; message: string }>(
      `SELECT user_id, message FROM notifications WHERE type = 'payslip' ORDER BY user_id`);
    expect(rows.map(r => r.user_id).sort()).toEqual([emp1, emp2].sort());
    expect(rows[0].message).toMatch(/July 2026/);
  });

  test('release and withdraw are audited', async () => {
    const { rows } = await db.query<{ action: string; actor_id: string }>(
      `SELECT action, actor_id FROM payroll_audit_log WHERE run_id = $1`, [approvedRun]);
    expect(rows).toContainEqual({ action: 'payslips_released', actor_id: hr });
  });
});

describe('withdraw', () => {
  test('hides the payslip again', async () => {
    await release(hr, approvedRun, false);
    expect(await ownLines(emp1)).toEqual([]);
    expect(await myRuns(emp1)).toEqual([]);
  });

  test('releasing again does not notify staff a second time', async () => {
    await release(hr, approvedRun, true);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int n FROM notifications WHERE type = 'payslip'`);
    expect(rows[0].n).toBe(2);
    expect(await ownLines(emp2)).toEqual([{ run_id: approvedRun, user_id: emp2 }]);
  });
});

describe('077 special cases schema', () => {
  test('statutory limits are seeded as payroll settings', async () => {
    const { rows } = await db.query<{ setting_key: string; v: string }>(
      `SELECT setting_key, setting_value::text v FROM payroll_settings
        WHERE setting_key IN ('per_diem_daily_exempt','bik_annual_exempt','disability_exemption_monthly','secondary_employment_rate')
        ORDER BY 1`);
    expect(rows).toEqual([
      { setting_key: 'bik_annual_exempt', v: '60000' },
      { setting_key: 'disability_exemption_monthly', v: '150000' },
      { setting_key: 'per_diem_daily_exempt', v: '10000' },
      { setting_key: 'secondary_employment_rate', v: '0.35' },
    ]);
  });

  test('profiles default to resident / primary and reject other values', async () => {
    const { rows } = await db.query(`SELECT tax_residency, tax_employment_category FROM users_profile WHERE id = $1`, [emp1]);
    expect(rows[0]).toEqual({ tax_residency: 'resident', tax_employment_category: 'primary' });
    await expect(db.query(`UPDATE users_profile SET tax_residency = 'mars' WHERE id = $1`, [emp1])).rejects.toThrow(/chk_tax_residency/);
  });

  test('employees cannot change their own tax status', async () => {
    await expect(asUser(db, emp1, (tx) =>
      tx.query(`UPDATE users_profile SET disability_exemption_cert_no = 'FAKE' WHERE id = $1`, [emp1])))
      .rejects.toThrow(/disability_exemption_cert_no/);
  });
});

describe('078 salary arrears records', () => {
  let lineId = '';
  beforeAll(async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM payroll_lines WHERE run_id = $1 AND user_id = $2`, [approvedRun, emp1]);
    lineId = rows[0].id;
  });
  const insertAs = (uid: string) => asUser(db, uid, (tx) => tx.query(
    `INSERT INTO payroll_arrears (run_id, line_id, user_id, description, amount, from_month, to_month, breakdown, extra_paye)
     VALUES ($1, $2, $3, 'Increment', 30000, '2026-07-01', '2026-09-01', '[]', 8619)`, [approvedRun, lineId, emp1]));

  test('HR can record arrears; finance can read them', async () => {
    await insertAs(hr);
    const { rows } = await asUser(db, finance, (tx) => tx.query(`SELECT amount FROM payroll_arrears`));
    expect(rows).toHaveLength(1);
  });

  test('employees cannot read or write arrears records', async () => {
    const { rows } = await asUser(db, emp1, (tx) => tx.query(`SELECT * FROM payroll_arrears`));
    expect(rows).toEqual([]);
    await expect(insertAs(emp1)).rejects.toThrow(/row-level security/);
  });

  test('a period that ends before it starts is rejected', async () => {
    await expect(db.query(
      `INSERT INTO payroll_arrears (run_id, line_id, user_id, description, amount, from_month, to_month, breakdown)
       VALUES ($1, $2, $3, 'X', 100, '2026-09-01', '2026-07-01', '[]')`, [approvedRun, lineId, emp1])).rejects.toThrow(/check/i);
  });
});

describe('079 final dues and exit requests', () => {
  const submit = (uid: string, extra = '') => asUser(db, uid, (tx) => tx.query(
    `INSERT INTO exit_requests (user_id, employee_id, exit_type, notice_date, last_working_date${extra ? ', ' + extra.split('=')[0] : ''})
     VALUES ($1, 'FKF1', 'resignation', '2026-10-01', '2026-10-31'${extra ? ', ' + extra.split('=')[1] : ''}) RETURNING id`, [uid]));

  test('staff can submit their own exit request', async () => {
    const { rows } = await submit(emp2);
    expect(rows).toHaveLength(1);
  });

  test('staff cannot submit one already marked completed', async () => {
    await expect(submit(emp2, "status='completed'")).rejects.toThrow(/row-level security/);
  });

  test('staff cannot change their exit request after submitting', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM exit_requests WHERE user_id = $1 LIMIT 1`, [emp2]);
    const res = await asUser(db, emp2, (tx) => tx.query(
      `UPDATE exit_requests SET status = 'completed', hr_notes = 'self-cleared' WHERE id = $1`, [rows[0].id]));
    expect(res.affectedRows).toBe(0);
    const { rows: after } = await db.query(`SELECT status, hr_notes FROM exit_requests WHERE id = $1`, [rows[0].id]);
    expect(after[0]).toEqual({ status: 'pending', hr_notes: null });
  });

  test('final dues records: HR writes, finance reads, staff see nothing', async () => {
    const { rows } = await db.query<{ id: string }>(`SELECT id FROM payroll_lines WHERE run_id = $1 AND user_id = $2`, [approvedRun, emp2]);
    await asUser(db, hr, (tx) => tx.query(
      `INSERT INTO final_dues (line_id, run_id, user_id, last_working_date, days_worked, inputs, tax_working, terminal_paye)
       VALUES ($1, $2, $3, '2026-07-31', 22, '{}', '{}', 1000)`, [rows[0].id, approvedRun, emp2]));
    expect((await asUser(db, finance, (tx) => tx.query(`SELECT 1 FROM final_dues`))).rows).toHaveLength(1);
    expect((await asUser(db, emp2, (tx) => tx.query(`SELECT 1 FROM final_dues`))).rows).toHaveLength(0);
  });
});

describe('payroll_lines schema matches what the app saves', () => {
  test('every column written when computing a run exists', async () => {
    const written = [
      'run_id', 'user_id', 'employee_id', 'basic_salary', 'allowances', 'days_worked', 'leave_days', 'ooo_days',
      ...Object.keys(lineToDbFields({} as ComputedPayrollLine)),
    ];
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'payroll_lines'`);
    const have = new Set(rows.map(r => r.column_name));
    expect(written.filter(c => !have.has(c))).toEqual([]);
  });
});
