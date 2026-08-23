import 'dotenv/config';
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env' });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL missing');

const sql = postgres(url, { prepare: false });

const expectedTables = [
  'accounts',
  'whatsapp_connections',
  'customers',
  'conversations',
  'messages',
  'appointments',
  'availability_rules',
  'blocked_periods',
  'message_templates',
  'reminder_jobs',
  'push_subscriptions',
  'events',
  'audit_log',
];

async function main() {
  const tables = await sql<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname, relrowsecurity
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace
      AND relkind = 'r'
    ORDER BY relname
  `;

  console.log('Tables in public schema:');
  for (const t of tables) console.log(`  ${t.relname.padEnd(28)} RLS=${t.relrowsecurity}`);

  const found = new Set(tables.map((t) => t.relname));
  const missing = expectedTables.filter((t) => !found.has(t));
  const noRls = tables.filter((t) => expectedTables.includes(t.relname) && !t.relrowsecurity);

  if (missing.length) console.log('\nMISSING tables:', missing);
  if (noRls.length) console.log('\nTables without RLS:', noRls.map((t) => t.relname));

  const ext = await sql<{ extname: string }[]>`SELECT extname FROM pg_extension WHERE extname='pgcrypto'`;
  console.log(`\npgcrypto installed: ${ext.length === 1}`);

  const fn = await sql<{ proname: string }[]>`SELECT proname FROM pg_proc WHERE proname='handle_new_user'`;
  console.log(`handle_new_user function: ${fn.length === 1}`);

  const trig = await sql<{ tgname: string }[]>`SELECT tgname FROM pg_trigger WHERE tgname='on_auth_user_created'`;
  console.log(`on_auth_user_created trigger: ${trig.length === 1}`);

  const fk = await sql<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE conname='accounts_id_auth_users_fk'
  `;
  console.log(`accounts→auth.users FK: ${fk.length === 1}`);

  const policies = await sql<{ tablename: string; policyname: string }[]>`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname='public'
    ORDER BY tablename
  `;
  console.log(`\nRLS policies (${policies.length}):`);
  for (const p of policies) console.log(`  ${p.tablename}.${p.policyname}`);

  const ok =
    missing.length === 0 &&
    noRls.length === 0 &&
    ext.length === 1 &&
    fn.length === 1 &&
    trig.length === 1 &&
    fk.length === 1 &&
    policies.length === expectedTables.length;

  await sql.end();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
