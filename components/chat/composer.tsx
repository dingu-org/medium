'use client';

import { Bell, Clock, Loader2, Phone, Send } from 'lucide-react';
import Link from 'next/link';
import { WhatsAppMark } from '@/components/ui/whatsapp-mark';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Thread composer (MT CComposer): pill input + 44px round send button on a
 * white bar. `windowClosed` swaps in the 24h template card; `revoked` swaps
 * in the reconnect card. Fixed above the bottom safe area on pushed screens.
 */
export function ChatComposer({
  state,
  draft,
  onDraftChange,
  onSend,
  onSendTemplate,
  sending = false,
  templateAvailable = false,
  templatePending = false,
}: {
  state: 'default' | 'windowClosed' | 'revoked';
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSendTemplate?: () => void;
  sending?: boolean;
  templateAvailable?: boolean;
  templatePending?: boolean;
}) {
  return (
    <div className="border-line bg-card fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md px-4 pt-3 pb-3.5">
        {state === 'windowClosed' ? (
          <>
            <div className="border-line mb-2.5 flex items-start gap-2.5 rounded-[18px] border bg-[#f4f4f1] px-3 py-[11px]">
              <Clock className="text-ink-3 mt-px h-4 w-4 shrink-0" aria-hidden />
              <p className="text-ink-2 min-w-0 flex-1 text-[12.5px] leading-snug">
                {t.chat.windowClosedText}
              </p>
            </div>
            {templateAvailable && (
              <button
                type="button"
                onClick={onSendTemplate}
                disabled={templatePending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-50)] text-sm font-semibold text-[var(--brand-600)] transition-colors hover:bg-[#dde4ff] disabled:pointer-events-none disabled:opacity-40"
              >
                {templatePending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Bell className="h-4 w-4" aria-hidden />
                )}
                {t.chat.sendTemplateReminder}
              </button>
            )}
          </>
        ) : state === 'revoked' ? (
          <>
            <div className="mb-2.5 flex items-start gap-2.5 rounded-[18px] border border-[#f0d0cf] bg-[var(--danger-50)] px-3 py-[11px]">
              <Phone
                className="text-destructive mt-px h-4 w-4 shrink-0"
                aria-hidden
              />
              <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--danger-600)]">
                {t.chat.revokedText}
              </p>
            </div>
            <Link
              href="/settings"
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#25D366] text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <WhatsAppMark size={17} />
              {t.chat.reconnectWhatsApp}
            </Link>
          </>
        ) : (
          <div className="flex items-end gap-2.5">
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              rows={1}
              placeholder={t.chat.messagePlaceholder}
              aria-label={t.chat.messagePlaceholder}
              className="border-line placeholder:text-ink-3 focus-visible:border-ring focus-visible:ring-ring/20 max-h-32 min-h-11 flex-1 resize-none rounded-[22px] border bg-card px-4 py-[11px] text-[14.5px] leading-snug outline-none focus-visible:ring-3"
            />
            <button
              type="button"
              onClick={onSend}
              disabled={sending || draft.trim().length === 0}
              aria-label={t.chat.sendMessage}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors',
                draft.trim()
                  ? 'bg-primary text-white'
                  : 'text-ink-3 bg-[#ecece7]',
              )}
            >
              {sending ? (
                <Loader2 className="h-[17px] w-[17px] animate-spin" aria-hidden />
              ) : (
                <Send className="h-[17px] w-[17px]" aria-hidden />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
