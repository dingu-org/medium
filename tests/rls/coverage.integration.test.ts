import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let sql: ReturnType<typeof postgres>;

beforeAll(() => {
  sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
});

afterAll(async () => {
  await sql.end({ timeout: 1 });
});

async function tenantTables(): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'pt_id'
    UNION
    SELECT 'pts'::text
    ORDER BY table_name
  `;
  return rows.map((r) => r.table_name);
}

describe('RLS coverage', () => {
  it('every tenant-scoped table has RLS enabled', async () => {
    const tables = await tenantTables();
    expect(tables.length).toBeGreaterThanOrEqual(13);

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
});
