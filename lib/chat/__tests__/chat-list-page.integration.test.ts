import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { conversations, messages, customers } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { CHAT_LIST_PAGE_SIZE, getChatListPage } from '../queries';

let accountId = '';
const total = CHAT_LIST_PAGE_SIZE + 5;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `chat-list-page-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;

  const base = Date.now() - total * 60_000;
  for (let i = 0; i < total; i += 1) {
    const [customer] = await db
      .insert(customers)
      .values({
        accountId,
        name: `Client ${i}`,
        phone: `+3556900${String(i).padStart(5, '0')}`,
      })
      .returning({ id: customers.id });
    const [conversation] = await db
      .insert(conversations)
      .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    await db.insert(messages).values({
      accountId,
      conversationId: conversation.id,
      role: 'customer',
      channel: 'whatsapp',
      content: `msg ${i}`,
      // Ascending send times so ordering is deterministic across pages.
      createdAt: new Date(base + i * 60_000),
    });
  }
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('getChatListPage', () => {
  it('pages with OFFSET, reports hasMore, and never overlaps a boundary', async () => {
    const p0 = await getChatListPage(accountId, { status: 'active', page: 0 });
    expect(p0.page).toBe(0);
    expect(p0.rows).toHaveLength(CHAT_LIST_PAGE_SIZE);
    expect(p0.hasMore).toBe(true);

    const p1 = await getChatListPage(accountId, { status: 'active', page: 1 });
    expect(p1.page).toBe(1);
    expect(p1.rows).toHaveLength(total - CHAT_LIST_PAGE_SIZE);
    expect(p1.hasMore).toBe(false);

    const idsPage0 = new Set(p0.rows.map((r) => r.id));
    expect(p1.rows.some((r) => idsPage0.has(r.id))).toBe(false);
  });

  it('normalizes raw execute timestamps to ISO strings, not Date objects', async () => {
    const { rows } = await getChatListPage(accountId, { status: 'active', page: 0 });
    const withActivity = rows.find((r) => r.last_at !== null);
    expect(withActivity).toBeDefined();
    expect(typeof withActivity?.last_at).toBe('string');
    expect(withActivity?.last_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('coerces an out-of-range page down to 0', async () => {
    const negative = await getChatListPage(accountId, { status: 'active', page: -3 });
    expect(negative.page).toBe(0);
    expect(negative.rows).toHaveLength(CHAT_LIST_PAGE_SIZE);
  });
});
