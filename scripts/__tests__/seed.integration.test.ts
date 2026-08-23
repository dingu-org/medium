import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  conversations,
  messages,
  customers,
  accounts,
} from '@/lib/db/schema';
import { deleteSeedAccount, seedCore, SeedResult } from '../seed';

let result: SeedResult;

afterAll(async () => {
  await deleteSeedAccount();
});

describe('seedCore', () => {
  beforeAll(async () => {
    result = await seedCore();
  });

  it('creates exactly one accounts row with a filled-in profile', async () => {
    const rows = await db.select().from(accounts).where(eq(accounts.id, result.accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Fizio Vita');
    expect(rows[0].timezone).toBe('Europe/Tirane');
  });

  it('creates exactly one customer with an E.164 phone', async () => {
    const rows = await db
      .select()
      .from(customers)
      .where(eq(customers.accountId, result.accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0].phone).toMatch(/^\+355\d+$/);
    expect(rows[0].waId).not.toBeNull();
  });

  it('creates Mon-Fri 09:00-17:00 availability rules', async () => {
    const rows = await db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.accountId, result.accountId));
    expect(rows).toHaveLength(5);
    const weekdays = rows.map((r) => r.weekday).sort((a, b) => a - b);
    expect(weekdays).toEqual([1, 2, 3, 4, 5]);
    for (const row of rows) {
      expect(row.startTime).toBe('09:00:00');
      expect(row.endTime).toBe('17:00:00');
    }
  });

  it('creates one past (completed) and one upcoming (confirmed) appointment', async () => {
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.accountId, result.accountId));
    expect(rows).toHaveLength(2);

    const now = Date.now();
    const past = rows.find((r) => r.status === 'completed');
    const upcoming = rows.find((r) => r.status === 'confirmed');
    expect(past).toBeDefined();
    expect(upcoming).toBeDefined();

    expect(new Date(past!.startsAt).getTime()).toBeLessThan(now);

    const upcomingStart = new Date(upcoming!.startsAt);
    expect(upcomingStart.getTime()).toBeGreaterThan(now);
    const weekday = upcomingStart.getDay();
    expect(weekday).toBeGreaterThanOrEqual(1);
    expect(weekday).toBeLessThanOrEqual(5);
    const hour = upcomingStart.getHours();
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(17);
  });

  it('creates exactly one open conversation', async () => {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.accountId, result.accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(result.conversationId);
    expect(rows[0].closedAt).toBeNull();
    expect(rows[0].channel).toBe('whatsapp');
  });

  it('creates exactly 5 messages in the conversation, ordered and mixed roles', async () => {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, result.conversationId))
      .orderBy(asc(messages.createdAt));
    expect(rows).toHaveLength(5);

    for (const row of rows) {
      expect(['customer', 'ai']).toContain(row.role);
    }
    expect(rows.some((r) => r.role === 'customer')).toBe(true);
    expect(rows.some((r) => r.role === 'ai')).toBe(true);

    expect(rows.map((r) => r.role)).toEqual([
      'customer',
      'ai',
      'customer',
      'ai',
      'customer',
    ]);
    expect(rows[0].content).toBe(
      'Përshëndetje, dua të lë një takim këtë javë.',
    );
    expect(rows[4].content).toBe('15:00 është mirë, faleminderit.');
  });

  it('is idempotent: rerunning leaves exactly one PT / one customer / 5 messages', async () => {
    const second = await seedCore();

    const accountRows = await db.select().from(accounts).where(eq(accounts.id, second.accountId));
    expect(accountRows).toHaveLength(1);

    const customerRows = await db
      .select()
      .from(customers)
      .where(eq(customers.accountId, second.accountId));
    expect(customerRows).toHaveLength(1);

    const messageRows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, second.conversationId));
    expect(messageRows).toHaveLength(5);

    // The first run's PT no longer exists (self-delete cascaded away its rows).
    const staleAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.accountId, result.accountId));
    expect(staleAppointments).toHaveLength(0);

    result = second;
  });
});
