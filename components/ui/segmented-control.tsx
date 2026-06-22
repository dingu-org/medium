'use client';

import { cn } from '@/lib/utils';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  ariaLabel,
  onValueChange,
  className,
}: {
  value: T;
  options: SegmentedControlOption<T>[];
  ariaLabel: string;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex rounded-[10px] bg-muted p-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'h-8 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-card text-foreground shadow-[var(--shadow-card)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
