'use client';

import {
  Archive,
  ChevronLeft,
  Clock,
  RefreshCw,
  Send,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { t } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { AppBanner } from '@/components/ui/app-banner';
import { Button } from '@/components/ui/button';
import { ChatBubble } from '@/components/ui/chat-bubble';
import { StatusPill } from '@/components/ui/status-pill';
import { Switch } from '@/components/ui/switch';
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
  initialMessages: LiveMessage[];
  aiActive: boolean;
  windowOpen: boolean;
  closed: boolean;
  escalationState: string;
  aiPausedUntil: string | null;
  aiPauseReason: string | null;
  connectionStatus: string | null;
  upcomingAppointment: { startsAt: string; serviceType: string | null } | null;
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
  initialMessages,
  aiActive: initialAiActive,
  windowOpen: initialWindowOpen,
  closed: initialClosed,
  escalationState,
  aiPausedUntil,
  aiPauseReason,
  connectionStatus,
  upcomingAppointment,
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
        toast.success('Kujtesa u dërgua.');
        setAiActive(false);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Kujtesa nuk u dërgua.');
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

  return (
    <div className="flex flex-col">
      <SnapshotCache
        cacheKey={`chat:${conversationId}`}
        kind="chat"
        payload={{
          conversationId,
          patientName,
          initialMessages: messages,
          aiActive,
          windowOpen: !windowClosed,
        }}
      />
      {/* Sub-header */}
      <div className="border-border bg-background/95 sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b px-4 py-2 backdrop-blur">
        <Link
          href="/chat"
          aria-label={t.chat.backToChats}
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{patientName}</p>
            <StatusPill tone={aiActive ? 'brand' : 'success'} dot>
              {aiActive ? t.chat.aiBadge : t.chat.youBadge}
            </StatusPill>
          </div>
          <p className="text-muted-foreground text-xs">
            {aiActive ? t.chat.aiHandlingDesc : t.chat.youHandlingDesc}
          </p>
        </div>
        <label className="text-muted-foreground flex items-center gap-2 text-xs">
          <span className="hidden sm:inline">{t.chat.letAiRespond}</span>
          <Switch
            checked={aiActive}
            onCheckedChange={onToggle}
            disabled={closed || statePending}
            aria-label={t.chat.letAiRespond}
          />
        </label>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={toggleClosed}
          disabled={statePending}
          aria-label={closed ? 'Rihap bisedën' : 'Mbyll bisedën'}
        >
          {closed ? (
            <RefreshCw className="h-4 w-4" aria-hidden />
          ) : (
            <Archive className="h-4 w-4" aria-hidden />
          )}
        </Button>
      </div>

      {!online && (
        <AppBanner
          tone="warning"
          icon={WifiOff}
          className="-mx-4 border-x-0 border-t-0 text-xs"
        >
          Je jashtë linje. Mesazhet e reja do të radhiten.
        </AppBanner>
      )}
      {closed && (
        <AppBanner tone="info" className="-mx-4 border-x-0 border-t-0 text-xs">
          Kjo bisedë është mbyllur. Mesazhi i ardhshëm i klientit do ta rihapë.
        </AppBanner>
      )}
      {connectionStatus === 'revoked' && (
        <AppBanner
          tone="danger"
          className="-mx-4 border-x-0 border-t-0 text-xs"
        >
          Lidhja WhatsApp është revokuar.{' '}
          <Link href="/settings" className="font-semibold underline">
            Rilidhe
          </Link>
        </AppBanner>
      )}
      {connectionStatus === null && (
        <AppBanner
          tone="warning"
          className="-mx-4 border-x-0 border-t-0 text-xs"
        >
          WhatsApp nuk është i lidhur.{' '}
          <Link href="/settings" className="font-semibold underline">
            Lidhe tani
          </Link>
        </AppBanner>
      )}
      {escalationState !== 'idle' && !closed && (
        <AppBanner
          tone="warning"
          className="-mx-4 border-x-0 border-t-0 text-xs"
        >
          Medium ta ka kaluar këtë bisedë. Merr përsipër përgjigjen.
        </AppBanner>
      )}
      {aiPauseReason === 'whatsapp_business_app_echo' &&
        aiPausedUntil &&
        !closed && (
          <AppBanner
            tone="warning"
            className="-mx-4 border-x-0 border-t-0 text-xs"
          >
            AI është në pauzë sepse u dërgua një mesazh nga WhatsApp Business.
          </AppBanner>
        )}

      {windowClosed && (
        <AppBanner
          tone="danger"
          icon={Clock}
          className="-mx-4 border-x-0 border-t-0 text-xs"
        >
          <span>{t.chat.windowClosedText}</span>
          {upcomingAppointment && connectionStatus === 'active' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 w-full"
              onClick={sendReminder}
              disabled={statePending}
            >
              Dërgo kujtesën e miratuar
            </Button>
          )}
        </AppBanner>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-2 py-4">
        {visibleMessages.map((m, index) => {
          const previous = visibleMessages[index - 1];
          const grouped = Boolean(
            previous &&
            previous.role === m.role &&
            new Date(m.createdAt).getTime() -
              new Date(previous.createdAt).getTime() <
              3 * 60_000,
          );
          return (
            <div key={m.id} className={grouped ? '-mt-1' : undefined}>
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
                  className="text-destructive mt-1 ml-auto block text-xs font-medium underline"
                  onClick={() => retryFailed(m)}
                >
                  Provo sërish
                </button>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} className="h-20" />
      </div>

      {/* Input — pinned above the bottom nav */}
      {!closed && connectionStatus === 'active' && (
        <div className="border-border bg-background fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-md items-end gap-2 px-4 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              rows={1}
              placeholder={t.chat.messagePlaceholder}
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/20 max-h-32 min-h-10 flex-1 resize-none rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-3"
              disabled={windowClosed}
            />
            <Button
              type="button"
              size="icon"
              onClick={onSend}
              disabled={sending || windowClosed || draft.trim().length === 0}
              aria-label={t.chat.sendMessage}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
