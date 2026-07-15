'use client';

import {
  Archive,
  Bell,
  CircleGauge,
  HandHeart,
  Link2Off,
  Pause,
  Phone,
  RefreshCw,
  WifiOff,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { t } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';
import { ChatComposer } from '@/components/chat/composer';
import { ChatNotice } from '@/components/chat/notice';
import { ChatStatusRow, type ChatHandlingMode } from '@/components/chat/status-row';
import { ChatSysLine } from '@/components/chat/sys-line';
import { NavBar } from '@/components/dashboard/nav-bar';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { RoundButton } from '@/components/ui/round-button';
import { formatDayLabel, formatTime } from '@/lib/i18n/datetime';
import { type LiveMessage, useMessages } from '@/lib/hooks/realtime';
import {
  PWA_MUTATION_FAILED_EVENT,
  PWA_MUTATION_SYNCED_EVENT,
  removeMutation,
} from '@/lib/pwa/client-store';
import {
  queueMessageSend,
  type QueueMutationResult,
} from '@/lib/pwa/mutation-client';
import { setTakeover } from '../actions';
import {
  markConversationRead,
  sendUpcomingReminderTemplate,
  setConversationClosed,
} from '../actions';
import { fetchOlderMessages } from '../pagination-actions';
import { useOnlineStatus } from '@/lib/hooks/realtime';

type Props = {
  conversationId: string;
  patientName: string;
  patientPhone: string;
  initialMessages: LiveMessage[];
  aiActive: boolean;
  windowOpen: boolean;
  closed: boolean;
  escalationState: string;
  aiPausedUntil: string | null;
  aiPauseReason: string | null;
  connectionStatus: string | null;
  upcomingAppointment: { startsAt: string; serviceType: string | null } | null;
  capReached?: boolean;
};

type OptimisticMessage = LiveMessage & {
  clientMutationId: string;
  pending?: boolean;
  failed?: boolean;
};

function isOptimisticMessage(
  message: LiveMessage | OptimisticMessage,
): message is OptimisticMessage {
  return 'clientMutationId' in message;
}

export function ChatThread({
  conversationId,
  patientName,
  patientPhone,
  initialMessages,
  aiActive: initialAiActive,
  windowOpen: initialWindowOpen,
  closed: initialClosed,
  escalationState,
  aiPausedUntil,
  aiPauseReason,
  connectionStatus,
  upcomingAppointment,
  capReached = false,
}: Props) {
  const router = useRouter();
  const { messages, mergeMessages } = useMessages(
    conversationId,
    initialMessages,
  );
  const [aiActive, setAiActive] = useState(initialAiActive);
  const [windowClosed, setWindowClosed] = useState(!initialWindowOpen);
  const [closed, setClosed] = useState(initialClosed);

  // Reconcile server-derived status with local optimistic state: when
  // router.refresh() delivers a new seeding-prop value (escalation, takeover,
  // close, or a fresh inbound that reopens the window — possibly from another
  // device), adopt it. Guarding on the previous prop value preserves optimistic
  // updates applied between refreshes. This is the React "storing info from
  // previous renders" pattern; the set fires during render, not in an effect.
  const prevInitialAiActive = useRef(initialAiActive);
  if (prevInitialAiActive.current !== initialAiActive) {
    prevInitialAiActive.current = initialAiActive;
    setAiActive(initialAiActive);
  }
  const prevInitialWindowOpen = useRef(initialWindowOpen);
  if (prevInitialWindowOpen.current !== initialWindowOpen) {
    prevInitialWindowOpen.current = initialWindowOpen;
    setWindowClosed(!initialWindowOpen);
  }
  const prevInitialClosed = useRef(initialClosed);
  if (prevInitialClosed.current !== initialClosed) {
    prevInitialClosed.current = initialClosed;
    setClosed(initialClosed);
  }

  const [draft, setDraft] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [sending, startSend] = useTransition();
  const [, startToggle] = useTransition();
  const [statePending, startStateTransition] = useTransition();
  const online = useOnlineStatus();
  const bottomRef = useRef<HTMLDivElement>(null);
  // Older-message pagination. `hasOlder` seeds from the initial batch size (a
  // full page implies more history) and is then driven by each fetch's hasMore.
  const [hasOlder, setHasOlder] = useState(initialMessages.length >= 50);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Set right before a prepend so the layout effect can restore the viewport
  // once the older rows have rendered (see below).
  const prependAdjustRef = useRef<{
    prevHeight: number;
    prevTop: number;
  } | null>(null);
  // Tracks the newest rendered message id so the auto-scroll fires on a genuinely
  // new message, never on an older-page prepend.
  const lastMessageIdRef = useRef<string | null>(null);
  const visibleMessages = useMemo(
    () =>
      [...messages, ...optimisticMessages].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    [messages, optimisticMessages],
  );
  const latestPersistedMessageId = useMemo(
    () =>
      [...messages]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .at(-1)?.id ?? null,
    [messages],
  );
  // The oldest persisted message drives the keyset cursor. Pick the minimum
  // (createdAt, id) tuple explicitly — `messages` is ordered by createdAt only,
  // so among equal timestamps the smallest id must still win, or a load-older
  // fetch could re-pull an already-loaded row at the boundary.
  const oldestPersisted = useMemo(() => {
    let oldest: LiveMessage | null = null;
    for (const m of messages) {
      if (
        !oldest ||
        m.createdAt < oldest.createdAt ||
        (m.createdAt === oldest.createdAt && m.id < oldest.id)
      ) {
        oldest = m;
      }
    }
    return oldest;
  }, [messages]);
  const hasFailed = optimisticMessages.some((m) => m.failed === true);

  const paused = Boolean(
    aiPauseReason && aiPausedUntil && new Date(aiPausedUntil) > new Date(),
  );
  const escalated = escalationState !== 'idle' && !closed;
  const mode: ChatHandlingMode = escalated
    ? 'escalated'
    : !aiActive
      ? 'you'
      : paused
        ? 'paused'
        : 'ai';

  // Restore the reading position after an older-page prepend: the new rows add
  // height above the viewport, so shift scrollTop by the height delta to keep the
  // same content under the PT's eyes. Runs before paint so there is no visible
  // jump. No-op unless a prepend just set the ref.
  useLayoutEffect(() => {
    const adjust = prependAdjustRef.current;
    if (!adjust) return;
    prependAdjustRef.current = null;
    const scroller = document.scrollingElement;
    if (!scroller) return;
    scroller.scrollTop = adjust.prevTop + (scroller.scrollHeight - adjust.prevHeight);
  }, [visibleMessages]);

  // Auto-scroll to the newest message — but only when the newest message id
  // actually changes (a new inbound/outbound/optimistic row), never when older
  // history is prepended above the current view.
  useEffect(() => {
    const newestId = visibleMessages.at(-1)?.id ?? null;
    if (newestId === lastMessageIdRef.current) return;
    lastMessageIdRef.current = newestId;
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages]);

  // Mark the conversation read — but only while the tab/PWA is actually visible,
  // so a message that arrives in the background doesn't silently clear its unread
  // badge before the PT has seen it. If hidden, defer until the document next
  // becomes visible, marking through whatever the latest persisted id is by then.
  useEffect(() => {
    if (!latestPersistedMessageId) return;
    const id = latestPersistedMessageId;
    function markRead() {
      void markConversationRead(conversationId, id).then(() =>
        router.refresh(),
      );
    }
    if (document.visibilityState === 'visible') markRead();
    function onVisible() {
      if (document.visibilityState === 'visible') markRead();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [conversationId, latestPersistedMessageId, router]);

  useEffect(() => {
    function onSynced(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setOptimisticMessages((items) =>
        items.filter((item) => item.clientMutationId !== id),
      );
    }
    function onFailed(event: Event) {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      setOptimisticMessages((items) =>
        items.map((item) =>
          item.clientMutationId === id
            ? { ...item, pending: false, failed: true }
            : item,
        ),
      );
    }
    window.addEventListener(PWA_MUTATION_SYNCED_EVENT, onSynced);
    window.addEventListener(PWA_MUTATION_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(PWA_MUTATION_SYNCED_EVENT, onSynced);
      window.removeEventListener(PWA_MUTATION_FAILED_EVENT, onFailed);
    };
  }, []);

  function onToggle(checked: boolean) {
    setAiActive(checked);
    startToggle(async () => {
      await setTakeover(conversationId, !checked);
      router.refresh();
    });
  }

  function markSendFailed(clientMutationId: string) {
    setOptimisticMessages((items) =>
      items.map((item) =>
        item.clientMutationId === clientMutationId
          ? { ...item, pending: false, failed: true }
          : item,
      ),
    );
  }

  // Shared handling for a send result, used by both the initial send and a
  // retry so the two can never diverge in how they apply sent/queued/failed.
  function handleSendResult(
    clientMutationId: string,
    res: QueueMutationResult,
  ) {
    if (res.status === 'sent') {
      setOptimisticMessages((items) =>
        items.filter((item) => item.clientMutationId !== clientMutationId),
      );
      setAiActive(false);
      setWindowClosed(false);
      router.refresh();
      return;
    }
    if (res.status === 'queued') {
      // Bubble stays pending; background replay finishes it — an offline send
      // once online, or a persist_pending reply once the server completes the
      // local write (recovered under the same id, no second WhatsApp send).
      setAiActive(false);
      toast.success(
        res.reason === 'offline' ? t.chat.msgQueued : t.chat.msgQueuedRetry,
      );
      return;
    }
    markSendFailed(clientMutationId);
    if (res.code === 'outside_window') setWindowClosed(true);
    toast.error(res.error);
  }

  function onSend() {
    const body = draft.trim();
    if (!body) return;
    const clientMutationId = crypto.randomUUID();
    setDraft('');
    // Clamp the optimistic timestamp to just after the newest message already on
    // screen: a client clock skewed into the past would otherwise sort the bubble
    // into the middle of history instead of at the bottom.
    const newest = visibleMessages.at(-1);
    const newestMs = newest ? new Date(newest.createdAt).getTime() + 1 : 0;
    const createdAt = new Date(Math.max(Date.now(), newestMs)).toISOString();
    setOptimisticMessages((items) => [
      ...items,
      {
        id: `pending-${clientMutationId}`,
        clientMutationId,
        role: 'pt',
        content: body,
        createdAt,
        pending: true,
      },
    ]);
    startSend(async () => {
      try {
        handleSendResult(
          clientMutationId,
          await queueMessageSend({ clientMutationId, conversationId, body }),
        );
      } catch (error) {
        markSendFailed(clientMutationId);
        toast.error(
          error instanceof Error ? error.message : t.chat.msgQueueError,
        );
      }
    });
  }

  function toggleClosed() {
    startStateTransition(async () => {
      const next = !closed;
      const result = await setConversationClosed(conversationId, next);
      if (!result.ok) return;
      setClosed(next);
      setAiActive(!next);
      router.refresh();
    });
  }

  function sendReminder() {
    startStateTransition(async () => {
      const result = await sendUpcomingReminderTemplate(conversationId);
      if (result.ok) {
        toast.success(t.chat.reminderSent);
        setAiActive(false);
        router.refresh();
      } else {
        toast.error(result.error ?? t.chat.reminderFailed);
      }
    });
  }

  // Re-send a failed message under its ORIGINAL clientMutationId so the server
  // recovers idempotently (replays a stored success, or finishes the DB write
  // for an already-delivered Graph send) instead of minting a new id and sending
  // the patient a duplicate WhatsApp message. The original body is resent
  // verbatim — no edit on retry — so the transcript matches what Graph delivered.
  function retryFailed(message: OptimisticMessage) {
    setOptimisticMessages((items) =>
      items.map((item) =>
        item.clientMutationId === message.clientMutationId
          ? { ...item, pending: true, failed: false }
          : item,
      ),
    );
    startSend(async () => {
      try {
        // Clear any inert failed queue record for this id first, so the sync
        // indicator's failed count doesn't linger after a direct online retry.
        await removeMutation(message.clientMutationId);
        handleSendResult(
          message.clientMutationId,
          await queueMessageSend({
            clientMutationId: message.clientMutationId,
            conversationId,
            body: message.content,
          }),
        );
      } catch (error) {
        markSendFailed(message.clientMutationId);
        toast.error(
          error instanceof Error ? error.message : t.chat.msgQueueError,
        );
      }
    });
  }

  // Fetch one older keyset page and prepend it. Captures the scroll geometry
  // before the merge so the layout effect can hold the viewport steady once the
  // rows render; trusts the returned hasMore for whether the affordance stays.
  async function loadOlder() {
    if (loadingOlder || !hasOlder || !oldestPersisted) return;
    setLoadingOlder(true);
    const scroller = document.scrollingElement;
    const prevHeight = scroller?.scrollHeight ?? 0;
    const prevTop = scroller?.scrollTop ?? 0;
    try {
      const res = await fetchOlderMessages({
        conversationId,
        cursor: {
          createdAt: oldestPersisted.createdAt,
          id: oldestPersisted.id,
        },
      });
      if (res.messages.length > 0) {
        prependAdjustRef.current = { prevHeight, prevTop };
        mergeMessages(res.messages);
      }
      setHasOlder(res.hasMore);
    } catch {
      // Leave `hasOlder` set so the button stays available for another attempt.
    } finally {
      setLoadingOlder(false);
    }
  }

  const composerVisible = !closed && connectionStatus !== null;
  const composerState =
    connectionStatus === 'revoked'
      ? ('revoked' as const)
      : windowClosed
        ? ('windowClosed' as const)
        : ('default' as const);

  return (
    <div className="-mx-4 -mt-4 flex flex-col">
      <div className="bg-background sticky top-0 z-10">
        <NavBar
          backHref="/chat"
          title={patientName}
          right={
            <>
              <RoundButton asChild aria-label={t.chat.callPatient}>
                <a href={`tel:${patientPhone}`}>
                  <Phone className="h-[18px] w-[18px]" aria-hidden />
                </a>
              </RoundButton>
              <RoundButton
                onClick={toggleClosed}
                disabled={statePending}
                aria-label={
                  closed ? t.chat.reopenConversation : t.chat.closeConversation
                }
              >
                {closed ? (
                  <RefreshCw className="h-[18px] w-[18px]" aria-hidden />
                ) : (
                  <Archive className="h-[18px] w-[18px]" aria-hidden />
                )}
              </RoundButton>
            </>
          }
        />
        <ChatStatusRow
          mode={mode}
          aiActive={aiActive}
          onToggle={onToggle}
          disabled={closed || statePending}
        />
        {capReached && (
          <ChatNotice tone="warning" icon={CircleGauge}>
            {t.chat.noticeCapReached}
          </ChatNotice>
        )}
        {escalated && (
          <ChatNotice tone="danger" icon={Bell}>
            {t.chat.noticeEscalated}
          </ChatNotice>
        )}
        {mode === 'you' && !escalated && (
          <ChatNotice
            tone="success"
            icon={HandHeart}
            action={
              <button
                type="button"
                onClick={() => onToggle(true)}
                disabled={statePending}
              >
                {t.chat.handBack}
              </button>
            }
          >
            {t.chat.noticeTakeover}
          </ChatNotice>
        )}
        {mode === 'paused' && aiPausedUntil && (
          <ChatNotice
            tone="warning"
            icon={Pause}
            action={
              <button
                type="button"
                onClick={() => onToggle(true)}
                disabled={statePending}
              >
                {t.chat.resume}
              </button>
            }
          >
            {t.chat.noticePaused(formatTime(new Date(aiPausedUntil)))}
          </ChatNotice>
        )}
        {!online && (
          <ChatNotice tone="info" icon={WifiOff}>
            {t.chat.noticeOffline}
          </ChatNotice>
        )}
        {closed && (
          <ChatNotice tone="info" icon={Archive}>
            {t.chat.noticeClosed}
          </ChatNotice>
        )}
        {connectionStatus === null && (
          <ChatNotice
            tone="warning"
            icon={Link2Off}
            action={
              <Link href="/settings" className="underline-offset-2">
                {t.chat.connectNow}
              </Link>
            }
          >
            {t.chat.noticeNotConnected}
          </ChatNotice>
        )}
        {hasFailed && (
          <ChatNotice tone="danger" icon={X}>
            {t.chat.noticeFailed}
          </ChatNotice>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-[11px] px-4 py-4">
        {hasOlder && (
          <div className="flex justify-center pb-1">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-ink-2 bg-[#ecece7] rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-opacity disabled:opacity-50"
            >
              {loadingOlder ? t.chat.loadingOlder : t.chat.loadOlder}
            </button>
          </div>
        )}
        {visibleMessages.map((m, index) => {
          const previous = visibleMessages[index - 1];
          const newDay =
            !previous ||
            new Date(previous.createdAt).toDateString() !==
              new Date(m.createdAt).toDateString();
          const grouped = Boolean(
            !newDay &&
              previous &&
              previous.role === m.role &&
              new Date(m.createdAt).getTime() -
                new Date(previous.createdAt).getTime() <
                3 * 60_000,
          );
          return (
            <div key={m.id} className={grouped ? '-mt-2' : undefined}>
              {newDay && (
                <ChatSysLine>
                  {formatDayLabel(new Date(m.createdAt))}
                </ChatSysLine>
              )}
              <ChatBubble
                role={m.role}
                content={m.content}
                createdAt={m.createdAt}
                deliveryStatus={m.deliveryStatus ?? null}
                pending={'pending' in m ? m.pending === true : false}
                failed={'failed' in m ? m.failed === true : false}
                grouped={grouped}
              />
              {isOptimisticMessage(m) && m.failed === true && (
                <button
                  type="button"
                  className="text-primary mt-1 ml-auto block font-mono text-[11px] font-semibold"
                  onClick={() => retryFailed(m)}
                >
                  · {t.chat.retry}
                </button>
              )}
            </div>
          );
        })}
        {escalated && <ChatSysLine>{t.chat.sysStopped}</ChatSysLine>}
        {windowClosed && !closed && connectionStatus === 'active' && (
          <ChatSysLine>{t.chat.sysWindowClosed}</ChatSysLine>
        )}
        <div ref={bottomRef} className="h-24" />
      </div>

      {/* Composer — pinned above the bottom safe area */}
      {composerVisible && (
        <ChatComposer
          state={composerState}
          draft={draft}
          onDraftChange={setDraft}
          onSend={onSend}
          onSendTemplate={sendReminder}
          sending={sending}
          templateAvailable={Boolean(
            upcomingAppointment && connectionStatus === 'active',
          )}
          templatePending={statePending}
        />
      )}
    </div>
  );
}
