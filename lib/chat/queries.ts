import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import type { ChatListRowSnapshot } from '@/lib/pwa/read-models';

export async function getUnreadChatCount(accountId: string): Promise<number> {
  const rows = await db.execute<{ value: number }>(sql`
    SELECT count(*)::integer AS value
    FROM conversations c
    WHERE c.account_id = ${accountId}
      AND c.closed_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.role = 'customer'
          AND m.created_at > COALESCE(c.last_read_at, '-infinity'::timestamptz)
      )
  `);
  return rows[0]?.value ?? 0;
}

/**
 * Rows per chat-list page. OFFSET-based (see `getChatListPage`): a small page so
 * "load more" stays responsive and the SSR payload stays lean.
 */
export const CHAT_LIST_PAGE_SIZE = 30;

export type ChatListPage = {
  rows: ChatListRowSnapshot[];
  /** Zero-based index of the page that was fetched. */
  page: number;
  /** Whether a further page exists after this one. */
  hasMore: boolean;
};

/**
 * postgres-js parses `timestamptz` columns from a raw `db.execute` into JS
 * `Date` objects (see node_modules/postgres types: oid 1184 → `new Date`), but
 * the snapshot contract is string ISO timestamps (matching `getChatThreadSnapshot`
 * and keeping the value cleanly serializable across the RSC / server-action
 * boundary). Normalize to ISO here and keep the `string` type — do not switch the
 * contract to `Date`. Accepts either a `Date` or an already-string value.
 */
function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * One OFFSET-based page of the PT's conversation list, newest activity first with
 * needs-you (escalated / AI-off) conversations floated to the top. Pure and
 * `accountId`-parameterized so it is directly unit-testable; the "load more" server
 * action wraps it after resolving the PT via auth.
 *
 * OFFSET pagination can shift rows across page boundaries when new activity
 * arrives mid-scroll; the realtime refresher resets the list to page 0, so the
 * window self-heals rather than requiring a stable cursor. `c.id` is the final
 * ORDER BY tiebreaker so equal-timestamp rows keep a deterministic order across
 * page fetches.
 *
 * Fetches one extra row to derive `hasMore` without a second COUNT query.
 */
export async function getChatListPage(
  accountId: string,
  input: { status?: 'active' | 'closed'; query?: string; page?: number } = {},
): Promise<ChatListPage> {
  const closed = input.status === 'closed';
  const query = input.query?.trim();
  const rawPage = input.page ?? 0;
  const page =
    Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 0;
  const pageSize = CHAT_LIST_PAGE_SIZE;

  const rows = await db.execute<ChatListRowSnapshot>(sql`
    SELECT
      c.id,
      c.ai_active,
      c.escalation_state,
      p.name AS customer_name,
      m.content AS last_content,
      m.role AS last_role,
      m.created_at AS last_at,
      c.closed_at,
      c.ai_paused_until,
      c.ai_pause_reason,
      (
        SELECT count(*)::integer
        FROM messages unread
        WHERE unread.conversation_id = c.id
          AND unread.role = 'customer'
          AND unread.created_at > COALESCE(c.last_read_at, '-infinity'::timestamptz)
      ) AS unread_count
    FROM conversations c
    JOIN customers p ON p.id = c.customer_id
    LEFT JOIN LATERAL (
      SELECT content, role, created_at
      FROM messages
      WHERE messages.conversation_id = c.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) m ON true
    WHERE c.account_id = ${accountId}
      AND ${closed ? sql`c.closed_at IS NOT NULL` : sql`c.closed_at IS NULL`}
      ${
        query
          ? sql`AND (
              p.name ILIKE ${`%${query}%`}
              OR p.phone ILIKE ${`%${query}%`}
              OR EXISTS (
                SELECT 1 FROM messages searched
                WHERE searched.conversation_id = c.id
                  AND searched.content ILIKE ${`%${query}%`}
              )
            )`
          : sql``
      }
    ORDER BY
      CASE WHEN c.escalation_state <> 'idle' OR c.ai_active = false THEN 0 ELSE 1 END,
      COALESCE(m.created_at, c.created_at) DESC,
      c.id DESC
    LIMIT ${pageSize + 1} OFFSET ${page * pageSize}
  `);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;

  return {
    page,
    hasMore,
    rows: pageRows.map((row) => ({
      ...row,
      last_at: toIso(row.last_at),
      closed_at: toIso(row.closed_at),
      ai_paused_until: toIso(row.ai_paused_until),
    })),
  };
}
