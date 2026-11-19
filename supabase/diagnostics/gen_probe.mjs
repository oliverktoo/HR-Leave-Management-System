// Generates a read-only SQL probe that reports, per migration file, which of the
// objects it creates exist in the live DB, and whether each function body
// matches (whitespace-insensitive md5) the version in that file.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.argv[2];
const out = process.argv[3];
const files = [
  ...fs.readdirSync(path.join(root, 'migrations')).filter(f => /^\d{3}_.*\.sql$/.test(f)).map(f => 'migrations/' + f),
  ...fs.readdirSync(root).filter(f => /^\d{3}_.*\.sql$/.test(f)),
].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));

const id = s => s.replace(/"/g, '').replace(/^public\./i, '').toLowerCase();
const q = s => "'" + s.replace(/'/g, "''") + "'";
const rows = [];

for (const f of files) {
  let sql = fs.readFileSync(path.join(root, f), 'utf8');
  // functions (capture body between matching dollar tags)
  const fnRe = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?as\s+(\$[\w]*\$)([\s\S]*?)\3/gi;
  let m;
  while ((m = fnRe.exec(sql))) {
    const body = m[4].replace(/\s+/g, '');
    rows.push([f, 'function', id(m[1]), crypto.createHash('md5').update(body).digest('hex')]);
  }
  // strip function bodies before scanning DDL, to avoid matching code inside them
  sql = sql.replace(/(\$[\w]*\$)[\s\S]*?\1/g, '');
  sql = sql.replace(/--.*$/gm, '');
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) rows.push([f, 'table', id(m[1]), '']);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) rows.push([f, 'view', id(m[1]), '']);
  for (const m of sql.matchAll(/create\s+policy\s+("[^"]+"|\w+)\s+on\s+([\w."]+)/gi)) rows.push([f, 'policy', id(m[2]) + '|' + m[1].replace(/"/g, ''), '']);
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(\w+)[\s\S]*?\son\s+([\w."]+)/gi)) rows.push([f, 'trigger', id(m[2]) + '|' + m[1].toLowerCase(), '']);
  for (const stmt of sql.split(';')) {
    const t = stmt.match(/alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?([\w."]+)/i);
    if (!t) continue;
    for (const c of stmt.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?("?\w+"?)/gi)) rows.push([f, 'column', id(t[1]) + '|' + id(c[1]), '']);
  }
}

// de-dup identical rows
const seen = new Set();
const uniq = rows.filter(r => { const k = r.join('\u0001'); if (seen.has(k)) return false; seen.add(k); return true; });

const values = uniq.map(r => `(${r.map(q).join(',')})`).join(',\n');
const probe = `-- READ-ONLY probe: reports which migration objects exist live. Changes nothing.
WITH expected(file, kind, key, body_md5) AS (VALUES
${values}
),
fns AS (
  SELECT p.proname AS name, md5(regexp_replace(p.prosrc, '\\s', '', 'g')) AS h
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
),
chk AS (
  SELECT e.*,
    CASE e.kind
      WHEN 'table'    THEN to_regclass('public.' || e.key) IS NOT NULL
      WHEN 'view'     THEN to_regclass('public.' || e.key) IS NOT NULL
      WHEN 'column'   THEN EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name=split_part(e.key,'|',1) AND c.column_name=split_part(e.key,'|',2))
      WHEN 'policy'   THEN EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=split_part(e.key,'|',1) AND p.policyname=split_part(e.key,'|',2))
      WHEN 'trigger'  THEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname=split_part(e.key,'|',1) AND t.tgname=split_part(e.key,'|',2))
      WHEN 'function' THEN EXISTS (SELECT 1 FROM fns WHERE fns.name = e.key)
    END AS present,
    CASE WHEN e.kind='function' THEN EXISTS (SELECT 1 FROM fns WHERE fns.name=e.key AND fns.h=e.body_md5) END AS body_matches
  FROM expected e
)
SELECT json_build_object(
  'migrations', (SELECT json_agg(x ORDER BY x.file) FROM (
      SELECT file,
             count(*) FILTER (WHERE present) AS found,
             count(*) AS total,
             count(*) FILTER (WHERE body_matches) AS fn_body_live,
             count(*) FILTER (WHERE kind='function') AS fns,
             string_agg(CASE WHEN NOT present THEN kind||':'||key END, ', ') AS missing
      FROM chk GROUP BY file) x),
  'payroll_settings', (SELECT json_object_agg(setting_key, setting_value) FROM payroll_settings),
  'tables_without_rls', (SELECT json_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
  'anon_writable_tables', (SELECT json_agg(c.relname ORDER BY c.relname)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND (has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'))
        AND NOT c.relrowsecurity),
  'secdef_functions', (SELECT json_agg(json_build_object(
        'fn', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        'md5', md5(regexp_replace(p.prosrc, '\\s', '', 'g')),
        'search_path_set', coalesce(array_to_string(p.proconfig, ',') ILIKE '%search_path%', false),
        'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        'uses_auth_uid', p.prosrc ILIKE '%auth.uid()%',
        'trigger', p.prorettype = 'trigger'::regtype) ORDER BY p.proname)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef)
) AS probe_result;
`;
fs.writeFileSync(out, probe);
console.log(`files=${files.length} objects=${uniq.length} bytes=${probe.length}`);
const by = {}; for (const r of uniq) by[r[1]] = (by[r[1]] || 0) + 1; console.log(by);
