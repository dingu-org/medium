'use client';

import { format } from 'date-fns';
import { ChevronLeft, Send } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { type LiveMessage, useMessages } from '@/lib/hooks/realtime';
import {
  PWA_MUTATION_FAILED_EVENT,
  PWA_MUTATION_SYNCED_EVENT,
} from '@/lib/pwa/client-store';
import { queueMessageSend } from '@/lib/pwa/mutation-client';
import { cn } from '@/lib/utils';
import { setTakeover } from '../actions';

type Props = {
  conversationId: string;
  patientName: string;
  initialMessages: LiveMessage[];
  aiActive: boolean;
  windowOpen: boolean;
};

type OptimisticMessage = LiveMessage & {
  clientMutationId: string;
  pending?: boolean;
  failed?: boolean;
};

export function ChatThread({
  conversationId,
  patientName,
  initialMessages,
  aiActive: initialAiActive,
  windowOpen: initialWindowOpen,
}: Props) {
  const router = useRouter();
  const { messages } = useMessages(conversationId, initialMessages);
  const [aiActive, setAiActive] = useState(initialAiActive);
  const [windowClosed, setWindowClosed] = useState(!initialWindowOpen);
  const [draft, setDraft] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([]);
  const [sending, startSend] = useTransition();
  const [, startToggle] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const visibleMessages = useMemo(
    () =>
      [...messages, ...optimisticMessages].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    [messages, optimisticMessages],
  );

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [visibleMessages.length]);

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
          toast.success('Message queued. It will send when you’re online.');
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
          error instanceof Error ? error.message : 'Could not queue message.',
        );
      }
    });
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
      <div className="sticky top-[57px] z-10 -mx-4 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
        <Link
          href="/chat"
          aria-label="Back to chats"
          className="text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{patientName}</p>
          <p className="text-xs text-muted-foreground">
            {aiActive ? 'AI is handling this' : "You're chatting"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Let AI respond</span>
          <Switch
            checked={aiActive}
            onCheckedChange={onToggle}
            aria-label="Let AI respond"
          />
        </label>
      </div>

      {windowClosed && (
        <div className="-mx-4 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          The 24-hour reply window is closed. The patient must message again
          before you can send a free-form reply.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-2 py-4">
        {visibleMessages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={bottomRef} className="h-20" />
      </div>

      {/* Input — pinned above the bottom nav */}
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
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
            placeholder="Type your message…"
            className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={sending || draft.trim().length === 0}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: LiveMessage & { pending?: boolean; failed?: boolean };
}) {
  const isPt = message.role === 'pt';
  const isAi = message.role === 'ai';
  const outbound = isPt || isAi;
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
          isAi && 'rounded-br-sm bg-primary text-primary-foreground',
          isPt && 'rounded-br-sm bg-emerald-600 text-white',
          !outbound && 'rounded-bl-sm bg-muted',
        )}
      >
        {isAi && (
          <Badge
            variant="secondary"
            className="mb-1 border-transparent bg-primary-foreground/15 text-[10px] text-primary-foreground"
          >
            Auto
          </Badge>
        )}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {(message.pending || message.failed) && (
          <p
            className={cn(
              'mt-1 text-[10px]',
              message.failed ? 'text-destructive-foreground' : 'text-white/75',
            )}
          >
            {message.failed ? 'Needs attention' : 'Pending sync'}
          </p>
        )}
        <p
          className={cn(
            'mt-1 text-[10px]',
            isAi && 'text-primary-foreground/70',
            isPt && 'text-white/75',
            !outbound && 'text-muted-foreground',
          )}
        >
          {format(new Date(message.createdAt), 'HH:mm')}
        </p>
      </div>
    </div>
  );
}
