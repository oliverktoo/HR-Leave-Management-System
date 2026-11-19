// Leave-balance and recall tests against the REAL SQL from supabase/ (via PGlite).
// 2027-03-01 is a Monday. Mon 1 – Fri 5 Mar = 5 working days; Mon 1 – Fri 12 = 10.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addBalance, addLeaveType, addUser, asUser, createLeaveDb, getBalance } from './leaveDb';

const YEAR = 2027;
let db: PGlite;
let leaveType: string;
let hr: string;
let hod: string;
let dept: string;

beforeAll(async () => {
  db = await createLeaveDb();
  leaveType = await addLeaveType(db);
  const { rows } = await db.query<{ id: string }>(`INSERT INTO departments (name) VALUES ('Ops') RETURNING id`);
  dept = rows[0].id;
  hr = await addUser(db, 'hr_admin');
  hod = await addUser(db, 'hod', dept);
  await db.query(`UPDATE departments SET head_of_department_id = $1 WHERE id = $2`, [hod, dept]);
}, 60_000);

async function newEmployee() {
  const id = await addUser(db, 'employee', dept);
  await addBalance(db, id, leaveType, YEAR);
  return id;
}

/** Inserts a request directly (bypasses RLS) with the given total_days. */
async function request(userId: string, start: string, end: string, totalDays: number, status = 'pending') {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, total_days, reason, status)
     VALUES ($1, $2, $3, $4, $5, 'test', 'pending') RETURNING id`,
    [userId, leaveType, start, end, totalDays]);
  const id = rows[0].id;
  if (status !== 'pending') await setStatus(id, status);
  return id;
}
const setStatus = (id: string, status: string) =>
  db.query(`UPDATE leave_requests SET status = $1 WHERE id = $2`, [status, id]);

const workingDays = async (a: string, b: string) =>
  Number((await db.query<{ d: string }>(`SELECT calculate_working_days($1, $2) AS d`, [a, b])).rows[0].d);

describe('calculate_working_days', () => {
  test('counts Mon–Fri only', async () => {
    expect(await workingDays('2027-03-01', '2027-03-05')).toBe(5);
    expect(await workingDays('2027-03-01', '2027-03-07')).toBe(5); // through Sunday
    expect(await workingDays('2027-03-01', '2027-03-12')).toBe(10);
  });
  test('a weekend alone is zero days', async () => {
    expect(await workingDays('2027-03-06', '2027-03-07')).toBe(0);
  });
  test('a single weekday is one day', async () => {
    expect(await workingDays('2027-03-03', '2027-03-03')).toBe(1);
  });
  test('excludes public holidays', async () => {
    await db.query(`INSERT INTO public_holidays (date, name) VALUES ('2027-03-03', 'Test Holiday')`);
    expect(await workingDays('2027-03-01', '2027-03-05')).toBe(4);
    await db.query(`DELETE FROM public_holidays WHERE date = '2027-03-03'`);
  });
});

describe('leave balance lifecycle', () => {
  test('submit → pending, HOD approve → still pending, HR approve → used', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 5 });

    await setStatus(id, 'hod_approved');
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 5 });

    await setStatus(id, 'approved');
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 5, pending: 0 });
  });

  test('direct approval from pending also moves days to used', async () => {
    const emp = await newEmployee();
    await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 5, pending: 0 });
  });

  test.each(['rejected', 'cancelled'])('%s from pending releases the pending days', async (status) => {
    const emp = await newEmployee();
    await request(emp, '2027-03-01', '2027-03-05', 5, status);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 0 });
  });

  test('rejected after HOD approval releases the pending days', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'hod_approved');
    await setStatus(id, 'rejected');
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 0 });
  });

  test('a non-status update does not touch the balance', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await db.query(`UPDATE leave_requests SET reason = 'edited' WHERE id = $1`, [id]);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 5 });
  });
});

describe('recall_leave_request', () => {
  const recall = (actor: string | null, id: string, date: string, reason = 'Needed back', claimedAdmin = actor) =>
    asUser(db, actor, (tx) => tx.query(
      `SELECT * FROM recall_leave_request($1, $2, $3, $4)`, [id, claimedAdmin, reason, date]));

  test('before the leave starts: restores every day', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-12', 10, 'approved');
    const { rows } = await recall(hr, id, '2027-02-26');
    expect(rows[0]).toMatchObject({ status: 'recalled', recalled_by: hr, recall_effective_date: new Date('2027-03-01') });
    expect(Number((rows[0] as { days_restored: string }).days_restored)).toBe(10);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 0 });
  });

  test('mid-leave: elapsed working days stay used, the rest is restored', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-12', 10, 'approved');
    // Effective Mon 8 Mar: Mon 1 – Fri 5 (5 days) were taken, 5 come back
    const { rows } = await recall(hr, id, '2027-03-08');
    expect(Number((rows[0] as { days_restored: string }).days_restored)).toBe(5);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 5, pending: 0 });
  });

  test('notifies the employee and queues the recall email', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
    await recall(hr, id, '2027-03-01');
    const n = await db.query(`SELECT type FROM notifications WHERE related_request_id = $1 AND user_id = $2`, [id, emp]);
    expect(n.rows).toContainEqual({ type: 'recall' });
    const e = await db.query(`SELECT event FROM test_sent_emails WHERE entity_id = $1`, [id]);
    expect(e.rows).toContainEqual({ event: 'leave_recalled' });
  });

  test('rejects an effective date after the leave ends', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
    await expect(recall(hr, id, '2027-03-06')).rejects.toThrow(/on or before the leave end date/);
  });

  test('rejects leave that is not approved', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await expect(recall(hr, id, '2027-03-01')).rejects.toThrow(/Only approved/);
  });

  test('requires a reason', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
    await expect(recall(hr, id, '2027-03-01', '  ')).rejects.toThrow(/reason is required/);
  });

  describe('security', () => {
    test('an employee cannot recall, even by passing an HR admin id', async () => {
      const emp = await newEmployee();
      const attacker = await newEmployee();
      const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
      await expect(recall(attacker, id, '2027-03-01', 'x', hr)).rejects.toThrow(/Only HR admin/);
    });

    test('a HOD cannot recall', async () => {
      const emp = await newEmployee();
      const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
      await expect(recall(hod, id, '2027-03-01')).rejects.toThrow(/Only HR admin/);
    });

    test('an anonymous caller is refused', async () => {
      const emp = await newEmployee();
      const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
      await expect(recall(null, id, '2027-03-01', 'x', hr)).rejects.toThrow(/permission denied/);
    });

    test('the recorded actor is the signed-in user, not the id passed in', async () => {
      const emp = await newEmployee();
      const id = await request(emp, '2027-03-01', '2027-03-05', 5, 'approved');
      const other = await addUser(db, 'super_admin');
      const { rows } = await recall(hr, id, '2027-03-01', 'x', other);
      expect(rows[0]).toMatchObject({ recalled_by: hr });
    });
  });
});

describe('employee self-service (row-level security)', () => {
  test('an employee cannot approve their own pending request', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await asUser(db, emp, (tx) =>
      tx.query(`UPDATE leave_requests SET status = 'approved' WHERE id = $1`, [id])).catch(() => undefined);
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM leave_requests WHERE id = $1`, [id]);
    expect(rows[0].status).toBe('pending');
  });

  test('an employee can still cancel their own pending request', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await asUser(db, emp, (tx) =>
      tx.query(`UPDATE leave_requests SET status = 'cancelled' WHERE id = $1`, [id]));
    const { rows } = await db.query<{ status: string }>(`SELECT status FROM leave_requests WHERE id = $1`, [id]);
    expect(rows[0].status).toBe('cancelled');
  });

  test('days charged are computed by the server, not taken from the client', async () => {
    const emp = await newEmployee();
    // Client claims 1 day for a Mon–Fri request
    await asUser(db, emp, (tx) => tx.query(
      `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, total_days, reason)
       VALUES ($1, $2, '2027-03-01', '2027-03-05', 1, 'test')`, [emp, leaveType]));
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 5 });
  });

  test('a request with no working days is refused', async () => {
    const emp = await newEmployee();
    await expect(request(emp, '2027-03-06', '2027-03-07', 2)).rejects.toThrow(/no working days/);
  });

  test('HR editing dates and approving in one update charges the new day count', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await db.query(`UPDATE leave_requests SET end_date = '2027-03-03', status = 'approved' WHERE id = $1`, [id]);
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 3, pending: 0 });
  });

  test('editing the dates of a pending request re-charges the pending balance', async () => {
    const emp = await newEmployee();
    const id = await request(emp, '2027-03-01', '2027-03-05', 5);
    await asUser(db, emp, (tx) =>
      tx.query(`UPDATE leave_requests SET end_date = '2027-03-12' WHERE id = $1`, [id]));
    expect(await getBalance(db, emp, leaveType, YEAR)).toEqual({ used: 0, pending: 10 });
  });
});
