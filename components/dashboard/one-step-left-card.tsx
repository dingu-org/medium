import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { WHATSAPP_STEP_HREF } from '@/lib/onboarding/whatsapp';

/**
 * The one-row card of canvas S9; "Lidh WhatsApp" is its only highlight. Not
 * dismissible: it shows for as long as WhatsApp is not connected.
 */
export function OneStepLeftCard() {
  const c = t.onboarding.oneStepLeft;
  return (
    <div className="border-line bg-card rounded-lg border p-1.5 shadow-[var(--shadow-card)]">
      <Link
        href={WHATSAPP_STEP_HREF}
        className="flex min-h-11 items-center gap-3 rounded-[20px] py-1.5 pr-2 pl-2"
      >
        <span className="border-line bg-card flex size-10 flex-none items-center justify-center rounded-[12px] border">
          <WhatsAppMark size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ink-2 text-[12.5px]">{c.eyebrow}</span>
          <span className="text-[15.5px] font-semibold tracking-[-0.01em] text-[var(--primary)]">
            {c.title}
          </span>
        </span>
        <ChevronRight
          className="text-ink-2 size-[17px] flex-none"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
