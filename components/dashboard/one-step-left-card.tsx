'use client';

import { ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { WHATSAPP_STEP_HREF } from '@/lib/onboarding/whatsapp';

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const snoozeKey = (accountId: string) =>
  `medium:onestep-whatsapp-dismissed:${accountId}`;

/** Per-device, 7-day snooze; storage failures mean "not snoozed". */
export function oneStepLeftSnoozed(accountId: string, now: number): boolean {
  try {
    const at = Number(localStorage.getItem(snoozeKey(accountId)) ?? '0');
    return at > 0 && now - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function snoozeOneStepLeft(accountId: string, now: number): void {
  try {
    localStorage.setItem(snoozeKey(accountId), String(now));
  } catch {
    // Storage can be unavailable; the card just hides for this visit.
  }
}

/** The one-row card of canvas S9; "Lidh WhatsApp" is its only highlight. */
export function OneStepLeftCardView({ onDismiss }: { onDismiss: () => void }) {
  const c = t.onboarding.oneStepLeft;
  return (
    <div className="border-line bg-card flex items-center gap-0.5 rounded-lg border p-1.5 shadow-[var(--shadow-card)]">
      <Link
        href={WHATSAPP_STEP_HREF}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[20px] py-1.5 pr-1 pl-2"
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
      <button
        type="button"
        aria-label={c.dismiss}
        onClick={onDismiss}
        className="text-ink-2 flex size-11 flex-none items-center justify-center rounded-full"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function OneStepLeftCard({ accountId }: { accountId: string }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (oneStepLeftSnoozed(accountId, Date.now())) setHidden(true);
  }, [accountId]);
  if (hidden) return null;
  return (
    <OneStepLeftCardView
      onDismiss={() => {
        snoozeOneStepLeft(accountId, Date.now());
        setHidden(true);
      }}
    />
  );
}
