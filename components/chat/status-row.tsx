'use client';

import { Switch } from '@/components/ui/switch';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type ChatHandlingMode = 'ai' | 'you' | 'paused' | 'escalated';

const modes: Record<ChatHandlingMode, { dot: string; tint: string; label: string }> = {
  ai: { dot: 'bg-primary', tint: 'bg-card', label: t.chat.aiHandling },
  you: {
    dot: 'bg-[var(--success-500)]',
    tint: 'bg-[var(--success-50)]',
    label: t.chat.youHandling,
  },
  paused: {
    dot: 'bg-[var(--warning-500)]',
    tint: 'bg-[var(--warning-50)]',
    label: t.chat.paused,
  },
  escalated: {
    dot: 'bg-destructive',
    tint: 'bg-[var(--danger-50)]',
    label: t.chat.escalated,
  },
};

/**
 * Thread sub-header (MT CStatusRow): who is handling + the takeover toggle.
 * The Switch reflects `aiActive` — "Lër Medium-in" on = Medium responds.
 */
export function ChatStatusRow({
  mode,
  aiActive,
  onToggle,
  disabled = false,
  className,
}: {
  mode: ChatHandlingMode;
  aiActive: boolean;
  onToggle: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const m = modes[mode];
  return (
    <div
      className={cn(
        'border-line flex shrink-0 items-center gap-2.5 border-b px-4 py-[9px]',
        m.tint,
        className,
      )}
    >
      <span
        className={cn('h-[7px] w-[7px] shrink-0 rounded-full', m.dot)}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
        {m.label}
      </p>
      <label className="flex shrink-0 items-center gap-2">
        <span className="text-ink-3 text-xs">{t.chat.letMedium}</span>
        <Switch
          checked={aiActive}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={t.chat.letMedium}
        />
      </label>
    </div>
  );
}
