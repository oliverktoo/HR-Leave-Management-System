// Test harness: boots an in-process Postgres (PGlite) and loads the REAL leave
// schema + functions from supabase/ migrations, with minimal stand-ins for the
// Supabase platform pieces (auth schema, roles, email http calls).
import { PGlite } from '@electric-sql/pglite';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_DIR = resolve(__dirname, '../../../../supabase');
const sql = (rel: string) => readFileSync(resolve(SUPABASE_DIR, rel), 'utf8');

const PLATFORM_STUBS = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
  -- auth.uid() reads the uid set by the test via set_config('test.uid', ...)
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
    $$ SELECT 'authenticated'::text $$;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
  END $$;
`;

// Emails go out via pg_net in production; record the event instead.
const EMAIL_STUB = `
  CREATE TABLE IF NOT EXISTS test_sent_emails (event text, entity text, entity_id uuid);
  CREATE OR REPLACE FUNCTION call_send_email_function(p_event_type text, p_entity_type text, p_entity_id uuid)
  RETURNS void LANGUAGE sql AS
    $$ INSERT INTO test_sent_emails VALUES (p_event_type, p_entity_type, p_entity_id) $$;
`;

/** Return the migration text before a section marker. */
function upTo(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error(`marker not found: ${marker}`);
  return src.slice(0, i);
}

// Supabase grants anon/authenticated full table access as each table is
// created (default privileges); RLS then decides which rows they can touch.
// Applied BEFORE migrations so a migration's REVOKE sticks, as in production.
const SUPABASE_DEFAULT_GRANTS = `
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated;
  GRANT SELECT ON auth.users TO authenticated;
`;

// Created in production by the one-off setup_email_notifications.sql.
const LEGACY_EMAIL_TABLES = `
  CREATE TABLE IF NOT EXISTS email_queue (id serial PRIMARY KEY, to_email text);
  CREATE TABLE IF NOT EXISTS email_templates (id serial PRIMARY KEY, name text);
`;

/** Migrations applied on top of the base schema, in order. */
export const LEAVE_MIGRATIONS = [
  '003_two_step_approval.sql',
  // Production ran this one-off script, which turned RLS off on users_profile.
  'FINAL_RLS_FIX.sql',
  // 070 section 6 rewires payroll (needs the payroll schema) — not under test here.
  ['070_leave_recall.sql', '-- ─── 6.'],
  '071_secure_recall_leave_request.sql',
  '072_emergency_rls_lockdown.sql',
  '073_leave_request_integrity.sql',
] as const;

// users_profile columns added by later migrations (030, 033, 050, ...) that the
// policies and tests touch.
const LATER_PROFILE_COLUMNS = `
  ALTER TABLE users_profile
    ADD COLUMN IF NOT EXISTS secondary_role text,
    ADD COLUMN IF NOT EXISTS basic_salary numeric(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS bank_account_number text,
    ADD COLUMN IF NOT EXISTS kra_pin text,
    ADD COLUMN IF NOT EXISTS profile_photo_url text,
    ADD COLUMN IF NOT EXISTS face_descriptor jsonb,
    ADD COLUMN IF NOT EXISTS push_token text,
    ADD COLUMN IF NOT EXISTS is_driver boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS license_number text;
`;

export async function createLeaveDb(extra: string[] = []): Promise<PGlite> {
  const db = new PGlite({ extensions: { uuid_ossp } });
  await db.exec(PLATFORM_STUBS);
  await db.exec(SUPABASE_DEFAULT_GRANTS);
  await db.exec(sql('migrations/001_initial_schema.sql'));
  // Later migrations widen the role list (super_admin, fleet_manager, ...).
  await db.exec('ALTER TABLE users_profile DROP CONSTRAINT chk_role;');
  await db.exec(LATER_PROFILE_COLUMNS);
  await db.exec(sql('migrations/002_triggers_and_rls.sql'));
  // One-off fix (not a numbered migration): 002's log_audit() reads NEW.user_id,
  // which users_profile doesn't have.
  await db.exec(sql('fix_audit_trigger.sql'));
  await db.exec(EMAIL_STUB);
  await db.exec(LEGACY_EMAIL_TABLES);
  for (const m of [...LEAVE_MIGRATIONS, ...extra]) {
    await db.exec(typeof m === 'string' ? sql(m) : upTo(sql(m[0]), m[1]));
  }
  return db;
}

// ─── Fixtures & helpers ──────────────────────────────────────────────────────

let seq = 0;
export async function addUser(db: PGlite, role: string, departmentId?: string): Promise<string> {
  const n = ++seq;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO auth.users (id, email) VALUES (uuid_generate_v4(), $1) RETURNING id`, [`u${n}@test.ke`]);
  const id = rows[0].id;
  await db.query(
    `INSERT INTO users_profile (id, employee_id, first_name, last_name, email, role, department_id)
     VALUES ($1, $2, 'User', $3, $4, $5, $6)`,
    [id, `FKF${n}`, String(n), `u${n}@test.ke`, role, departmentId ?? null]);
  return id;
}

export async function addLeaveType(db: PGlite, name = 'Annual'): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO leave_types (name, max_days_per_year) VALUES ($1, 21) RETURNING id`, [name]);
  return rows[0].id;
}

export async function addBalance(db: PGlite, userId: string, leaveTypeId: string, year: number, allocation = 21) {
  await db.query(
    `INSERT INTO leave_balances (user_id, leave_type_id, year, annual_allocation) VALUES ($1, $2, $3, $4)`,
    [userId, leaveTypeId, year, allocation]);
}

export async function getBalance(db: PGlite, userId: string, leaveTypeId: string, year: number) {
  const { rows } = await db.query<{ used: string; pending: string }>(
    `SELECT used_days AS used, pending_days AS pending FROM leave_balances
     WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`, [userId, leaveTypeId, year]);
  return { used: Number(rows[0].used), pending: Number(rows[0].pending) };
}

/** Run `fn` as a signed-in Supabase user (role authenticated, auth.uid() = uid). */
export async function asUser<T>(db: PGlite, uid: string | null, fn: (tx: PGliteTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('test.uid', $1, true)`, [uid ?? '']);
    await tx.query(uid ? 'SET LOCAL ROLE authenticated' : 'SET LOCAL ROLE anon');
    return fn(tx);
  });
}
export type PGliteTx = Parameters<Parameters<PGlite['transaction']>[0]>[0];
