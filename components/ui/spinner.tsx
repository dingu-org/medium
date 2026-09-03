import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Simple centered loading indicator — replaces skeleton placeholders app-wide. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn('text-ink-3 h-6 w-6 animate-spin', className)}
      aria-hidden
    />
  );
}
