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
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ChatComposer } from '@/components/chat/composer';
import { ChatNotice } from '@/components/chat/notice';
import { ChatStatusRow, type ChatHandlingMode } from '@/components/chat/status-row';
import { ChatSysLine } from '@/components/chat/sys-line';
import { NavBar } from '@/components/dashboard/nav-bar';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { RoundButton } from '@/components/ui/round-button';
import { formatDayLabel, formatTime } from '@/lib/i18n/datetime';
import { type LiveMessage, useMessages } from '@/lib/hooks/realtime';
import {
  PWA_MUTATION_FAILED_EVENT,
  PWA_MUTATION_SYNCED_EVENT,
} from '@/lib/pwa/client-store';
import { queueMessageSend } from '@/lib/pwa/mutation-client';
import { setTakeover } from '../actions';
import {
  markConversationRead,
  sendUpcomingReminderTemplate,
  setConversationClosed,
} from '../actions';
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
  const { messages } = useMessages(conversationId, initialMessages);
  const [aiActive, setAiActive] = useState(initialAiActive);
  const [windowClosed, setWindowClosed] = useState(!initialWindowOpen);
  const [closed, setClosed] = useState(initialClosed);
  const [draft, setDraft] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [sending, startSend] = useTransition();
  const [, startToggle] = useTransition();
  const [statePending, startStateTransition] = useTransition();
  const online = useOnlineStatus();
  const bottomRef = useRef<HTMLDivElement>(null);
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

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length]);

  useEffect(() => {
    if (!latestPersistedMessageId) return;
    void markConversationRead(conversationId, latestPersistedMessageId).then(
      () => router.refresh(),
    );
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

  function onSend() {
    const body = draft.trim();
    if (!body) return;
    const clientMutationId = crypto.randomUUID();
    setDraft('');
    setOptimisticMessages((items) => [
      ...items,
      {
        id: `pending-${clientMutationId}`,
        clientMutationId,
        role: 'pt',
        content: body,
        createdAt: new Date().toISOString(),
        pending: true,
      },
    ]);
    startSend(async () => {
      try {
        const res = await queueMessageSend({
          clientMutationId,
          conversationId,
          body,
        });
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
          setAiActive(false);
          toast.success(
            res.reason === 'offline' ? t.chat.msgQueued : t.chat.msgQueuedRetry,
          );
          return;
        }
        setOptimisticMessages((items) =>
          items.map((item) =>
            item.clientMutationId === clientMutationId
              ? { ...item, pending: false, failed: true }
              : item,
          ),
        );
        if (res.error.includes('24-hour')) setWindowClosed(true);
        toast.error(res.error);
      } catch (error) {
        setOptimisticMessages((items) =>
          items.map((item) =>
            item.clientMutationId === clientMutationId
              ? { ...item, pending: false, failed: true }
              : item,
          ),
        );
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

  function retryFailed(message: OptimisticMessage) {
    setOptimisticMessages((items) =>
      items.filter(
        (item) => item.clientMutationId !== message.clientMutationId,
      ),
    );
    setDraft(message.content);
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
      <SnapshotCache
        cacheKey={`chat:${conversationId}`}
        kind="chat"
        payload={{
          conversationId,
          patientName,
          patientPhone,
          initialMessages: messages,
          aiActive,
          windowOpen: !windowClosed,
        }}
      />
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
