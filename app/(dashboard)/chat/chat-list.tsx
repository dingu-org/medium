'use client';

import { MessageSquare, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
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
import { loadMoreConversations } from './pagination-actions';

export function ChatList({
  accountId,
  rows,
  hasMore: initialHasMore,
  status,
  query: initialQuery,
}: {
  accountId: string;
  rows: ChatListRowSnapshot[];
  hasMore: boolean;
  status: 'active' | 'closed';
  query: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchOpen = searchParams.get('search') === '1' || !!initialQuery;
  const [query, setQuery] = useState(initialQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `rows` / `initialHasMore` are page 0 from the server; later pages accumulate
  // here via the load-more action. A fresh server render (tab switch, search, or
  // realtime refresh) hands us a new `rows` array — reset the accumulated pages
  // so the OFFSET window can't drift out of sync with page 0.
  const [extraRows, setExtraRows] = useState<ChatListRowSnapshot[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, startLoadMore] = useTransition();
  const [baseRows, setBaseRows] = useState(rows);
  if (rows !== baseRows) {
    setBaseRows(rows);
    setExtraRows([]);
    setPage(0);
    setHasMore(initialHasMore);
  }

  // OFFSET paging can occasionally re-surface a page-0 row on a later page when
  // new activity arrives mid-scroll; dedupe by id so React keys stay unique.
  const allRows = useMemo(() => {
    const seen = new Set<string>();
    const merged: ChatListRowSnapshot[] = [];
    for (const row of [...rows, ...extraRows]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    return merged;
  }, [rows, extraRows]);

  const needsYou =
    status === 'active'
      ? allRows.filter(
          (row) => row.escalation_state !== 'idle' || !row.ai_active,
        )
      : [];
  const managed =
    status === 'active'
      ? allRows.filter(
          (row) => row.escalation_state === 'idle' && row.ai_active,
        )
      : allRows;

  function loadMore() {
    startLoadMore(async () => {
      const result = await loadMoreConversations({
        status,
        query: initialQuery.trim() || undefined,
        page: page + 1,
      });
      setExtraRows((prev) => [...prev, ...result.rows]);
      setPage(result.page);
      setHasMore(result.hasMore);
    });
  }

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
      <RealtimeRefresher table="messages" filter={`account_id=eq.${accountId}`} />
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

      {allRows.length === 0 ? (
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
          className="account-16"
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
          {hasMore && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? t.chat.loadingMore : t.chat.loadMore}
            </Button>
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
          // The assistant is temporarily paused (e.g. WhatsApp Business app echo)
          // while `ai_active` stays true — mirror the thread's paused check so the
          // row shows a distinct paused badge instead of the misleading plain AI one.
          const paused = Boolean(
            row.ai_pause_reason &&
              row.ai_paused_until &&
              new Date(row.ai_paused_until) > new Date(),
          );
          const who: HandledByWho = closed
            ? 'closed'
            : !row.ai_active
              ? 'you'
              : paused
                ? 'paused'
                : 'ai';
          const emphasized = alert || row.unread_count > 0;
          // Sender marker on the preview line: the PT's own replies and the
          // assistant's replies are prefixed; customer messages stay bare. Kept as
          // plain text inside the truncating span so it shares the one clipped line.
          const previewPrefix =
            row.last_content == null
              ? ''
              : row.last_role === 'account'
                ? t.chat.youPrefix
                : row.last_role === 'ai'
                  ? t.chat.aiPrefix
                  : '';
          return (
            <Link
              key={row.id}
              href={`/chat/${row.id}`}
              className="hover:bg-muted/50 flex items-center gap-[13px] px-4 py-[13px]"
            >
              <InitialsAvatar
                name={privacyName(row.customer_name)}
                size={44}
                dotTone={
                  alert
                    ? 'danger'
                    : who === 'you'
                      ? 'success'
                      : who === 'paused'
                        ? 'warning'
                        : 'brand'
                }
              />
              <span className="min-w-0 flex-1">
                <span className="mb-[3px] flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold tracking-[-0.005em]">
                    {privacyName(row.customer_name)}
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
                    {previewPrefix}
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
