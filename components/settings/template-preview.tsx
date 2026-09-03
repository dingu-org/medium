import { Check, Clock, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type TplStatus = 'approved' | 'pending' | 'rejected' | null;

const STATUS_META: Record<
  'approved' | 'pending' | 'rejected' | 'preparing',
  { label: string; icon: LucideIcon; text: string; icon2: string }
> = {
  approved: {
    label: t.settings.whatsappTemplateApproved,
    icon: Check,
    text: 'text-[var(--success-600)]',
    icon2: 'text-[var(--success-500)]',
  },
  pending: {
    label: t.settings.whatsappTemplatePending,
    icon: Clock,
    text: 'text-[var(--warning-600)]',
    icon2: 'text-[var(--warning-500)]',
  },
  rejected: {
    label: t.settings.whatsappTemplateRejected,
    icon: X,
    text: 'text-[var(--danger-600)]',
    icon2: 'text-destructive',
  },
  preparing: {
    label: t.settings.whatsappTemplatePreparing,
    icon: Clock,
    text: 'text-[var(--warning-600)]',
    icon2: 'text-[var(--warning-500)]',
  },
};

function KwTag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-black/5 bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-2">
      {children}
    </span>
  );
}

/** Reminder-template status card (MT TemplatePreview). Status is live snapshot
 *  data; the bubble is a representative localized sample, not the raw Meta
 *  template body (whose {{n}} placeholders render badly). `null` maps to the
 *  "preparing" state — honest right after connect while bootstrap submits. */
export function TemplatePreview({ status }: { status: TplStatus }) {
  const meta = STATUS_META[status ?? 'preparing'];
  const Icon = meta.icon;
  return (
    <div className="border-line rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <WhatsAppMark size={15} />
        <span className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-3">
          {t.settings.whatsappTemplateEyebrow}
        </span>
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-xs font-semibold',
            meta.text,
          )}
        >
          <Icon className={cn('h-[13px] w-[13px]', meta.icon2)} strokeWidth={2.4} />
          {meta.label}
        </span>
      </div>
      <div className="rounded-[4px_16px_16px_16px] bg-muted px-4 py-3 text-[13.5px] leading-[1.55] text-foreground">
        {t.settings.whatsappTemplatePreviewLead}
        <KwTag>{t.ops.confirm}</KwTag>
        {t.settings.whatsappTemplatePreviewMid}
        <KwTag>{t.ops.cancel}</KwTag>
        {t.settings.whatsappTemplatePreviewTail}
      </div>
    </div>
  );
}
