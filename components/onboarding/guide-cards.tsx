import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type GuideCard = {
  title: string;
  /** May contain `<strong>` (a UI label to look for) or other inline markup. */
  body: ReactNode;
  /** Decorative; rendered inside an `aria-hidden` tile. */
  illustration: ReactNode;
};

/**
 * Numbered, illustrated step cards (the WhatsApp guide, MED-122; the
 * notifications guide, MED-123). The `<ol>` carries the numbering for
 * assistive tech, so the visible badge stays inside the hidden tile.
 */
export function GuideCards({
  cards,
  className,
}: {
  cards: readonly GuideCard[];
  className?: string;
}) {
  return (
    <ol className={cn('flex list-none flex-col gap-3 p-0', className)}>
      {cards.map((card, index) => (
        <li
          key={card.title}
          className="border-line bg-card flex items-start gap-3.5 rounded-lg border p-3 shadow-[var(--shadow-card)]"
        >
          <div
            aria-hidden="true"
            className="relative size-[88px] flex-none overflow-hidden rounded-md bg-[var(--neutral-100)]"
          >
            {card.illustration}
            <span className="absolute top-1.5 left-1.5 flex size-[22px] items-center justify-center rounded-full bg-[var(--dock)] text-[12px] font-bold text-white tabular-nums">
              {index + 1}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
            <p className="text-[15.5px] font-semibold tracking-[-0.01em]">
              {card.title}
            </p>
            <p className="text-ink-2 [&_strong]:text-foreground text-[13.5px] leading-normal [&_strong]:font-semibold">
              {card.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
