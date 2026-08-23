'use client';

import { Phone } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { disconnectWhatsApp } from '../actions';

/** Danger group + confirm dialog for disconnecting WhatsApp (wa-disconnect). */
export function DisconnectSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [disconnecting, start] = useTransition();
  const online = useOnlineStatus();

  function onDisconnect() {
    if (!online) {
      toast.error(t.settings.disconnectRequiresConnection);
      return;
    }
    start(async () => {
      try {
        await disconnectWhatsApp();
        toast.success(t.settings.disconnectedToast);
        setOpen(false);
        router.refresh();
      } catch {
        toast.error(t.settings.disconnectFailed);
      }
    });
  }

  return (
    <>
      <GroupedList footer={t.settings.disconnectBody}>
        <GroupedListRow
          icon={Phone}
          title={t.settings.disconnectWhatsapp}
          danger
          onClick={() =>
            online
              ? setOpen(true)
              : toast.error(t.settings.disconnectRequiresConnection)
          }
        />
      </GroupedList>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[340px] gap-0 rounded-[26px] p-0"
        >
          <div className="px-5 pt-5 pb-4 text-center">
            <span className="mb-3 inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--danger-50)]">
              <Phone className="h-6 w-6 text-destructive" />
            </span>
            <DialogTitle className="font-heading text-[18px] font-bold tracking-[-0.02em]">
              {t.settings.disconnectTitle}
            </DialogTitle>
            <DialogDescription className="text-ink-2 mt-2 text-[13.5px] leading-[1.5]">
              {t.settings.disconnectBody}
            </DialogDescription>
          </div>
          <div className="flex flex-col gap-2 px-5 pb-5">
            <Button
              variant="destructive"
              className="h-12 rounded-full"
              onClick={onDisconnect}
              disabled={disconnecting || !online}
            >
              {disconnecting
                ? t.settings.disconnecting
                : t.settings.disconnectConfirm}
            </Button>
            <Button
              variant="secondary"
              className="h-12 rounded-full"
              onClick={() => setOpen(false)}
            >
              {t.actions.cancel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
