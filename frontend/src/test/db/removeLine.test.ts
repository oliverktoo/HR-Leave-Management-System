// 082_remove_employee_from_run.sql: HR removes an employee from a draft run.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createLeaveDb } from './leaveDb';

let db: PGlite;
let hr: string, emp1: string, emp2: string, emp3: string, finance: string;
let draftRun: string, approvedRun: string;

const run = async (month: number, status: string) => (await db.query<{ id: string }>(
  `INSERT INTO payroll_runs (pay_period_year, pay_period_month, status) VALUES (2026, $1, $2) RETURNING id`,
  [month, status])).rows[0].id;
const line = async (runId: string, userId: string) => (await db.query<{ id: string }>(
  `INSERT INTO payroll_lines (run_id, user_id, gross_pay, net_pay) VALUES ($1, $2, 50000, 40000) RETURNING id`,
  [runId, userId])).rows[0].id;
const lineOf = async (runId: string, userId: string) => (await db.query<{ id: string }>(
  `SELECT id FROM payroll_lines WHERE run_id = $1 AND user_id = $2`, [runId, userId])).rows[0]?.id;
const remove = (uid: string, lineId: string, reason: string, takeOff = false) => asUser(db, uid, (tx) =>
  tx.query(`SELECT remove_payroll_line($1, $2, $3)`, [lineId, reason, takeOff]));
const restore = (uid: string, runId: string, userId: string) => asUser(db, uid, (tx) =>
  tx.query(`SELECT restore_payroll_employee($1, $2)`, [runId, userId]));
const payrollActive = async (userId: string) => (await db.query<{ a: boolean }>(
  `SELECT payroll_active a FROM users_profile WHERE id = $1`, [userId])).rows[0].a;

beforeAll(async () => {
  db = await createLeaveDb(['021_ooo_requests.sql', '030_payroll_foundation.sql', '031_payroll_approval_roles.sql',
    '032_payroll_leave_integration.sql', '057_payroll_sop_compliance.sql', '058_payroll_gap_fixes.sql',
    '076_payslip_release.sql', '077_payroll_special_cases.sql', '078_salary_arrears.sql',
    '041_exit_management.sql', '079_final_dues.sql', '081_payroll_lines_deduction_columns.sql',
    '082_remove_employee_from_run.sql']);
  hr = await addUser(db, 'hr_admin');
  emp1 = await addUser(db, 'employee');
  emp2 = await addUser(db, 'employee');
  emp3 = await addUser(db, 'employee');
  finance = await addUser(db, 'finance');
  draftRun = await run(11, 'draft');
  approvedRun = await run(10, 'approved');
  for (const u of [emp1, emp2, emp3]) await line(draftRun, u);
  await line(approvedRun, emp1);
}, 60_000);

describe('who can remove', () => {
  test('employees and finance are refused', async () => {
    const l = await lineOf(draftRun, emp1);
    await expect(remove(emp1, l, 'mine')).rejects.toThrow(/Only HR admin/);
    await expect(remove(finance, l, 'x')).rejects.toThrow(/Only HR admin/);
    expect(await lineOf(draftRun, emp1)).toBe(l);
  });

  test('a reason is required', async () => {
    await expect(remove(hr, await lineOf(draftRun, emp1), '  ')).rejects.toThrow(/reason/);
  });

  test('approved runs cannot be changed', async () => {
    await expect(remove(hr, await lineOf(approvedRun, emp1), 'late')).rejects.toThrow(/only be removed while the run is a draft/);
  });

  test('nobody writes exclusions directly', async () => {
    await expect(asUser(db, hr, (tx) => tx.query(
      `INSERT INTO payroll_run_exclusions (run_id, user_id, reason) VALUES ($1, $2, 'x')`, [draftRun, emp3])))
      .rejects.toThrow(/permission denied/);
  });
});

describe('skip this month', () => {
  beforeAll(async () => {
    const l = await lineOf(draftRun, emp1);
    await db.query(
      `INSERT INTO payroll_arrears (run_id, line_id, user_id, description, amount, from_month, to_month, breakdown)
       VALUES ($1, $2, $3, 'Increment', 1000, '2026-07-01', '2026-08-01', '[]')`, [draftRun, l, emp1]);
    await remove(hr, l, 'Unpaid leave all month');
  });

  test('the line and its arrears are gone; the others stay', async () => {
    expect(await lineOf(draftRun, emp1)).toBeUndefined();
    expect(await lineOf(draftRun, emp2)).toBeDefined();
    const { rows } = await db.query(`SELECT 1 FROM payroll_arrears WHERE user_id = $1`, [emp1]);
    expect(rows).toHaveLength(0);
  });

  test('the employee stays on payroll', async () => {
    expect(await payrollActive(emp1)).toBe(true);
  });

  test('the exclusion is recorded and audited with the removed figures', async () => {
    const { rows } = await db.query<{ reason: string; excluded_by: string }>(
      `SELECT reason, excluded_by FROM payroll_run_exclusions WHERE run_id = $1 AND user_id = $2`, [draftRun, emp1]);
    expect(rows).toEqual([{ reason: 'Unpaid leave all month', excluded_by: hr }]);
    const { rows: audit } = await db.query<{ actor_id: string; net: string; notes: string }>(
      `SELECT actor_id, old_values->>'net_pay' net, notes FROM payroll_audit_log WHERE action = 'line_removed'`);
    expect(audit).toEqual([{ actor_id: hr, net: '40000.00', notes: 'Unpaid leave all month' }]);
  });

  test('finance can see exclusions; employees cannot', async () => {
    expect((await asUser(db, finance, (tx) => tx.query(`SELECT 1 FROM payroll_run_exclusions`))).rows).toHaveLength(1);
    expect((await asUser(db, emp1, (tx) => tx.query(`SELECT 1 FROM payroll_run_exclusions`))).rows).toHaveLength(0);
  });

  test('only HR can add them back; that clears the exclusion', async () => {
    await expect(restore(emp1, draftRun, emp1)).rejects.toThrow(/Only HR admin/);
    await restore(hr, draftRun, emp1);
    const { rows } = await db.query(`SELECT 1 FROM payroll_run_exclusions WHERE user_id = $1`, [emp1]);
    expect(rows).toHaveLength(0);
    const { rows: audit } = await db.query(`SELECT 1 FROM payroll_audit_log WHERE action = 'line_restored'`);
    expect(audit).toHaveLength(1);
  });
});

describe('take off payroll', () => {
  test('also switches payroll off for the employee', async () => {
    await remove(hr, await lineOf(draftRun, emp2), 'Left on 31 Oct', true);
    expect(await lineOf(draftRun, emp2)).toBeUndefined();
    expect(await payrollActive(emp2)).toBe(false);
    expect(await payrollActive(emp3)).toBe(true);
  });
});
