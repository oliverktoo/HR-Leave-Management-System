// Tests for 072_emergency_rls_lockdown.sql, starting from the production state
// (RLS disabled on users_profile by FINAL_RLS_FIX.sql).
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createLeaveDb } from './leaveDb';

let db: PGlite;
let hr: string, emp: string, colleague: string, fleet: string, auditor: string;

beforeAll(async () => {
  db = await createLeaveDb();
  hr = await addUser(db, 'hr_admin');
  emp = await addUser(db, 'employee');
  colleague = await addUser(db, 'employee');
  fleet = await addUser(db, 'fleet_manager');
  auditor = await addUser(db, 'auditor');
}, 60_000);

const profile = async (id: string) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM users_profile WHERE id = $1`, [id])).rows[0];

const update = (actor: string | null, target: string, set: string) =>
  asUser(db, actor, (tx) => tx.query(`UPDATE users_profile SET ${set} WHERE id = $1`, [target]));

describe('anonymous (not signed in)', () => {
  test.each(['users_profile', 'audit_logs', 'email_queue', 'email_templates'])('cannot read %s', async (t) => {
    await expect(asUser(db, null, (tx) => tx.query(`SELECT count(*) FROM ${t}`))).rejects.toThrow(/permission denied/);
  });

  test('cannot update profiles', async () => {
    await expect(update(null, emp, `role = 'super_admin'`)).rejects.toThrow(/permission denied/);
  });
});

describe('employee', () => {
  test('can read colleagues (directory, approvals still work)', async () => {
    const { rows } = await asUser(db, emp, (tx) => tx.query(`SELECT first_name FROM users_profile WHERE id = $1`, [colleague]));
    expect(rows).toHaveLength(1);
  });

  test.each([
    [`role = 'super_admin'`, /role/],
    [`secondary_role = 'hr_admin'`, /secondary_role/],
    [`basic_salary = 999999`, /basic_salary/],
    [`bank_account_number = 'ATTACKER'`, /bank_account_number/],
    [`kra_pin = 'X'`, /kra_pin/],
    [`email = 'me@evil.ke'`, /email/],
  ])('cannot change own %s', async (set, col) => {
    await expect(update(emp, emp, set)).rejects.toThrow(col);
  });

  test('can update own photo, face registration and push token', async () => {
    await update(emp, emp, `profile_photo_url = 'p.jpg', face_descriptor = '[1,2]', push_token = 'tok'`);
    expect(await profile(emp)).toMatchObject({ profile_photo_url: 'p.jpg', push_token: 'tok' });
  });

  test("cannot update a colleague's profile", async () => {
    const res = await update(emp, colleague, `push_token = 'hijack'`);
    expect(res.affectedRows).toBe(0);
    expect((await profile(colleague)).push_token).toBeNull();
  });

  test('cannot create profiles', async () => {
    await expect(asUser(db, emp, (tx) => tx.query(
      `INSERT INTO users_profile (id, employee_id, first_name, last_name, email, role)
       VALUES (uuid_generate_v4(), 'X1', 'a', 'b', 'x@x.ke', 'super_admin')`))).rejects.toThrow(/row-level security/);
  });

  test('cannot read the audit log', async () => {
    const { rows } = await asUser(db, emp, (tx) => tx.query(`SELECT count(*)::int AS n FROM audit_logs`));
    expect(rows[0]).toEqual({ n: 0 });
  });
});

describe('fleet manager', () => {
  test('can mark a driver and edit licence details', async () => {
    await update(fleet, colleague, `is_driver = true, license_number = 'DL-1'`);
    expect(await profile(colleague)).toMatchObject({ is_driver: true, license_number: 'DL-1' });
  });

  test('cannot change roles or pay', async () => {
    await expect(update(fleet, colleague, `role = 'hr_admin'`)).rejects.toThrow(/role/);
    await expect(update(fleet, colleague, `basic_salary = 1`)).rejects.toThrow(/basic_salary/);
  });
});

describe('HR admin', () => {
  test('can change role, pay and bank details', async () => {
    await update(hr, colleague, `role = 'hod', basic_salary = 85000, bank_account_number = '0123'`);
    expect(await profile(colleague)).toMatchObject({ role: 'hod', bank_account_number: '0123' });
  });

  test('can read the audit log', async () => {
    const { rows } = await asUser(db, hr, (tx) => tx.query(`SELECT count(*)::int AS n FROM audit_logs`));
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});

describe('audit log integrity', () => {
  test('auditor can read it', async () => {
    const { rows } = await asUser(db, auditor, (tx) => tx.query(`SELECT count(*)::int AS n FROM audit_logs`));
    expect((rows[0] as { n: number }).n).toBeGreaterThan(0);
  });

  test.each(['DELETE FROM audit_logs', `UPDATE audit_logs SET action = 'x'`])('even HR cannot %s', async (stmt) => {
    await expect(asUser(db, hr, (tx) => tx.query(stmt))).rejects.toThrow(/permission denied/);
  });

  test('profile changes are still audited', async () => {
    await update(emp, emp, `push_token = 'tok2'`);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_logs WHERE table_name = 'users_profile' AND record_id = $1`, [emp]);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});
