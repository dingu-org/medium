import { Bell } from 'lucide-react';
import { t } from '@/lib/i18n';

/** The "Njoftimet" card of the Finish screen (canvas 8c/8d); MED-124 places it. */
export function NotificationsPromptCard() {
  const n = t.onboarding.notifications;
  return (
    <div className="border-line bg-card flex items-start gap-3 rounded-lg border p-3.5 shadow-[var(--shadow-card)]">
      <div
        aria-hidden="true"
        className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-[var(--brand-50)] text-[var(--brand-600)]"
      >
        <Bell className="size-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[15px] font-semibold tracking-[-0.005em]">
          {n.finishCardTitle}
        </p>
        <p className="text-ink-2 text-[13.5px] leading-snug">
          {n.finishCardBody}
        </p>
      </div>
    </div>
  );
}
