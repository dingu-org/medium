/**
 * Read side of the onboarding funnel (MED-125). Read-only: every query runs in
 * a `read only` transaction, and the output is aggregates only (no names,
 * emails, ids or business fields are ever selected). Two modes:
 *
 *   funnel    the guided flow, per step, from `onboarding_events`
 *   baseline  the legacy checklist, per item, from the data it left behind
 *
 * Run: pnpm onboarding:funnel   | pnpm onboarding:baseline            (local, via .env)
 *      pnpm onboarding:funnel:preview  | pnpm onboarding:baseline:preview
 *      pnpm onboarding:funnel:prod     | pnpm onboarding:baseline:prod
 * (after `pnpm env:pull:preview` / `pnpm env:pull:prod`). Options:
 *   --json                 machine-readable output
 *   --before <ISO time>    baseline: legacy accounts created before this (default now)
 *   --since / --until      accounts.created_at window (both modes)
 *   --env <name>           funnel: events with this app_env (default appEnv())
 *
 * Method and gaps: docs/product/onboarding-baseline.md.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import { db, type DBTransaction } from '@/lib/db';
import { APP_ENVS, appEnv, isAppEnv, type AppEnv } from '@/lib/env/app-env';
import { supabaseProjectRefFromDatabaseUrl } from '@/lib/env/environments';
import { assertEnvironmentIntegrity } from '@/lib/env/guard';
import {
  FUNNEL_STEPS,
  finalOutcome,
  ONBOARDING_FLOW_VERSION,
  type FunnelOutcome,
  type FunnelStep,
} from '@/lib/onboarding/funnel';

/**
 * Internal accounts, excluded in SQL only: the seed (`scripts/seed.ts`
 * SEED_EMAIL) and QA (`scripts/seed-qa.ts` EMAIL, not exported because that
 * module runs on import) addresses, plus everything in ADMIN_EMAILS.
 */
export const INTERNAL_EMAILS = ['seed@medium.local', 'qa@medium.local'] as const;

export function excludedEmails(
  adminEmailsEnv: string | undefined = process.env.ADMIN_EMAILS,
): string[] {
  const admins = (adminEmailsEnv ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...INTERNAL_EMAILS, ...admins])];
}

/** `lower(email) <> all(...)`, built from a comma string so the list is one parameter. */
function notInternal(excluded: readonly string[]) {
  return sql`lower(a.email) <> all(string_to_array(${excluded.join(',')}, ','))`;
}

type Window = { since?: Date; until?: Date };

function createdWindow(w: Window) {
  return sql`
    ${w.since ? sql`and a.created_at >= ${w.since.toISOString()}::timestamptz` : sql``}
    ${w.until ? sql`and a.created_at < ${w.until.toISOString()}::timestamptz` : sql``}`;
}

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);
const round1 = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 10) / 10;

// ---------------------------------------------------------------- baseline

export const BASELINE_ITEMS = [
  'profile',
  'whatsapp',
  'availability',
  'services',
  'testMessage',
  'plan',
  'complete',
] as const;
export type BaselineItem = (typeof BASELINE_ITEMS)[number];

/** What the old flow let us reconstruct per item (documented in the baseline doc). */
export const BASELINE_TIMESTAMPS: Record<
  BaselineItem,
  { timestamp: string; gap: string | null }
> = {
  profile: {
    timestamp: 'none',
    gap: 'no timestamp: only the count; time to complete cannot be reconstructed',
  },
  whatsapp: {
    timestamp: 'first connected_at over all the account rows',
    gap: 'disconnected accounts are not done today (see ever); deleted rows lose their time',
  },
  availability: {
    timestamp: 'none',
    gap: 'no timestamp: only the count; rules are replaced wholesale',
  },
  services: {
    timestamp: 'services_configured_at (the LATEST confirm, an upper bound)',
    gap: 'overwritten on every confirm, so later than the first completion',
  },
  testMessage: {
    timestamp: 'least(first message, first conversation_day)',
    gap: 'messages are purged after retention_days; ever = messages or conversation_days; outbound-only tests that made no conversation_day are lost after the purge',
  },
  plan: {
    timestamp: 'plan_step_seen_at',
    gap: 'soft, informational: not part of complete; a paid plan has no timestamp here',
  },
  complete: {
    timestamp: 'lower bound: the latest known item timestamp',
    gap: 'profile and availability have no time, so the real completion time is at or after this',
  },
};

export type BaselineRow = {
  item: BaselineItem;
  cohort: number;
  done_now: number;
  /** Differs from done_now only for whatsapp, testMessage and complete. */
  ever: number;
  with_timestamp: number;
  hours_p25: number | null;
  hours_p50: number | null;
  hours_p75: number | null;
  hours_p90: number | null;
  within_1h: number;
  within_24h: number;
  within_7d: number;
  timestamp: string;
  gap: string | null;
};

export type BaselineWeek = {
  week: string;
  accounts: number;
} & Record<Exclude<BaselineItem, 'plan'>, number>;

export type Baseline = {
  mode: 'baseline';
  cohort: { legacy_accounts: number; before: string; since: string | null };
  items: BaselineRow[];
  by_signup_week: BaselineWeek[];
};

type BaselineOpts = Window & { before: Date; excluded?: readonly string[] };

/**
 * The legacy checklist baseline. "Done" is exactly `getOnboardingState`
 * (lib/onboarding/state.ts), evaluated now; the timestamps are whatever the
 * old flow left behind. Must be called inside a read-only transaction.
 */
export async function legacyBaseline(
  tx: DBTransaction,
  opts: BaselineOpts,
): Promise<Baseline> {
  const excluded = opts.excluded ?? excludedEmails();
  const cohortCte = sql`
    f as (
      select
        a.created_at,
        coalesce(btrim(a.name), '') <> '' as profile_done,
        exists (select 1 from whatsapp_connections w
                 where w.account_id = a.id and w.status = 'active') as wa_done,
        exists (select 1 from whatsapp_connections w
                 where w.account_id = a.id and w.connected_at is not null) as wa_ever,
        (select min(w.connected_at) from whatsapp_connections w
          where w.account_id = a.id) as wa_at,
        exists (select 1 from availability_rules r where r.account_id = a.id) as av_done,
        (exists (select 1 from services s where s.account_id = a.id and s.active)
          and a.services_configured_at is not null) as svc_done,
        a.services_configured_at as svc_at,
        exists (select 1 from messages m where m.account_id = a.id) as msg_done,
        (exists (select 1 from messages m where m.account_id = a.id)
          or exists (select 1 from conversation_days d where d.account_id = a.id)) as msg_ever,
        least(
          (select min(m.created_at) from messages m where m.account_id = a.id),
          (select min(d.created_at) from conversation_days d where d.account_id = a.id)
        ) as msg_at,
        (a.plan::text <> 'free' or a.plan_step_seen_at is not null) as plan_done,
        a.plan_step_seen_at as plan_at
      from accounts a
      where a.onboarding_flow = 'legacy'
        and a.created_at < ${opts.before.toISOString()}::timestamptz
        ${createdWindow(opts)}
        and ${notInternal(excluded)}
    ),
    g as (
      select f.*,
        (profile_done and wa_done and av_done and svc_done and msg_done) as all_done,
        (profile_done and wa_ever and av_done and svc_done and msg_ever) as all_ever,
        greatest(wa_at, svc_at, msg_at) as all_at
      from f
    )`;

  const itemRows = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte},
    v as (
      select g.created_at, i.item, i.done, i.ever,
             case when i.ts is null then null
                  else extract(epoch from (i.ts - g.created_at)) / 3600.0 end as hours
      from g cross join lateral (values
        ('profile',      g.profile_done, g.profile_done, null::timestamptz),
        ('whatsapp',     g.wa_done,      g.wa_ever,      g.wa_at),
        ('availability', g.av_done,      g.av_done,      null::timestamptz),
        ('services',     g.svc_done,     g.svc_done,     g.svc_at),
        ('testMessage',  g.msg_done,     g.msg_ever,     g.msg_at),
        ('plan',         g.plan_done,    g.plan_done,    g.plan_at),
        ('complete',     g.all_done,     g.all_ever,     case when g.all_ever then g.all_at end)
      ) as i(item, done, ever, ts)
    )
    select item,
      count(*)::int as cohort,
      (count(*) filter (where done))::int as done_now,
      (count(*) filter (where ever))::int as ever,
      (count(hours))::int as with_timestamp,
      percentile_cont(0.25) within group (order by hours) as p25,
      percentile_cont(0.50) within group (order by hours) as p50,
      percentile_cont(0.75) within group (order by hours) as p75,
      percentile_cont(0.90) within group (order by hours) as p90,
      (count(*) filter (where hours <= 1))::int as within_1h,
      (count(*) filter (where hours <= 24))::int as within_24h,
      (count(*) filter (where hours <= 24 * 7))::int as within_7d
    from v group by item
  `);

  const byItem = new Map(itemRows.map((r) => [String(r.item), r]));
  const items: BaselineRow[] = BASELINE_ITEMS.map((item) => {
    const r = byItem.get(item);
    return {
      item,
      cohort: num(r?.cohort),
      done_now: num(r?.done_now),
      ever: num(r?.ever),
      with_timestamp: num(r?.with_timestamp),
      hours_p25: round1(numOrNull(r?.p25)),
      hours_p50: round1(numOrNull(r?.p50)),
      hours_p75: round1(numOrNull(r?.p75)),
      hours_p90: round1(numOrNull(r?.p90)),
      within_1h: num(r?.within_1h),
      within_24h: num(r?.within_24h),
      within_7d: num(r?.within_7d),
      ...BASELINE_TIMESTAMPS[item],
    };
  });

  const weekRows = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte}
    select to_char(date_trunc('week', created_at at time zone 'UTC'), 'IYYY-"W"IW') as week,
      count(*)::int as accounts,
      (count(*) filter (where profile_done))::int as profile,
      (count(*) filter (where wa_done))::int as whatsapp,
      (count(*) filter (where av_done))::int as availability,
      (count(*) filter (where svc_done))::int as services,
      (count(*) filter (where msg_done))::int as "testMessage",
      (count(*) filter (where all_done))::int as complete
    from g group by 1 order by 1
  `);

  return {
    mode: 'baseline',
    cohort: {
      legacy_accounts: items[0].cohort,
      before: opts.before.toISOString(),
      since: opts.since ? opts.since.toISOString() : null,
    },
    items,
    by_signup_week: weekRows.map((r) => ({
      week: String(r.week),
      accounts: num(r.accounts),
      profile: num(r.profile),
      whatsapp: num(r.whatsapp),
      availability: num(r.availability),
      services: num(r.services),
      testMessage: num(r.testMessage),
      complete: num(r.complete),
    })),
  };
}

// ------------------------------------------------------------------ funnel

export type FunnelStepRow = {
  step: FunnelStep;
  reached: number;
  /** Terminal event but no `shown` row (beacon loss); already inside reached. */
  shown_missing: number;
  completed: number;
  skipped: number;
  not_applicable: number;
  /** Reached, no terminal row, onboarding not completed. */
  dropped: number;
  /** Share of the previous listed step's reached count, 0-100; null for the first. */
  conversion_pct: number | null;
  minutes_p50: number | null;
  minutes_p90: number | null;
};

export type FunnelWeek = {
  week: string;
  signups: number;
  intro_reached: number;
  finish_reached: number;
  completed: number;
};

export type Funnel = {
  mode: 'funnel';
  env: string;
  flow_version: number;
  cohort: {
    guided_signups: number;
    onboarding_completed: number;
    finish_completed: number;
    whatsapp_connected_within_7d_of_finish: number;
    since: string | null;
    until: string | null;
  };
  steps: FunnelStepRow[];
  by_signup_week: FunnelWeek[];
};

type FunnelOpts = Window & { env: AppEnv; excluded?: readonly string[] };

/**
 * The guided flow per step. Reached = a `shown` row OR a terminal row. The
 * final outcome per (account, step) is `finalOutcome` (completed > skipped >
 * not_applicable), applied here to aggregated outcome sets so no account id
 * ever leaves the database. Must be called inside a read-only transaction.
 */
export async function guidedFunnel(
  tx: DBTransaction,
  opts: FunnelOpts,
): Promise<Funnel> {
  const excluded = opts.excluded ?? excludedEmails();
  const cohortCte = sql`
    cohort as (
      select a.id, a.created_at, a.onboarding_completed_at
      from accounts a
      where a.onboarding_flow = 'guided'
        ${createdWindow(opts)}
        and ${notInternal(excluded)}
    ),
    ev as (
      select e.account_id, e.step, e.outcome, e.occurred_at
      from onboarding_events e join cohort c on c.id = e.account_id
      where e.app_env = ${opts.env} and e.flow_version = ${ONBOARDING_FLOW_VERSION}
    )`;

  // One row per (step, outcome set, completed?) with its account count.
  const shapeRows = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte},
    per as (
      select ev.account_id, ev.step::text as step,
             array_agg(distinct ev.outcome::text order by ev.outcome::text) as outcomes
      from ev group by 1, 2
    )
    select per.step, per.outcomes,
           (c.onboarding_completed_at is not null) as account_completed,
           count(*)::int as n
    from per join cohort c on c.id = per.account_id
    group by 1, 2, 3
  `);

  const timeRows = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte},
    per as (
      select ev.step::text as step,
        min(ev.occurred_at) filter (where ev.outcome = 'shown') as shown_at,
        min(ev.occurred_at) filter (where ev.outcome in ('completed', 'skipped')) as left_at
      from ev group by ev.account_id, ev.step
    )
    select step,
      percentile_cont(0.5) within group
        (order by extract(epoch from (left_at - shown_at)) / 60.0) as p50,
      percentile_cont(0.9) within group
        (order by extract(epoch from (left_at - shown_at)) / 60.0) as p90
    from per where shown_at is not null and left_at is not null
    group by step
  `);

  const totals = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte}
    select
      (select count(*) from cohort)::int as signups,
      (select count(*) from cohort where onboarding_completed_at is not null)::int as completed,
      (select count(distinct account_id) from ev
         where step = 'finish' and outcome = 'completed')::int as finish_completed,
      (select count(*) from (
         select ev.account_id from ev
         where ev.step = 'finish' and ev.outcome = 'completed'
           and exists (select 1 from whatsapp_connections w
                        where w.account_id = ev.account_id
                          and w.connected_at >= ev.occurred_at
                          and w.connected_at < ev.occurred_at + interval '7 days')
       ) x)::int as wa_7d
  `);

  const weekRows = await tx.execute<Record<string, unknown>>(sql`
    with ${cohortCte}
    select to_char(date_trunc('week', c.created_at at time zone 'UTC'), 'IYYY-"W"IW') as week,
      count(*)::int as signups,
      (count(*) filter (where exists (select 1 from ev where ev.account_id = c.id
                                       and ev.step = 'intro')))::int as intro_reached,
      (count(*) filter (where exists (select 1 from ev where ev.account_id = c.id
                                       and ev.step = 'finish')))::int as finish_reached,
      (count(*) filter (where c.onboarding_completed_at is not null))::int as completed
    from cohort c group by 1 order by 1
  `);

  const times = new Map(timeRows.map((r) => [String(r.step), r]));
  const steps: FunnelStepRow[] = [];
  for (const step of FUNNEL_STEPS) {
    const row: FunnelStepRow = {
      step,
      reached: 0,
      shown_missing: 0,
      completed: 0,
      skipped: 0,
      not_applicable: 0,
      dropped: 0,
      conversion_pct: null,
      minutes_p50: round1(numOrNull(times.get(step)?.p50)),
      minutes_p90: round1(numOrNull(times.get(step)?.p90)),
    };
    for (const shape of shapeRows) {
      if (String(shape.step) !== step) continue;
      const outcomes = shape.outcomes as FunnelOutcome[];
      const n = num(shape.n);
      const result = finalOutcome(outcomes);
      const shown = outcomes.includes('shown');
      // `shown` OR a terminal row: a not_applicable alone is not a visit.
      const reached = shown || outcomes.some((o) => o === 'completed' || o === 'skipped');
      if (reached) row.reached += n;
      if (reached && !shown) row.shown_missing += n;
      if (result === 'completed') row.completed += n;
      else if (result === 'skipped') row.skipped += n;
      else if (result === 'not_applicable') row.not_applicable += n;
      else if (reached && !shape.account_completed) row.dropped += n;
    }
    const previous = steps[steps.length - 1];
    if (previous && previous.reached > 0) {
      row.conversion_pct = round1((row.reached / previous.reached) * 100);
    }
    steps.push(row);
  }

  const t = totals[0] ?? {};
  return {
    mode: 'funnel',
    env: opts.env,
    flow_version: ONBOARDING_FLOW_VERSION,
    cohort: {
      guided_signups: num(t.signups),
      onboarding_completed: num(t.completed),
      finish_completed: num(t.finish_completed),
      whatsapp_connected_within_7d_of_finish: num(t.wa_7d),
      since: opts.since ? opts.since.toISOString() : null,
      until: opts.until ? opts.until.toISOString() : null,
    },
    steps,
    by_signup_week: weekRows.map((r) => ({
      week: String(r.week),
      signups: num(r.signups),
      intro_reached: num(r.intro_reached),
      finish_reached: num(r.finish_reached),
      completed: num(r.completed),
    })),
  };
}

// ------------------------------------------------------------------ output

function table(headers: string[], rows: (string | number | null)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map((c) => (c === null ? '-' : String(c))))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => r[i].length)));
  return cells
    .map((r, idx) => {
      const line = r.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
      return idx === 0 ? `${line}\n${widths.map((w) => '-'.repeat(w)).join('  ')}` : line;
    })
    .join('\n');
}

export function renderBaseline(b: Baseline): string {
  const items = table(
    ['item', 'cohort', 'done', 'ever', 'with_ts', 'p25h', 'p50h', 'p75h', 'p90h', '<=1h', '<=24h', '<=7d'],
    b.items.map((r) => [
      r.item, r.cohort, r.done_now, r.ever, r.with_timestamp,
      r.hours_p25, r.hours_p50, r.hours_p75, r.hours_p90,
      r.within_1h, r.within_24h, r.within_7d,
    ]),
  );
  const gaps = b.items.map((r) => `  ${r.item}: ${r.timestamp}${r.gap ? ` | gap: ${r.gap}` : ''}`).join('\n');
  const weeks = table(
    ['signup_week', 'accounts', 'profile', 'whatsapp', 'availability', 'services', 'testMessage', 'complete'],
    b.by_signup_week.map((w) => [
      w.week, w.accounts, w.profile, w.whatsapp, w.availability, w.services, w.testMessage, w.complete,
    ]),
  );
  return [
    `legacy accounts: ${b.cohort.legacy_accounts} (created before ${b.cohort.before}${b.cohort.since ? `, since ${b.cohort.since}` : ''})`,
    '',
    items,
    '',
    'timestamps and gaps:',
    gaps,
    '',
    'by signup week (done now):',
    weeks,
  ].join('\n');
}

export function renderFunnel(f: Funnel): string {
  const steps = table(
    ['step', 'reached', 'no_shown', 'completed', 'skipped', 'n/a', 'dropped', 'conv%', 'p50min', 'p90min'],
    f.steps.map((r) => [
      r.step, r.reached, r.shown_missing, r.completed, r.skipped, r.not_applicable,
      r.dropped, r.conversion_pct, r.minutes_p50, r.minutes_p90,
    ]),
  );
  const weeks = table(
    ['signup_week', 'signups', 'intro', 'finish', 'completed'],
    f.by_signup_week.map((w) => [w.week, w.signups, w.intro_reached, w.finish_reached, w.completed]),
  );
  const c = f.cohort;
  return [
    `guided signups: ${c.guided_signups}, onboarding completed: ${c.onboarding_completed}, finish completed: ${c.finish_completed}, WhatsApp connected within 7 days of finish: ${c.whatsapp_connected_within_7d_of_finish}`,
    `events: app_env=${f.env}, flow_version=${f.flow_version}${c.since ? `, since ${c.since}` : ''}${c.until ? `, until ${c.until}` : ''}`,
    '',
    steps,
    '',
    'by signup week:',
    weeks,
  ].join('\n');
}

// -------------------------------------------------------------------- main

function parseDate(name: string, value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`--${name} must be an ISO date or time, got '${value}'`);
  }
  return d;
}

export type CliOptions = {
  mode: 'funnel' | 'baseline';
  json: boolean;
  before: Date;
  since?: Date;
  until?: Date;
  env: AppEnv;
};

export function parseCli(argv: string[], now: Date = new Date()): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: 'boolean', default: false },
      before: { type: 'string' },
      since: { type: 'string' },
      until: { type: 'string' },
      env: { type: 'string' },
    },
  });
  const mode = positionals[0];
  if (mode !== 'funnel' && mode !== 'baseline') {
    throw new Error("Usage: onboarding-funnel.ts <funnel|baseline> [--json] [--before T] [--since T] [--until T] [--env E]");
  }
  const env = values.env ?? appEnv();
  if (!isAppEnv(env)) {
    throw new Error(`--env must be one of ${APP_ENVS.join(', ')}, got '${env}'`);
  }
  return {
    mode,
    json: values.json ?? false,
    before: parseDate('before', values.before) ?? now,
    since: parseDate('since', values.since),
    until: parseDate('until', values.until),
    env,
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  assertEnvironmentIntegrity();
  const opts = parseCli(argv);
  const result: Funnel | Baseline = await db.transaction(
    async (tx): Promise<Funnel | Baseline> =>
      opts.mode === 'funnel'
        ? guidedFunnel(tx, { env: opts.env, since: opts.since, until: opts.until })
        : legacyBaseline(tx, { before: opts.before, since: opts.since, until: opts.until }),
    { accessMode: 'read only' },
  );
  const header = {
    app_env: appEnv(),
    supabase_project: supabaseProjectRefFromDatabaseUrl(process.env.DATABASE_URL),
    generated_at: new Date().toISOString(),
  };
  if (opts.json) {
    console.log(JSON.stringify({ ...header, ...result }, null, 2));
  } else {
    console.log(
      `onboarding ${opts.mode}: ${header.app_env} (${header.supabase_project}), generated ${header.generated_at}\n`,
    );
    console.log(result.mode === 'funnel' ? renderFunnel(result) : renderBaseline(result));
  }
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
