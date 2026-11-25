// Admin RPCs (password reset, email change, create/delete user) — the live
// versions of these files were confirmed by md5 via the probe. Shows the
// pre-074 hole and that 074 closes it without breaking HR.
import { beforeAll, describe, expect, test } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, asUser, createLeaveDb } from './leaveDb';

const ADMIN_FUNCTION_FILES = [
  'add_force_password_change.sql',   // admin_reset_user_password, reset_employee_password
  '038_admin_update_email_rpc.sql',  // admin_update_user_email
  'create_user_admin.sql',           // create_user_admin (repo version; live differs)
  'delete_user_admin.sql',           // delete_user_admin
];

const password = async (db: PGlite, id: string) =>
  (await db.query<{ p: string | null }>(`SELECT encrypted_password AS p FROM auth.users WHERE id = $1`, [id])).rows[0].p;

/** An auth account with no users_profile row (e.g. a self sign-up). */
async function profilelessAccount(db: PGlite) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO auth.users (id, email) VALUES (uuid_generate_v4(), 'stranger@x.ke') RETURNING id`);
  return rows[0].id;
}

describe('before 074 (current production)', () => {
  let db: PGlite, victim: string;
  beforeAll(async () => {
    db = await createLeaveDb(ADMIN_FUNCTION_FILES);
    victim = await addUser(db, 'super_admin');
  }, 60_000);

  test('an anonymous caller can reset a super admin password', async () => {
    const { rows } = await asUser(db, null, (tx) =>
      tx.query<{ r: { success: boolean } }>(`SELECT admin_reset_user_password($1, 'pwned') AS r`, [victim]));
    expect(rows[0].r.success).toBe(true);
    expect(await password(db, victim)).toBe('hash:pwned');
  });
});

describe('after 074', () => {
  let db: PGlite, hr: string, emp: string, victim: string, stranger: string;
  beforeAll(async () => {
    db = await createLeaveDb([...ADMIN_FUNCTION_FILES, '074_lock_down_admin_functions.sql',
      '080_fix_admin_functions_search_path.sql']);
    hr = await addUser(db, 'hr_admin');
    emp = await addUser(db, 'employee');
    victim = await addUser(db, 'super_admin');
    stranger = await profilelessAccount(db);
  }, 60_000);

  const calls: Array<[string, (v: string) => [string, unknown[]]]> = [
    ['admin_reset_user_password', (v) => [`SELECT admin_reset_user_password($1, 'pwned')`, [v]]],
    ['reset_employee_password', () => [`SELECT reset_employee_password('u3@test.ke', 'pwned')`, []]],
    ['admin_update_user_email', (v) => [`SELECT admin_update_user_email($1, 'attacker@evil.ke')`, [v]]],
    ['create_user_admin', () => [`SELECT create_user_admin('new@evil.ke', 'pw', 'A', 'B', null, null, 'super_admin', true)`, []]],
    ['delete_user_admin', (v) => [`SELECT delete_user_admin($1)`, [v]]],
  ];

  describe.each(calls)('%s', (_name, call) => {
    test('anonymous caller: permission denied', async () => {
      const [q, p] = call(victim);
      await expect(asUser(db, null, (tx) => tx.query(q, p))).rejects.toThrow(/permission denied/);
    });
    test('account without a profile: refused', async () => {
      const [q, p] = call(victim);
      await expect(asUser(db, stranger, (tx) => tx.query(q, p))).rejects.toThrow(/Only HR admin or super admin/);
    });
    test('employee: refused', async () => {
      const [q, p] = call(victim);
      await expect(asUser(db, emp, (tx) => tx.query(q, p))).rejects.toThrow(/Only HR admin or super admin/);
    });
  });

  test('the victim is untouched', async () => {
    expect(await password(db, victim)).toBeNull();
    const { rows } = await db.query(`SELECT email FROM auth.users WHERE id = $1`, [victim]);
    expect(rows).toHaveLength(1);
  });

  test('the original functions cannot be called directly', async () => {
    await expect(asUser(db, emp, (tx) => tx.query(`SELECT admin_reset_user_password_unguarded($1, 'x')`, [victim])))
      .rejects.toThrow(/permission denied/);
  });

  test('HR admin can still reset a password', async () => {
    const { rows } = await asUser(db, hr, (tx) =>
      tx.query<{ r: { success: boolean } }>(`SELECT admin_reset_user_password($1, 'temp123') AS r`, [emp]));
    expect(rows[0].r.success).toBe(true);
    expect(await password(db, emp)).toBe('hash:temp123');
  });

  test('HR admin can still create a user', async () => {
    await asUser(db, hr, (tx) =>
      tx.query(`SELECT create_user_admin('fresh@fkf.ke', 'pw', 'New', 'Hire', null, null, 'employee', true)`));
    const { rows } = await db.query(`SELECT role FROM users_profile WHERE email = 'fresh@fkf.ke'`);
    expect(rows).toEqual([{ role: 'employee' }]);
  });

  test('anonymous calls to ordinary functions are refused; the staff-card check stays public', async () => {
    await expect(asUser(db, null, (tx) => tx.query(`SELECT calculate_working_days('2027-03-01', '2027-03-05')`)))
      .rejects.toThrow(/permission denied/);
    const { rows } = await asUser(db, emp, (tx) =>
      tx.query<{ d: string }>(`SELECT calculate_working_days('2027-03-01', '2027-03-05') AS d`));
    expect(Number(rows[0].d)).toBe(5);
  });
});
