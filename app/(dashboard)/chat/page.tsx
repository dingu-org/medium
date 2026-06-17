import { sql } from 'drizzle-orm';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { EmptyState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/db';
import { privacyName } from '@/lib/format/name';
import { createServerClient } from '@/lib/supabase/server';

export const metadata = { title: 'Chat · Medium' };

type Row = {
  id: string;
  ai_active: boolean;
  escalation_state: string;
  patient_name: string;
  last_content: string | null;
  last_role: 'patient' | 'ai' | 'pt' | null;
  last_at: string | null;
};

export default async function ChatPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const ptId = user.id;

  const rows = await db.execute<Row>(sql`
    SELECT
      c.id,
      c.ai_active,
      c.escalation_state,
      p.name AS patient_name,
      m.content AS last_content,
      m.role AS last_role,
      m.created_at AS last_at
    FROM conversations c
    JOIN patients p ON p.id = c.patient_id
    LEFT JOIN LATERAL (
      SELECT content, role, created_at
      FROM messages
      WHERE messages.conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) m ON true
    WHERE c.pt_id = ${ptId}
    ORDER BY COALESCE(c.last_inbound_at, c.created_at) DESC
    LIMIT 50
  `);

  return (
    <div className="space-y-3">
      <RealtimeRefresher table="conversations" filter={`pt_id=eq.${ptId}`} />
      <h2 className="text-lg font-semibold">Chats</h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="When a patient messages your WhatsApp number, their chat appears here."
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const unread = row.last_role === 'patient';
            return (
              <li key={row.id}>
                <Link
                  href={`/chat/${row.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {privacyName(row.patient_name).slice(0, 2).toUpperCase()}
                    {unread && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {privacyName(row.patient_name)}
                      </span>
                      <Badge
                        variant={row.ai_active ? 'secondary' : 'default'}
                        className="shrink-0"
                      >
                        {row.ai_active ? 'AI' : 'You'}
                      </Badge>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {row.last_content
                        ? `${row.last_role === 'patient' ? '' : 'You: '}${row.last_content}`
                        : 'No messages yet'}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
