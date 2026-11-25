// 084_payroll_attendance.sql: attendance on payroll, holidays, mid-month joiners.
// Month under test: March 2026 (1 Mar is a Sunday). Weekdays: 2–6, 9–13, 16–20,
// 23–27, 30–31 = 22. A public holiday on Friday 20 Mar → 21 working days.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { vi } from 'vitest';
import { addBalance, addLeaveType, addUser, asUser, createLeaveDb } from './leaveDb';
import { ATTENDANCE_LINE_COLUMNS } from '../../services/payrollService';

vi.mock('../../lib/supabaseClient', () => ({ supabase: {} }));

let db: PGlite;
let hr: string, finance: string, emp: string;
let regular: string, joiner: string, untracked: string, rota: string, unpaidLeaver: string;

const WEEKDAYS = [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30, 31];
const WORKING = WEEKDAYS.filter(d => d !== 20);
const mar = (d: number) => `2026-03-${String(d).padStart(2, '0')}`;

async function clockIn(userId: string, day: number, hours = 8) {
  await db.query(
    `INSERT INTO attendance_records (user_id, employee_id, employee_name, check_in_time, check_out_time, date, status, work_hours)
     VALUES ($1, 'X', 'X', $2::date + time '08:00', $2::date + time '16:00', $2::date, 'present', $3)`,
    [userId, mar(day), hours]);
}
async function approvedLeave(userId: string, typeId: string, from: number, to: number) {
  await db.query(
    `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1, $2, $3, $4, 1, 'test', 'approved')`, [userId, typeId, mar(from), mar(to)]);
}
type Att = { user_id: string; tracked: boolean; pre_hire_days: string; scheduled_days: string; present_days: string;
  hours_clocked: string; expected_hours: string; unexplained_days: string; unexplained_dates: string[] };
const attendance = async (uid = hr) => (await asUser(db, uid, (tx) =>
  tx.query<Att>(`SELECT * FROM get_payroll_attendance(2026, 3)`))).rows;
const forUser = async (userId: string) => {
  const r = (await attendance()).find(a => a.user_id === userId)!;
  return {
    tracked: r.tracked, preHire: Number(r.pre_hire_days), scheduled: Number(r.scheduled_days),
    present: Number(r.present_days), hours: Number(r.hours_clocked), expected: Number(r.expected_hours),
    unexplained: Number(r.unexplained_days), dates: (r.unexplained_dates ?? []).map(d => new Date(d).toISOString().slice(0, 10)),
  };
};

beforeAll(async () => {
  db = await createLeaveDb(['021_ooo_requests.sql', '030_payroll_foundation.sql', '031_payroll_approval_roles.sql',
    '032_payroll_leave_integration.sql', '057_payroll_sop_compliance.sql', '058_payroll_gap_fixes.sql',
    '077_payroll_special_cases.sql', '078_salary_arrears.sql', '041_exit_management.sql', '079_final_dues.sql',
    '081_payroll_lines_deduction_columns.sql',
    'setup_attendance_system.sql', '022_field_assignments.sql', '037_attendance_rota.sql',
    '084_payroll_attendance.sql']);
  hr = await addUser(db, 'hr_admin');
  finance = await addUser(db, 'finance');
  emp = await addUser(db, 'employee');
  regular = await addUser(db, 'employee');
  joiner = await addUser(db, 'employee');
  untracked = await addUser(db, 'employee');
  rota = await addUser(db, 'employee');
  unpaidLeaver = await addUser(db, 'employee');

  await db.query(`INSERT INTO public_holidays (date, name) VALUES ('2026-03-20', 'Test holiday')`);
  const annual = await addLeaveType(db, 'Annual');
  const unpaid = await addLeaveType(db, 'Unpaid');
  await db.query(`UPDATE leave_types SET is_paid = false WHERE id = $1`, [unpaid]);
  for (const u of [regular, unpaidLeaver]) {
    await addBalance(db, u, annual, 2026);
    await addBalance(db, u, unpaid, 2026);
  }

  // Regular: clocks in every working day except 10 (annual leave), 11 and 12 (nothing)
  for (const d of WORKING.filter(d => ![10, 11, 12].includes(d))) await clockIn(regular, d);
  await approvedLeave(regular, annual, 10, 10);

  // Joiner: starts Monday 16 Mar, present every working day after
  await db.query(`UPDATE users_profile SET hire_date = '2026-03-16' WHERE id = $1`, [joiner]);
  for (const d of WORKING.filter(d => d >= 16)) await clockIn(joiner, d);

  // Untracked: never clocks in
  await db.query(`UPDATE users_profile SET attendance_tracked = false WHERE id = $1`, [untracked]);

  // Rota: day off on Mon 2 Mar; one field clock-in on 3 Mar (09:00 Nairobi), 7.5 h
  await db.query(`INSERT INTO staff_rota (user_id, rota_date, is_day_off) VALUES ($1, '2026-03-02', true)`, [rota]);
  const { rows: fa } = await db.query<{ id: string }>(
    `INSERT INTO field_assignments (title, location_name, planned_start, planned_end, created_by, supervisor_id)
     VALUES ('Match', 'Stadium', '2026-03-03', '2026-03-04', $1, $1) RETURNING id`, [hr]);
  await db.query(
    `INSERT INTO field_clock_logs (assignment_id, user_id, clock_in_time, clock_out_time, work_hours)
     VALUES ($1, $2, '2026-03-03T06:00:00Z', '2026-03-03T13:30:00Z', 7.5)`, [fa[0].id, rota]);

  // Unpaid leave over Thu 19 – Fri 20 (the holiday): only 1 unpaid day
  await approvedLeave(unpaidLeaver, unpaid, 19, 20);
}, 120_000);

describe('working days and unpaid days', () => {
  test('public holidays are not working days', async () => {
    const { rows } = await db.query<{ n: number }>(`SELECT count_working_days_in_month(2026, 3) n`);
    expect(rows[0].n).toBe(21);
  });

  test('unpaid leave does not count the holiday', async () => {
    const { rows } = await asUser(db, hr, (tx) => tx.query<{ user_id: string; unpaid_days: string }>(
      `SELECT user_id, unpaid_days FROM get_payroll_absence_days(2026, 3)`));
    expect(Number(rows.find(r => r.user_id === unpaidLeaver)!.unpaid_days)).toBe(1);
  });

  test('staff cannot list colleagues\' unpaid days', async () => {
    const { rows } = await asUser(db, emp, (tx) => tx.query(`SELECT * FROM get_payroll_absence_days(2026, 3)`));
    expect(rows).toEqual([]);
  });
});

describe('get_payroll_attendance', () => {
  test('regular employee: present, hours, and the two unexplained days', async () => {
    expect(await forUser(regular)).toEqual({
      tracked: true, preHire: 0, scheduled: 21, present: 18, hours: 144, expected: 168,
      unexplained: 2, dates: ['2026-03-11', '2026-03-12'],
    });
  });

  test('joiner: days before the start date are unpaid, not flagged as absences', async () => {
    expect(await forUser(joiner)).toMatchObject({ preHire: 10, scheduled: 11, present: 11, unexplained: 0 });
  });

  test('staff who do not clock in are never flagged', async () => {
    expect(await forUser(untracked)).toMatchObject({ tracked: false, present: 0, unexplained: 0 });
  });

  test('rota day off and field clock-ins are respected', async () => {
    const r = await forUser(rota);
    expect(r).toMatchObject({ scheduled: 20, present: 1, hours: 7.5, expected: 160, unexplained: 19 });
    expect(r.dates).not.toContain('2026-03-02');
    expect(r.dates).not.toContain('2026-03-03');
    expect(r.dates).not.toContain('2026-03-20');
  });

  test('finance can read it; employees cannot', async () => {
    expect((await attendance(finance)).length).toBeGreaterThan(0);
    await expect(attendance(emp)).rejects.toThrow(/Only HR admin, super admin or finance/);
  });

  test('employees cannot switch off their own attendance tracking', async () => {
    await expect(asUser(db, emp, (tx) =>
      tx.query(`UPDATE users_profile SET attendance_tracked = false WHERE id = $1`, [emp])))
      .rejects.toThrow(/attendance_tracked/);
  });
});

describe('set_attendance_unpaid_days', () => {
  let run: string, line: string;
  beforeAll(async () => {
    run = (await db.query<{ id: string }>(
      `INSERT INTO payroll_runs (pay_period_year, pay_period_month, status) VALUES (2026, 3, 'draft') RETURNING id`)).rows[0].id;
    line = (await db.query<{ id: string }>(
      `INSERT INTO payroll_lines (run_id, user_id, gross_pay, net_pay, days_worked, att_unexplained_days)
       VALUES ($1, $2, 50000, 40000, 21, 2) RETURNING id`, [run, regular])).rows[0].id;
  });
  const setDays = (uid: string, days: number, reason: string) => asUser(db, uid, (tx) =>
    tx.query(`SELECT set_attendance_unpaid_days($1, $2, $3)`, [line, days, reason]));
  const lineNow = async () => (await db.query<{ d: string; u: string; r: string | null }>(
    `SELECT days_worked d, att_unpaid_days u, att_unpaid_reason r FROM payroll_lines WHERE id = $1`, [line])).rows[0];

  test('only HR, never more than the unexplained days, and a reason is needed', async () => {
    await expect(setDays(finance, 1, 'x')).rejects.toThrow(/Only HR admin/);
    await expect(setDays(hr, 3, 'x')).rejects.toThrow(/between 0 and the 2/);
    await expect(setDays(hr, 1, ' ')).rejects.toThrow(/reason/);
    await expect(setDays(hr, 1.5, 'half day')).rejects.toThrow(/whole days/);
  });

  test('marking days unpaid lowers days worked; undoing restores it; both audited', async () => {
    await setDays(hr, 2, 'No show, no leave applied');
    const after = await lineNow();
    expect([Number(after.d), Number(after.u), after.r]).toEqual([19, 2, 'No show, no leave applied']);
    await setDays(hr, 0, '');
    expect(Number((await lineNow()).d)).toBe(21);
    expect((await lineNow()).r).toBeNull();
    const { rows } = await db.query(`SELECT 1 FROM payroll_audit_log WHERE action = 'attendance_unpaid_days'`);
    expect(rows).toHaveLength(2);
  });

  test('approved runs cannot be changed', async () => {
    await db.query(`UPDATE payroll_runs SET status = 'approved' WHERE id = $1`, [run]);
    await expect(setDays(hr, 1, 'late')).rejects.toThrow(/only be changed while the run is a draft/);
  });
});

describe('payroll_lines schema', () => {
  test('every attendance column the app writes exists', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'payroll_lines'`);
    const have = new Set(rows.map(r => r.column_name));
    expect(ATTENDANCE_LINE_COLUMNS.filter(c => !have.has(c))).toEqual([]);
  });
});
