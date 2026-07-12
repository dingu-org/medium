'use client';

import { Pause, Sparkles } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Assistant status card (hub + assistant screen). The page supplies the
 *  server action so components/ stays free of app/ imports. */
export function AssistantCard({
  paused,
  big = false,
  onToggle,
}: {
  paused: boolean;
  big?: boolean;
  onToggle: (nextPaused: boolean) => Promise<void>;
}) {
  const [optimistic, setOptimistic] = useState(paused);
  const [isPending, startTransition] = useTransition();
  const online = useOnlineStatus();

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg bg-card px-[18px] shadow-[var(--shadow-card)]',
        big ? 'py-[18px]' : 'py-[15px]',
      )}
    >
      <span
        className={cn(
          'inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full',
          optimistic ? 'bg-[var(--warning-50)]' : 'bg-[var(--brand-50)]',
        )}
        aria-hidden="true"
      >
        {optimistic ? (
          <Pause className="h-5 w-5 text-[var(--warning-600)]" />
        ) : (
          <Sparkles className="h-5 w-5 text-[var(--brand-600)]" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold tracking-[-0.005em] text-foreground">
          {optimistic
            ? t.settings.assistantCardPausedTitle
            : t.settings.assistantCardActiveTitle}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">
          {optimistic
            ? t.settings.assistantCardPausedSub
            : t.settings.assistantCardActiveSub}
        </span>
      </span>
      <Switch
        checked={!optimistic}
        disabled={isPending || !online}
        aria-label={t.settings.assistantToggleLabel}
        onCheckedChange={(next) => {
          const nextPaused = !next;
          setOptimistic(nextPaused);
          startTransition(async () => {
            try {
              await onToggle(nextPaused);
            } catch {
              setOptimistic(paused);
              toast.error(t.settings.pauseFailed);
            }
          });
        }}
      />
    </div>
  );
}
