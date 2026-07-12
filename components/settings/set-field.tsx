import type { ChangeEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Labelled bordered field (design SetField): prefix/suffix/help/error slots
 *  around a real input or textarea, sunken when read-only/disabled. */
export function SetField({
  label,
  name,
  defaultValue,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  help,
  error,
  readOnly,
  disabled,
  multiline,
  rows,
  type = 'text',
}: {
  label: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  help?: ReactNode;
  error?: string;
  readOnly?: boolean;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
}) {
  const handleChange = onChange
    ? (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onChange(event.target.value)
    : undefined;
  const fieldClassName =
    'min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-[#a4abb7]';

  return (
    <div className={cn('flex flex-col gap-[7px]', disabled && 'opacity-55')}>
      <label className="text-[13px] font-semibold tracking-[-0.005em] text-[#303744]">
        {label}
      </label>
      <div
        className={cn(
          'flex items-center gap-[9px] rounded-2xl border border-input px-4 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15',
          multiline ? 'py-3' : 'min-h-12',
          readOnly || disabled ? 'bg-muted' : 'bg-card',
        )}
      >
        {prefix && (
          <span className="shrink-0 font-mono text-[14.5px] text-ink-3">
            {prefix}
          </span>
        )}
        {multiline ? (
          <textarea
            name={name}
            defaultValue={defaultValue}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            readOnly={readOnly}
            disabled={disabled}
            rows={rows ?? 3}
            className={fieldClassName}
          />
        ) : (
          <input
            type={type}
            name={name}
            defaultValue={defaultValue}
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
            readOnly={readOnly}
            disabled={disabled}
            className={fieldClassName}
          />
        )}
        {suffix && (
          <span className="shrink-0 text-[13.5px] text-ink-3">{suffix}</span>
        )}
      </div>
      {help && <p className="text-xs leading-[1.45] text-ink-3">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
