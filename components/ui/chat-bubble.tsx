import { format } from 'date-fns';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type ChatBubbleRole = 'patient' | 'ai' | 'pt';

export function ChatBubble({
  role,
  content,
  createdAt,
  pending = false,
  failed = false,
}: {
  role: ChatBubbleRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  failed?: boolean;
}) {
  const mine = role === 'pt';
  const ai = role === 'ai';

  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[84%]">
        {ai && (
          <div className="mb-1 inline-flex items-center gap-1.5 font-mono text-[10px] font-medium text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success-500)]" aria-hidden="true" />
            Medium
          </div>
        )}
        <div
          className={cn(
            'rounded-[16px] px-3 py-2 text-sm leading-snug',
            mine &&
              'rounded-br-[5px] bg-primary text-primary-foreground shadow-[var(--shadow-card)]',
            ai && 'rounded-bl-[5px] bg-[var(--brand-50)] text-[var(--brand-700)]',
            role === 'patient' &&
              'rounded-bl-[5px] border border-border bg-card text-foreground',
            pending && 'opacity-70',
            failed &&
              'border border-destructive bg-card text-foreground shadow-none',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{content}</p>
        </div>
        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-1 font-mono text-[10.5px] text-muted-foreground',
            mine ? 'justify-end text-right' : 'justify-start',
            failed && 'text-destructive',
          )}
        >
          <span>{format(new Date(createdAt), 'HH:mm')}</span>
          {pending && <span>{t.chat.pendingSync}</span>}
          {failed && <span>{t.chat.needsAttention}</span>}
        </div>
      </div>
    </div>
  );
}
