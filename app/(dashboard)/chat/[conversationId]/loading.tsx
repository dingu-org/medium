import { Skeleton } from '@/components/ui/skeleton';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// Alternating incoming/outgoing bubble placeholders for the thread route's
// Suspense fallback, mirroring ChatThread's full-bleed header column.
const bubbles: { side: 'left' | 'right'; width: string }[] = [
  { side: 'left', width: 'w-40' },
  { side: 'right', width: 'w-52' },
  { side: 'left', width: 'w-32' },
  { side: 'right', width: 'w-44' },
  { side: 'left', width: 'w-48' },
];

export default function ConversationLoading() {
  return (
    <div
      className="flex flex-col"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{t.states.loading}</span>
      <div className="border-line flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="border-line flex min-h-11 items-center gap-2 border-b px-4 py-2">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="ml-auto h-5 w-14 rounded-full" />
      </div>
      <div className="space-y-3 px-4 py-4">
        {bubbles.map((bubble, index) => (
          <div
            key={`bubble-${index}`}
            className={cn(
              'flex',
              bubble.side === 'right' ? 'justify-end' : 'justify-start',
            )}
          >
            <Skeleton className={cn('h-10 rounded-[16px]', bubble.width)} />
          </div>
        ))}
      </div>
    </div>
  );
}
