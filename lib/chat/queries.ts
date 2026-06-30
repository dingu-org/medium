import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export async function getUnreadChatCount(ptId: string): Promise<number> {
  const rows = await db.execute<{ value: number }>(sql`
    SELECT count(*)::integer AS value
    FROM conversations c
    WHERE c.pt_id = ${ptId}
      AND c.closed_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.role = 'patient'
          AND m.created_at > COALESCE(c.last_read_at, '-infinity'::timestamptz)
      )
  `);
  return rows[0]?.value ?? 0;
}
