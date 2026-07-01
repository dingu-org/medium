'use client';

import { MessageSquare, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { EmptyState } from '@/components/states';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusPill } from '@/components/ui/status-pill';
import { privacyName } from '@/lib/format/name';
import type { ChatListRowSnapshot } from '@/lib/pwa/read-models';

export function ChatList({
  ptId,
  rows,
  status,
  query: initialQuery,
}: {
  ptId: string;
  rows: ChatListRowSnapshot[];
  status: 'active' | 'closed';
  query: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsYou =
    status === 'active'
      ? rows.filter((row) => row.escalation_state !== 'idle' || !row.ai_active)
      : [];
  const managed =
    status === 'active'
      ? rows.filter((row) => row.escalation_state === 'idle' && row.ai_active)
      : rows;

  function navigate(nextStatus: 'active' | 'closed', nextQuery = query) {
    const params = new URLSearchParams();
    if (nextStatus === 'closed') params.set('tab', 'closed');
    if (nextQuery.trim()) params.set('q', nextQuery.trim());
    router.replace(`/chat${params.size ? `?${params}` : ''}`, {
      scroll: false,
    });
  }

  function search(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(status, value), 250);
  }

  return (
    <div className="space-y-4">
      <RealtimeRefresher table="conversations" filter={`pt_id=eq.${ptId}`} />
      <RealtimeRefresher table="messages" filter={`pt_id=eq.${ptId}`} />
      <SegmentedControl
        ariaLabel="Gjendja e bisedave"
        value={status}
        onValueChange={(value) => navigate(value as 'active' | 'closed')}
        options={[
          { value: 'active', label: 'Aktive' },
          { value: 'closed', label: 'Mbyllura' },
        ]}
        className="w-full"
      />
      <div className="relative">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => search(event.target.value)}
          className="pr-9 pl-9"
          placeholder="Kërko bisedat…"
          aria-label="Kërko bisedat"
        />
        {query && (
          <button
            type="button"
            onClick={() => search('')}
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
            aria-label="Pastro kërkimin"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={query ? Search : MessageSquare}
          title={
            query
              ? 'Asnjë rezultat'
              : status === 'closed'
                ? 'Asnjë bisedë e mbyllur'
                : 'Ende asnjë bisedë'
          }
          description={
            query
              ? 'Provo një emër, numër ose mesazh tjetër.'
              : 'Bisedat shfaqen kur klientët të shkruajnë në WhatsApp.'
          }
        />
      ) : (
        <>
          {needsYou.length > 0 && (
            <ConversationGroup title="Kërkon ty" rows={needsYou} />
          )}
          {managed.length > 0 && (
            <ConversationGroup
              title={status === 'closed' ? 'Të mbyllura' : 'Medium po menaxhon'}
              rows={managed}
            />
          )}
        </>
      )}
    </div>
  );
}

function ConversationGroup({
  title,
  rows,
}: {
  title: string;
  rows: ChatListRowSnapshot[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-muted-foreground px-1 text-xs font-semibold uppercase">
        {title}
      </h2>
      <div className="border-border bg-card overflow-hidden rounded-md border shadow-[var(--shadow-card)]">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/chat/${row.id}`}
            className="border-border hover:bg-muted/50 flex min-h-[68px] items-center gap-3 border-b px-4 py-3 last:border-b-0"
          >
            <InitialsAvatar
              name={privacyName(row.patient_name)}
              dotTone={row.unread_count > 0 ? 'danger' : undefined}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">
                  {privacyName(row.patient_name)}
                </span>
                <span className="flex items-center gap-1">
                  {row.unread_count > 0 && (
                    <span className="bg-destructive flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                      {row.unread_count > 9 ? '9+' : row.unread_count}
                    </span>
                  )}
                  <StatusPill tone={row.ai_active ? 'brand' : 'success'} dot>
                    {row.ai_active ? 'Medium' : 'Ti'}
                  </StatusPill>
                </span>
              </span>
              <span className="text-muted-foreground mt-1 block truncate text-sm">
                {row.last_content ?? 'Ende pa mesazhe'}
              </span>
              {row.ai_pause_reason === 'whatsapp_business_app_echo' && (
                <span className="mt-1 block text-xs text-[var(--warning-700)]">
                  Në pauzë nga WhatsApp Business
                </span>
              )}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
