import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  accounts,
  availabilityRules,
  conversationDays,
  conversations,
  customers,
  messages,
  onboardingEvents,
  services,
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  excludedEmails,
  guidedFunnel,
  INTERNAL_EMAILS,
  legacyBaseline,
  main,
  renderBaseline,
  renderFunnel,
} from '../onboarding-funnel';
import { SEED_EMAIL } from '../seed';

const RUN = Date.now();
const LEGACY_CREATED = new Date('2001-01-08T00:00:00Z'); // Monday, ISO 2001-W02
const GUIDED_CREATED = new Date('2002-03-04T00:00:00Z'); // Monday, ISO 2002-W10
const LEGACY_WINDOW = {
  since: new Date('2001-01-01T00:00:00Z'),
  before: new Date('2001-02-01T00:00:00Z'),
};
const GUIDED_WINDOW = {
  since: new Date('2002-01-01T00:00:00Z'),
  until: new Date('2003-01-01T00:00:00Z'),
};

const hours = (h: number) => new Date(LEGACY_CREATED.getTime() + h * 3_600_000);

type Seeded = { id: string; email: string; name: string };
const created: string[] = [];
const emails: string[] = [];
const names: string[] = [];
let seq = 0;

async function newAccount(kind: string): Promise<Seeded> {
  const email = `onb-funnel-${kind}-${RUN}-${++seq}@example.com`;
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: 'onb-funnel-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  created.push(data.user.id);
  emails.push(email);
  const name = `Zq Secret Business ${kind} ${seq}`;
  names.push(name);
  return { id: data.user.id, email, name };
}

async function configure(
  id: string,
  set: Partial<typeof accounts.$inferInsert>,
) {
  await db.update(accounts).set(set).where(eq(accounts.id, id));
}

async function connect(
  accountId: string,
  status: 'active' | 'revoked',
  connectedAt: Date,
) {
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `ONB_FUNNEL_${RUN}_${++seq}`,
    wabaId: `WABA_${RUN}_${seq}`,
    status,
    connectedAt,
  });
}

async function rule(accountId: string) {
  await db
    .insert(availabilityRules)
    .values({ accountId, weekday: 1, startTime: '09:00', endTime: '17:00' });
}

async function service(accountId: string, active = true) {
  await db
    .insert(services)
    .values({ accountId, name: `Svc ${RUN} ${++seq}`, durationMin: 30, active });
}

let internalLegacy: Seeded;
let internalGuided: Seeded;

beforeAll(async () => {
  // --- legacy cohort (see the expectations in the baseline test)
  const l1 = await newAccount('l1');
  await configure(l1.id, {
    name: l1.name,
    onboardingFlow: 'legacy',
    createdAt: LEGACY_CREATED,
    servicesConfiguredAt: hours(2),
  });
  await connect(l1.id, 'active', hours(1));
  await rule(l1.id);
  await service(l1.id);
  const [cust] = await db
    .insert(customers)
    .values({ accountId: l1.id, name: 'Zq Customer', phone: '+355690000001' })
    .returning({ id: customers.id });
  const [conv] = await db
    .insert(conversations)
    .values({ accountId: l1.id, customerId: cust.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  await db.insert(messages).values({
    accountId: l1.id,
    conversationId: conv.id,
    role: 'customer',
    channel: 'whatsapp',
    content: 'hello',
    createdAt: hours(3),
  });

  const l2 = await newAccount('l2');
  await configure(l2.id, {
    name: l2.name,
    onboardingFlow: 'legacy',
    createdAt: LEGACY_CREATED,
  });
  await connect(l2.id, 'revoked', hours(10));
  await rule(l2.id);
  await db.insert(conversationDays).values({
    accountId: l2.id,
    localDay: '2001-01-09',
    monthKey: '2001-01',
    createdAt: hours(30),
  });

  const l3 = await newAccount('l3');
  await configure(l3.id, {
    name: '  ',
    onboardingFlow: 'legacy',
    createdAt: LEGACY_CREATED,
    planStepSeenAt: hours(5),
  });

  const l4 = await newAccount('l4');
  await configure(l4.id, {
    name: l4.name,
    onboardingFlow: 'legacy',
    createdAt: LEGACY_CREATED,
    servicesConfiguredAt: hours(48),
  });
  await service(l4.id);

  internalLegacy = await newAccount('l-internal');
  await configure(internalLegacy.id, {
    name: internalLegacy.name,
    onboardingFlow: 'legacy',
    createdAt: LEGACY_CREATED,
  });

  // A guided account inside the legacy window must not be counted.
  const stray = await newAccount('stray');
  await configure(stray.id, { name: stray.name, createdAt: LEGACY_CREATED });

  // --- guided cohort
  const at = (min: number) => new Date(GUIDED_CREATED.getTime() + min * 60_000);
  type Ev = [
    typeof onboardingEvents.$inferInsert.step,
    typeof onboardingEvents.$inferInsert.outcome,
    number,
    string?,
  ];
  async function events(accountId: string, list: Ev[]) {
    await db.insert(onboardingEvents).values(
      list.map(([step, outcome, min, env]) => ({
        accountId,
        step,
        outcome,
        flowVersion: 1,
        appEnv: env ?? 'development',
        occurredAt: at(min),
      })),
    );
  }

  const g1 = await newAccount('g1');
  await configure(g1.id, {
    name: g1.name,
    onboardingFlow: 'guided',
    createdAt: GUIDED_CREATED,
    onboardingCompletedAt: at(60),
  });
  await events(g1.id, [
    ['intro', 'shown', 0],
    ['intro', 'completed', 2],
    ['business', 'shown', 2],
    ['business', 'completed', 5],
    ['services', 'shown', 5],
    ['services', 'completed', 9],
    ['where', 'not_applicable', 10],
    ['availability', 'shown', 10],
    ['availability', 'completed', 12],
    ['whatsapp', 'shown', 12],
    ['whatsapp', 'skipped', 13],
    ['notifications', 'shown', 13],
    ['notifications', 'skipped', 14],
    ['finish', 'shown', 14],
    ['finish', 'completed', 20],
  ]);
  await connect(g1.id, 'active', new Date(at(20).getTime() + 86_400_000));

  const g2 = await newAccount('g2');
  await configure(g2.id, {
    name: g2.name,
    onboardingFlow: 'guided',
    createdAt: GUIDED_CREATED,
  });
  await events(g2.id, [
    ['intro', 'shown', 0],
    ['intro', 'completed', 4],
    ['business', 'shown', 4],
    ['services', 'shown', 4, 'production'], // another environment: not counted
  ]);

  const g3 = await newAccount('g3');
  await configure(g3.id, {
    name: g3.name,
    onboardingFlow: 'guided',
    createdAt: GUIDED_CREATED,
  });
  await events(g3.id, [
    ['intro', 'completed', 3], // beacon lost: no shown row
    ['whatsapp', 'shown', 4],
    ['whatsapp', 'skipped', 5],
    ['whatsapp', 'completed', 8], // skipped, then connected: completed wins
  ]);

  const g4 = await newAccount('g4');
  await configure(g4.id, {
    name: g4.name,
    onboardingFlow: 'guided',
    createdAt: GUIDED_CREATED,
    onboardingCompletedAt: at(30),
  });
  await events(g4.id, [
    ['intro', 'shown', 0],
    ['intro', 'completed', 6],
    ['business', 'shown', 6], // no exit, but onboarding completed: not dropped
  ]);

  internalGuided = await newAccount('g-internal');
  await configure(internalGuided.id, {
    name: internalGuided.name,
    onboardingFlow: 'guided',
    createdAt: GUIDED_CREATED,
  });
  await events(internalGuided.id, [
    ['intro', 'shown', 0],
    ['intro', 'completed', 1],
  ]);
});

afterAll(async () => {
  for (const id of created) {
    await createServiceClient().auth.admin.deleteUser(id);
  }
});

const readOnly = { accessMode: 'read only' } as const;

describe('legacyBaseline', () => {
  it('counts, percentiles and gap flags for the legacy cohort', async () => {
    const b = await db.transaction(
      (tx) =>
        legacyBaseline(tx, {
          ...LEGACY_WINDOW,
          excluded: [...excludedEmails(), internalLegacy.email.toLowerCase()],
        }),
      readOnly,
    );
    const item = (name: string) => b.items.find((i) => i.item === name)!;

    expect(b.cohort.legacy_accounts).toBe(4);
    expect(item('profile')).toMatchObject({
      cohort: 4,
      done_now: 3,
      with_timestamp: 0,
      hours_p50: null,
      timestamp: 'none',
    });
    expect(item('profile').gap).toMatch(/no timestamp/);
    expect(item('whatsapp')).toMatchObject({
      done_now: 1,
      ever: 2, // the revoked connection connected once
      with_timestamp: 2,
      hours_p50: 5.5,
      hours_p90: 9.1,
      within_1h: 1,
      within_24h: 2,
      within_7d: 2,
    });
    expect(item('availability')).toMatchObject({ done_now: 2, with_timestamp: 0 });
    expect(item('services')).toMatchObject({
      done_now: 2,
      with_timestamp: 2,
      within_24h: 1,
      within_7d: 2,
    });
    expect(item('services').timestamp).toMatch(/upper bound/);
    expect(item('testMessage')).toMatchObject({
      done_now: 1,
      ever: 2, // l2 only has a conversation_day
      with_timestamp: 2,
      within_24h: 1,
      within_7d: 2,
    });
    expect(item('plan')).toMatchObject({
      done_now: 1,
      with_timestamp: 1,
      hours_p50: 5,
    });
    expect(item('complete')).toMatchObject({
      done_now: 1,
      ever: 1,
      with_timestamp: 1,
      hours_p50: 3, // lower bound: the latest known item time
    });
    expect(item('complete').timestamp).toMatch(/lower bound/);

    expect(b.by_signup_week).toEqual([
      {
        week: '2001-W02',
        accounts: 4,
        profile: 3,
        whatsapp: 1,
        availability: 2,
        services: 2,
        testMessage: 1,
        complete: 1,
      },
    ]);
  });

  it('only counts accounts created before the cutoff', async () => {
    const b = await db.transaction(
      (tx) =>
        legacyBaseline(tx, {
          since: LEGACY_WINDOW.since,
          before: new Date('2001-01-07T00:00:00Z'),
        }),
      readOnly,
    );
    expect(b.cohort.legacy_accounts).toBe(0);
  });

  it('excludes the seed, QA and admin addresses in SQL', async () => {
    expect(INTERNAL_EMAILS).toContain(SEED_EMAIL);
    expect(excludedEmails(' Boss@Example.com, ,x@y.z ')).toEqual([
      ...INTERNAL_EMAILS,
      'boss@example.com',
      'x@y.z',
    ]);
    // The seeded internal account is in the cohort unless its address is excluded.
    const b = await db.transaction(
      (tx) => legacyBaseline(tx, { ...LEGACY_WINDOW }),
      readOnly,
    );
    expect(b.cohort.legacy_accounts).toBe(5);
  });
});

describe('guidedFunnel', () => {
  async function run() {
    return db.transaction(
      (tx) =>
        guidedFunnel(tx, {
          ...GUIDED_WINDOW,
          env: 'development',
          excluded: [...excludedEmails(), internalGuided.email.toLowerCase()],
        }),
      readOnly,
    );
  }

  it('reports reached, completed, skipped, not_applicable and dropped per step', async () => {
    const f = await run();
    const step = (name: string) => f.steps.find((s) => s.step === name)!;

    expect(f.steps.map((s) => s.step)).toEqual([
      'intro',
      'business',
      'services',
      'where',
      'availability',
      'whatsapp',
      'notifications',
      'finish',
    ]);
    expect(f.cohort).toMatchObject({
      guided_signups: 4,
      onboarding_completed: 2,
      finish_completed: 1,
      whatsapp_connected_within_7d_of_finish: 1,
    });
    expect(step('intro')).toMatchObject({
      reached: 4,
      shown_missing: 1,
      completed: 4,
      dropped: 0,
      conversion_pct: null,
      minutes_p50: 4,
      minutes_p90: 5.6,
    });
    expect(step('business')).toMatchObject({
      reached: 3,
      completed: 1,
      skipped: 0,
      dropped: 1, // g2; g4 has no exit but onboarding completed
      conversion_pct: 75,
    });
    expect(step('services')).toMatchObject({
      reached: 1, // g2's production-env event is filtered out
      completed: 1,
      dropped: 0,
    });
    expect(step('where')).toMatchObject({
      reached: 0,
      not_applicable: 1,
      completed: 0,
    });
    expect(step('availability')).toMatchObject({ reached: 1, completed: 1 });
    expect(step('whatsapp')).toMatchObject({
      reached: 2,
      completed: 1, // g3: skipped then completed
      skipped: 1, // g1
      dropped: 0,
    });
    expect(step('notifications')).toMatchObject({ reached: 1, skipped: 1 });
    expect(step('finish')).toMatchObject({ reached: 1, completed: 1 });
    expect(f.by_signup_week).toEqual([
      {
        week: '2002-W10',
        signups: 4,
        intro_reached: 4,
        finish_reached: 1,
        completed: 2,
      },
    ]);
  });

  it('filters events by environment', async () => {
    const f = await db.transaction(
      (tx) => guidedFunnel(tx, { ...GUIDED_WINDOW, env: 'production' }),
      readOnly,
    );
    const services = f.steps.find((s) => s.step === 'services')!;
    expect(services.reached).toBe(1); // only g2's production row
    expect(f.steps.find((s) => s.step === 'intro')!.reached).toBe(0);
  });
});

describe('output', () => {
  function secretsIn(text: string): string[] {
    return [...emails, ...names, 'Zq Customer'].filter((s) => text.includes(s));
  }

  it('never prints a seeded email or name (tables and JSON, both modes)', async () => {
    const lines: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...a) => {
      lines.push(a.join(' '));
    });
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const transaction = vi.spyOn(db, 'transaction');
    let calls: unknown[][] = [];
    try {
      for (const argv of [
        ['funnel', '--since', '2002-01-01', '--until', '2003-01-01'],
        ['funnel', '--json', '--since', '2002-01-01', '--until', '2003-01-01'],
        ['baseline', '--since', '2001-01-01', '--before', '2001-02-01'],
        ['baseline', '--json', '--since', '2001-01-01', '--before', '2001-02-01'],
      ]) {
        await main(argv);
      }
    } finally {
      calls = [...transaction.mock.calls];
      log.mockRestore();
      exit.mockRestore();
      transaction.mockRestore();
    }
    const out = lines.join('\n');
    expect(out).toContain('2002-W10');
    expect(out).toContain('2001-W02');
    expect(secretsIn(out)).toEqual([]);
    // Every query ran in a read-only transaction.
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call[1]).toEqual({ accessMode: 'read only' });
    }
  });

  it('rendered tables and result objects carry no identifiers', async () => {
    const [b, f] = await db.transaction(
      async (tx) =>
        Promise.all([
          legacyBaseline(tx, { ...LEGACY_WINDOW }),
          guidedFunnel(tx, { ...GUIDED_WINDOW, env: 'development' }),
        ]),
      readOnly,
    );
    const text = [
      renderBaseline(b),
      renderFunnel(f),
      JSON.stringify(b),
      JSON.stringify(f),
    ].join('\n');
    expect(secretsIn(text)).toEqual([]);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-/);
  });

  it('a write inside the read-only transaction is rejected by Postgres', async () => {
    await expect(
      db.transaction(
        (tx) => tx.delete(onboardingEvents).where(eq(onboardingEvents.step, 'intro')),
        readOnly,
      ),
    ).rejects.toThrow();
  });
});
