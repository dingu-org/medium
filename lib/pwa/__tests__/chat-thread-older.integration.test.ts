import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { conversations, messages, customers } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import type { ChatMessageSnapshot } from '../read-models';
import { getChatThreadSnapshot, getOlderChatMessages } from '../read-models';

let accountId = '';
let otherAccountId = '';
let conversationId = '';

// >50 so the thread snapshot fills a page and there is older history to walk;
// enough here for two older keyset pages so `hasMore` is seen both true and false.
const TOTAL = 130;
const PAGE = 50;

// Row-wise "strictly before" on the (createdAt, id) keyset — the same ordering
// the query paginates on. Canonical uuids compare byte-wise in Postgres, which
// matches JS string comparison of their lowercase hex form.
function tupleLt(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): boolean {
  return (
    a.createdAt < b.createdAt ||
    (a.createdAt === b.createdAt && a.id < b.id)
  );
}

beforeAll(async () => {
  const sb = createServiceClient();

  const owner = await sb.auth.admin.createUser({
    email: `chat-older-a-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (owner.error || !owner.data.user)
    throw owner.error ?? new Error('Missing owner user');
  accountId = owner.data.user.id;

  const other = await sb.auth.admin.createUser({
    email: `chat-older-b-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (other.error || !other.data.user)
    throw other.error ?? new Error('Missing other user');
  otherAccountId = other.data.user.id;

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Older Client', phone: '+355690000300' })
    .returning({ id: customers.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  // Seed with DB-default timestamps: a single insert shares one `now()`, so every
  // row carries an identical created_at and the keyset is driven entirely through
  // its (created_at, id) id-tiebreaker branch.
  await db.insert(messages).values(
    Array.from({ length: TOTAL }, (_, i) => ({
      accountId,
      conversationId,
      role: 'account' as const,
      channel: 'whatsapp',
      content: `msg ${i}`,
    })),
  );
});

afterAll(async () => {
  const sb = createServiceClient();
  if (accountId) await sb.auth.admin.deleteUser(accountId);
  if (otherAccountId) await sb.auth.admin.deleteUser(otherAccountId);
});

async function page1Cursor(): Promise<{
  page: ChatMessageSnapshot[];
  cursor: { createdAt: string; id: string };
}> {
  const snap = await getChatThreadSnapshot(accountId, conversationId);
  const page = snap?.initialMessages ?? [];
  // The thread snapshot is the newest page, returned ascending, so its first
  // element is the oldest loaded message — exactly the keyset cursor.
  return { page, cursor: { createdAt: page[0].createdAt, id: page[0].id } };
}

describe('getOlderChatMessages · keyset pagination', () => {
  it('returns the previous batch, strictly older, ascending, disjoint from page 1', async () => {
    const { page, cursor } = await page1Cursor();
    expect(page).toHaveLength(PAGE);

    const older = await getOlderChatMessages(accountId, conversationId, cursor);

    expect(older.messages).toHaveLength(PAGE);
    expect(older.hasMore).toBe(true);

    // Every returned row is strictly older than the cursor.
    for (const m of older.messages) {
      expect(tupleLt(m, cursor)).toBe(true);
    }

    // The page itself is ascending on the keyset.
    for (let i = 1; i < older.messages.length; i += 1) {
      expect(tupleLt(older.messages[i - 1], older.messages[i])).toBe(true);
    }

    // No id appears in both page 1 and the older page.
    const page1Ids = new Set(page.map((m) => m.id));
    expect(older.messages.some((m) => page1Ids.has(m.id))).toBe(false);
  });

  it('walks every page and flips hasMore false on the last', async () => {
    const { page, cursor: firstCursor } = await page1Cursor();

    const seen = new Set(page.map((m) => m.id));
    let cursor = firstCursor;
    let lastHasMore = true;
    let guard = 0;

    while (guard < 10) {
      guard += 1;
      const older = await getOlderChatMessages(accountId, conversationId, cursor);
      for (const m of older.messages) {
        // Nothing is returned twice across the whole walk.
        expect(seen.has(m.id)).toBe(false);
        seen.add(m.id);
      }
      lastHasMore = older.hasMore;
      if (!older.hasMore) break;
      const oldest = older.messages[0];
      cursor = { createdAt: oldest.createdAt, id: oldest.id };
    }

    expect(lastHasMore).toBe(false);
    // Page 1 + every older page reconstructs the full history exactly once.
    expect(seen.size).toBe(TOTAL);
  });

  it('enforces account tenancy — another account pages nothing', async () => {
    const { cursor } = await page1Cursor();

    const older = await getOlderChatMessages(otherAccountId, conversationId, cursor);

    expect(older.messages).toHaveLength(0);
    expect(older.hasMore).toBe(false);
  });
});
