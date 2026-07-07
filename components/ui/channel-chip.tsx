import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type ChannelChipState =
  | 'connected'
  | 'reconnect'
  | 'pending'
  | 'soon';

const map: Record<
  ChannelChipState,
  { dot: string; label: string; chip: string }
> = {
  connected: {
    dot: 'bg-[var(--success-500)]',
    label: t.settings.connected,
    chip: 'bg-[var(--success-50)] text-[var(--success-600)]',
  },
  reconnect: {
    dot: 'bg-destructive',
    label: t.settings.reconnect,
    chip: 'bg-[var(--danger-50)] text-[var(--danger-600)]',
  },
  pending: {
    dot: 'bg-[var(--warning-500)]',
    label: t.settings.whatsappConnecting,
    chip: 'bg-[var(--warning-50)] text-[var(--warning-600)]',
  },
  soon: {
    dot: 'bg-[var(--neutral-300)]',
    label: t.settings.comingSoon,
    chip: 'bg-[var(--neutral-100)] text-[var(--neutral-500)]',
  },
};

/** WhatsApp channel status chip (MT ChannelChip). */
export function ChannelChip({
  state,
  className,
}: {
  state: ChannelChipState;
  className?: string;
}) {
  const m = map[state];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-[7px] rounded-full py-[5px] pr-[11px] pl-2 text-xs font-medium',
        m.chip,
        className,
      )}
    >
      <WhatsAppMark size={15} />
      <span className="h-3 w-px bg-black/10" aria-hidden="true" />
      <span className="inline-flex items-center gap-[5px]">
        <span
          className={cn('h-1.5 w-1.5 rounded-full', m.dot)}
          aria-hidden="true"
        />
        {m.label}
      </span>
    </span>
  );
}
