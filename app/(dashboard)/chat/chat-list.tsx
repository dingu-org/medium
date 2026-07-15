'use client';

import { MessageSquare, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { EmptyState } from '@/components/states';
import { CountBadge } from '@/components/ui/count-badge';
import { HandledBy, type HandledByWho } from '@/components/ui/handled-by';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Input } from '@/components/ui/input';
import { SectionLabel } from '@/components/ui/section-label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { privacyName } from '@/lib/format/name';
import { t } from '@/lib/i18n';
import { formatRelativeShort } from '@/lib/i18n/datetime';
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
  const searchParams = useSearchParams();
  const searchOpen = searchParams.get('search') === '1' || !!initialQuery;
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
    if (searchOpen) params.set('search', '1');
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
      {/* conversations is subscribed app-wide in the dashboard layout; here we
          only need messages, since AI replies insert message rows without
          touching conversations. */}
      <RealtimeRefresher table="messages" filter={`pt_id=eq.${ptId}`} />
      <SegmentedControl
        ariaLabel="Gjendja e bisedave"
        value={status}
        onValueChange={(value) => navigate(value as 'active' | 'closed')}
        options={[
          { value: 'active', label: t.chat.tabActive },
          { value: 'closed', label: t.chat.tabClosed },
        ]}
        className="flex w-full"
      />
      {searchOpen && (
        <div className="relative">
          <Search
            className="text-ink-3 absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => search(event.target.value)}
            className="h-11 rounded-full pr-10 pl-11"
            placeholder={t.chat.searchPlaceholder}
            aria-label={t.chat.searchLabel}
            autoFocus
          />
          {query && (
            <button
              type="button"
              onClick={() => search('')}
              className="text-ink-3 absolute top-1/2 right-4 -translate-y-1/2"
              aria-label={t.chat.searchClear}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={query ? Search : MessageSquare}
          title={
            query
              ? t.chat.searchEmptyTitle
              : status === 'closed'
                ? t.chat.emptyClosedTitle
                : t.chat.emptyTitle
          }
          description={query ? t.chat.searchEmptyText : t.chat.emptyText}
          className="pt-16"
        />
      ) : (
        <>
          {needsYou.length > 0 && (
            <ConversationGroup
              title={t.chat.listNeedsYou}
              danger
              rows={needsYou}
            />
          )}
          {managed.length > 0 && (
            <ConversationGroup
              title={
                status === 'closed' ? t.chat.listClosed : t.chat.listManaged
              }
              rows={managed}
              closed={status === 'closed'}
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
  danger = false,
  closed = false,
}: {
  title: string;
  rows: ChatListRowSnapshot[];
  danger?: boolean;
  closed?: boolean;
}) {
  return (
    <section>
      <SectionLabel danger={danger}>{title}</SectionLabel>
      <div className="overflow-hidden rounded-lg bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
        {rows.map((row) => {
          const alert = row.escalation_state !== 'idle';
          const who: HandledByWho = closed
            ? 'closed'
            : row.ai_active
              ? 'ai'
              : 'you';
          const emphasized = alert || row.unread_count > 0;
          return (
            <Link
              key={row.id}
              href={`/chat/${row.id}`}
              className="hover:bg-muted/50 flex items-center gap-[13px] px-4 py-[13px]"
            >
              <InitialsAvatar
                name={privacyName(row.patient_name)}
                size={44}
                dotTone={alert ? 'danger' : who === 'you' ? 'success' : 'brand'}
              />
              <span className="min-w-0 flex-1">
                <span className="mb-[3px] flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold tracking-[-0.005em]">
                    {privacyName(row.patient_name)}
                  </span>
                  {row.last_at && (
                    <span className="text-ink-3 shrink-0 font-mono text-[11.5px] whitespace-nowrap">
                      {formatRelativeShort(new Date(row.last_at))}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      emphasized
                        ? 'min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground'
                        : 'text-ink-2 min-w-0 flex-1 truncate text-[13.5px]'
                    }
                  >
                    {row.last_content ?? t.chat.noMessages}
                  </span>
                  {alert ? (
                    <span className="text-destructive inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap">
                      <span
                        className="bg-destructive h-[7px] w-[7px] rounded-full"
                        aria-hidden
                      />
                      {t.chat.listNeedsYou}
                    </span>
                  ) : (
                    <HandledBy who={who} />
                  )}
                  {row.unread_count > 0 && <CountBadge n={row.unread_count} />}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
