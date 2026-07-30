import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let sql: ReturnType<typeof postgres>;

beforeAll(() => {
  sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
});

afterAll(async () => {
  await sql.end({ timeout: 1 });
});

// Operator-only tables whose policy is deliberately USING (false) — 0016
// erasure_archive, 0021 wa_message_statuses, 0026 reminder_deliveries.
const DENY_ALL = new Set([
  'erasure_archive',
  'wa_message_statuses',
  'reminder_deliveries',
]);

const WRITE_PRIVILEGES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];

// Tables in `public` that legitimately carry no tenant column (shared/global
// reference data). Deriving the table set from "has a pt_id column" would make
// such a table invisible to this suite, so it could ship with RLS disabled and
// anon SELECT while every assertion below stayed green. The set is enumerated
// from pg_class instead and anything genuinely tenant-less must be listed here.
const NON_TENANT_TABLES = new Set<string>();

/**
 * Classify a policy predicate without depending on pg_get_expr's exact spacing
 * or schema qualification: `tenant` = keyed on this table's tenant column,
 * `deny-all` = USING (false). Anything else is returned verbatim so a failure
 * shows the predicate that actually shipped.
 */
function classifyQual(table: string, qual: string | null): string {
  const expr = (qual ?? '').replace(/^\((.*)\)$/, '$1').trim();
  const tenantCol = table === 'pts' ? 'id' : 'pt_id';
  if (new RegExp(`^${tenantCol} = (\\w+\\.)?uid\\(\\)$`).test(expr))
    return 'tenant';
  if (expr === 'false') return 'deny-all';
  return expr;
}

async function publicTables(): Promise<string[]> {
  const rows = await sql<{ relname: string }[]>`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
    ORDER BY relname
  `;
  return rows.map((r) => r.relname);
}

async function tenantTables(): Promise<string[]> {
  return (await publicTables()).filter((t) => !NON_TENANT_TABLES.has(t));
}

describe('RLS coverage', () => {
  // Guards the enumeration above: a new table with no tenant column is either a
  // deliberate shared table (allowlist it) or a missing pt_id, and both need a
  // human decision before the rest of this suite can mean anything.
  it('every public table carries a tenant column or is allowlisted', async () => {
    const rows = await sql<{ table_name: string }[]>`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'pt_id'
    `;
    const tenantScoped = new Set([...rows.map((r) => r.table_name), 'pts']);
    const unclassified = (await publicTables()).filter(
      (t) => !tenantScoped.has(t) && !NON_TENANT_TABLES.has(t),
    );
    expect(unclassified).toEqual([]);
  });

  it('every tenant-scoped table has RLS enabled', async () => {
    const tables = await tenantTables();
    expect(tables.length).toBeGreaterThanOrEqual(23);

    const rows = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relnamespace = 'public'::regnamespace
        AND relkind = 'r'
        AND relname = ANY(${sql.array(tables)})
    `;

    const without = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(without).toEqual([]);
  });

  it('every tenant-scoped table has a tenant_isolation policy', async () => {
    const tables = await tenantTables();
    const rows = await sql<{ tablename: string; policyname: string }[]>`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
    `;
    const byTable = new Map<string, string[]>();
    for (const r of rows) {
      const list = byTable.get(r.tablename) ?? [];
      list.push(r.policyname);
      byTable.set(r.tablename, list);
    }

    const missing = tables.filter((t) => {
      const policies = byTable.get(t) ?? [];
      return !policies.includes(`${t}_tenant_isolation`);
    });
    expect(missing).toEqual([]);
  });

  // A policy name alone says nothing: a copy-pasted deny-all (USING (false)) or a
  // re-widened FOR ALL both keep the name. Pin cmd and predicate so either one
  // fails here instead of only surfacing as silently dead Realtime in production.
  it('every tenant policy is SELECT-only over the tenant predicate', async () => {
    const tables = await tenantTables();
    const rows = await sql<
      {
        tablename: string;
        cmd: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >`
      SELECT tablename, cmd, roles, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname = tablename || '_tenant_isolation'
        AND tablename = ANY(${sql.array(tables)})
    `;
    expect(rows.length).toBe(tables.length);

    const actual = rows
      .map((r) => ({
        table: r.tablename,
        cmd: r.cmd,
        roles: r.roles,
        qual: classifyQual(r.tablename, r.qual),
        withCheck: r.with_check,
      }))
      .sort((a, b) => a.table.localeCompare(b.table));

    const expected = tables
      .map((table) => ({
        table,
        cmd: 'SELECT',
        roles: ['authenticated'],
        qual: DENY_ALL.has(table) ? 'deny-all' : 'tenant',
        withCheck: null,
      }))
      .sort((a, b) => a.table.localeCompare(b.table));

    expect(actual).toEqual(expected);
  });

  // The policies only matter while the GRANTs agree: authenticated/anon must hold
  // SELECT (Realtime postgres_changes) and nothing else. Every app write goes
  // through the owner connection in lib/db, never PostgREST.
  it('anon and authenticated hold SELECT but no write privilege', async () => {
    const tables = await tenantTables();
    const rows = await sql<
      { table_name: string; grantee: string; priv: string }[]
    >`
      SELECT c.relname AS table_name, r.rolname AS grantee, p.priv
      FROM pg_class c
      CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
      CROSS JOIN unnest(${sql.array(WRITE_PRIVILEGES)}::text[]) AS p(priv)
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
        AND c.relname = ANY(${sql.array(tables)})
        AND has_table_privilege(r.rolname, c.oid, p.priv)
    `;
    expect(rows).toEqual([]);

    const readable = await sql<{ table_name: string }[]>`
      SELECT c.relname AS table_name
      FROM pg_class c
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
        AND c.relname = ANY(${sql.array(tables)})
        AND has_table_privilege('authenticated', c.oid, 'SELECT')
    `;
    expect(readable.map((r) => r.table_name).sort()).toEqual(
      [...tables].sort(),
    );
  });

  // Naming the revoked privileges (as above) only catches the ones someone
  // thought of: `GRANT ALL` also hands out REFERENCES, TRIGGER and MAINTAIN, and
  // TRIGGER is the dangerous leftover — CREATE TRIGGER runs the trigger body with
  // the table owner's rights. Enumerate the ACL instead of probing a fixed list,
  // so any privilege beyond SELECT fails here whatever Postgres calls it.
  it('anon and authenticated are granted SELECT and nothing else', async () => {
    const tables = await tenantTables();
    const rows = await sql<
      { table_name: string; grantee: string; privilege_type: string }[]
    >`
      SELECT c.relname AS table_name,
             pg_get_userbyid(a.grantee) AS grantee,
             a.privilege_type
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) AS a
      WHERE c.relnamespace = 'public'::regnamespace
        AND c.relkind = 'r'
        AND c.relname = ANY(${sql.array(tables)})
        AND pg_get_userbyid(a.grantee) IN ('anon', 'authenticated')
        AND a.privilege_type <> 'SELECT'
      ORDER BY table_name, grantee, privilege_type
    `;
    expect(rows).toEqual([]);
  });
});
