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
        'inline-flex gap-0.5 rounded-full bg-[#e9e9e4] p-[3px]',
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
              'h-8 flex-1 rounded-full px-3 text-[13.5px] font-bold tracking-[-0.005em] whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
              active
                ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(12_13_18_/_10%)]'
                : 'text-ink-2 hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
