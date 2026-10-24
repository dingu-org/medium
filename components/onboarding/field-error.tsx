import { CircleAlert } from 'lucide-react';

/**
 * One way to show a field error in every onboarding step. The input sets
 * `aria-invalid` and `aria-describedby={id}`; the shell focuses the first
 * invalid field after a failed Continue.
 */
export function FieldError({
  id,
  message,
}: {
  id: string;
  message: string | undefined;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="mt-2 flex items-start gap-1.5 text-[14px] leading-snug font-semibold text-[var(--danger-600)]"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
