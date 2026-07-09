import * as React from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * 44px circular header button (MT RoundBtn/BellButton): white circle on the
 * canvas with ambient elevation. `plain` drops the fill for tinted headers.
 * `dot` renders the brand notification dot.
 */
export function RoundButton({
  className,
  plain = false,
  dot = false,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<'button'> & {
  plain?: boolean;
  dot?: boolean;
  asChild?: boolean;
}) {
  const Comp = asChild ? Slot.Root : 'button';
  const classes = cn(
    'relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-5',
    plain
      ? 'bg-transparent hover:bg-muted'
      : 'bg-card shadow-[var(--shadow-card)] hover:bg-[#f7f7f4]',
    className,
  );
  // Slot.Root needs exactly one child, so `dot` only renders on the plain
  // button form — asChild callers (links) don't carry the notification dot.
  if (asChild) {
    return (
      <Comp className={classes} {...props}>
        {children}
      </Comp>
    );
  }
  return (
    <Comp type="button" className={classes} {...props}>
      {children}
      {dot && (
        <span
          className="absolute top-[9px] right-[10px] h-[7px] w-[7px] rounded-full border-2 border-card bg-primary"
          aria-hidden="true"
        />
      )}
    </Comp>
  );
}
