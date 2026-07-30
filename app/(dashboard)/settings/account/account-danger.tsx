'use client';

import { X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GroupedList,
  GroupedListRow,
} from '@/components/ui/grouped-list';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { confirmMatches, confirmPhrase } from '@/lib/settings/confirm-phrase';
import { cn } from '@/lib/utils';
import { deleteAccount } from '../actions';

/** "Zona e rrezikut" group + typed-practice-name delete confirmation
 *  (account-delete artboard). Delete only — WhatsApp disconnect lives on
 *  /settings/whatsapp. */
export function AccountDanger({ practiceName }: { practiceName: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, startDelete] = useTransition();
  const online = useOnlineStatus();
  // The practice name is unset until onboarding's profile step is completed, and
  // that step is skippable — so never compare against it raw.
  const phrase = confirmPhrase(practiceName);
  const matches = confirmMatches(phrase, confirmText);

  function onOpenChange(next: boolean) {
    if (next && !online) {
      toast.error(t.settings.deleteRequiresConnection);
      return;
    }
    if (!next) setConfirmText('');
    setOpen(next);
  }

  function onDelete() {
    if (!online) {
      toast.error(t.settings.deleteRequiresConnection);
      return;
    }
    startDelete(async () => {
      try {
        // Success path redirects to /sign-in and never returns.
        await deleteAccount();
      } catch {
        toast.error(t.settings.deleteFailed);
      }
    });
  }

  return (
    <>
      <GroupedList title={t.settings.dangerZone} footer={t.settings.dangerNote}>
        <GroupedListRow
          icon={X}
          title={t.settings.deleteAccount}
          danger
          onClick={() => onOpenChange(true)}
          className={cn(!online && 'opacity-55')}
        />
      </GroupedList>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[340px] gap-0 rounded-[26px] p-0"
        >
          <div className="px-[22px] pt-[22px] pb-4 text-center">
            <span className="mb-3.5 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--danger-50)]">
              <X
                className="h-6 w-6 text-destructive"
                strokeWidth={2.2}
                aria-hidden
              />
            </span>
            <DialogTitle className="font-heading text-[18px] font-bold tracking-[-0.02em]">
              {t.settings.deleteTitle}
            </DialogTitle>
            <DialogDescription className="mt-2 text-[13.5px] leading-[1.5] text-ink-2">
              {t.settings.deleteBody}
            </DialogDescription>
          </div>

          <div className="space-y-[7px] px-[22px]">
            <p className="text-[12.5px] text-ink-2">
              {t.settings.deleteTypePromptPre}
              <strong className="font-bold text-foreground">{phrase}</strong>
              {t.settings.deleteTypePromptPost}
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              aria-label={t.settings.deleteTitle}
              className="border-destructive focus-visible:border-destructive focus-visible:ring-destructive/15"
            />
          </div>

          <div className="flex flex-col gap-2 p-[18px]">
            <Button
              variant="destructive"
              className="h-12 rounded-full"
              onClick={onDelete}
              disabled={deleting || !online || !matches}
            >
              {deleting ? t.settings.deleting : t.settings.deleteConfirm}
            </Button>
            <DialogClose asChild>
              <Button variant="secondary" className="h-12 rounded-full">
                {t.actions.cancel}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
