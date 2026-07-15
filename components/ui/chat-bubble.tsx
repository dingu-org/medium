import { format } from 'date-fns';
import { AlertTriangle, Check, CheckCheck } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { WaDeliveryStatus } from '@/lib/pwa/read-models';
import { cn } from '@/lib/utils';

export type ChatBubbleRole = 'patient' | 'ai' | 'pt';

/**
 * WhatsApp-style delivery indicator for the PT's own outbound messages: one
 * check (sent), double check (delivered), coloured double check (read), or a
 * failure marker. Sits in the timestamp row, so it inherits the same
 * grouped-message visibility rule.
 */
function DeliveryTick({ status }: { status: WaDeliveryStatus }) {
  if (status === 'failed') {
    return (
      <span className="text-destructive inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {t.chat.deliveryFailed}
      </span>
    );
  }
  if (status === 'read') {
    return (
      <CheckCheck
        className="text-primary h-3.5 w-3.5"
        aria-label={t.chat.deliveryRead}
      />
    );
  }
  if (status === 'delivered') {
    return (
      <CheckCheck
        className="h-3.5 w-3.5"
        aria-label={t.chat.deliveryDelivered}
      />
    );
  }
  return <Check className="h-3.5 w-3.5" aria-label={t.chat.deliverySent} />;
}

export function ChatBubble({
  role,
  content,
  createdAt,
  deliveryStatus = null,
  pending = false,
  failed = false,
  grouped = false,
}: {
  role: ChatBubbleRole;
  content: string;
  createdAt: string;
  deliveryStatus?: WaDeliveryStatus | null;
  pending?: boolean;
  failed?: boolean;
  grouped?: boolean;
}) {
  const mine = role === 'pt';
  const ai = role === 'ai';

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[84%]">
        {ai && !grouped && (
          <div className="text-primary mb-1 inline-flex items-center gap-1.5 font-mono text-[10.5px] font-medium tracking-[0.04em] uppercase">
            <span
              className="h-1.5 w-1.5 rounded-full bg-sage"
              aria-hidden="true"
            />
            {t.chat.aiBadge}
          </div>
        )}
        <div
          className={cn(
            'rounded-[16px] px-3 py-2 text-sm leading-snug',
            mine &&
              'bg-primary text-primary-foreground rounded-br-[5px]',
            ai &&
              'rounded-bl-[5px] bg-[var(--brand-50)] text-[var(--brand-600)]',
            role === 'patient' &&
              'border-border bg-card text-foreground rounded-bl-[5px] border',
            pending && 'opacity-70',
            failed &&
              'border-destructive bg-card text-foreground border shadow-none',
          )}
        >
          <p className="break-words whitespace-pre-wrap">{content}</p>
        </div>
        {!grouped && (
          <div
            className={cn(
              'text-ink-3 mt-1 flex items-center gap-1.5 px-1 font-mono text-[11px]',
              mine ? 'justify-end text-right' : 'justify-start',
              failed && 'text-destructive',
            )}
          >
            <span>{format(new Date(createdAt), 'HH:mm')}</span>
            {pending && <span>{t.chat.pendingSync}</span>}
            {failed && <span>{t.chat.needsAttention}</span>}
            {mine && !pending && !failed && deliveryStatus && (
              <DeliveryTick status={deliveryStatus} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
