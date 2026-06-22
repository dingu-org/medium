import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { EmptyState } from '@/components/states';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { StatusPill } from '@/components/ui/status-pill';
import { privacyName } from '@/lib/format/name';
import { getChatListSnapshot } from '@/lib/pwa/read-models';
import { createServerClient } from '@/lib/supabase/server';
import { t } from '@/lib/i18n';

export const metadata = { title: `${t.chat.title} · Medium` };

export default async function ChatPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const ptId = user.id;

  const rows = await getChatListSnapshot(ptId);

  return (
    <div className="space-y-3">
      <RealtimeRefresher table="conversations" filter={`pt_id=eq.${ptId}`} />
      <h2 className="text-lg font-semibold">{t.chat.title}</h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t.chat.emptyTitle}
          description={t.chat.emptyText}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const unread = row.last_role === 'patient';
            return (
              <li key={row.id}>
                <Link
                  href={`/chat/${row.id}`}
                  className="flex items-center gap-3 rounded-[10px] border border-border bg-card p-3 shadow-[var(--shadow-card)] transition-colors hover:bg-muted/60"
                >
                  <InitialsAvatar
                    name={privacyName(row.patient_name)}
                    dotTone={unread ? 'danger' : undefined}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {privacyName(row.patient_name)}
                      </span>
                      <StatusPill tone={row.ai_active ? 'brand' : 'success'} dot>
                        {row.ai_active ? t.chat.aiBadge : t.chat.youBadge}
                      </StatusPill>
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {row.last_content
                        ? `${row.last_role === 'patient' ? '' : t.chat.youPrefix}${row.last_content}`
                        : t.chat.noMessagesYet}
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
