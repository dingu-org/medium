'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { deleteAccount, disconnectWhatsApp } from './actions';

export function DangerZone({
  connected,
  practiceName,
}: {
  connected: boolean;
  practiceName: string;
}) {
  const router = useRouter();
  const [disconnecting, startDisconnect] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmText, setConfirmText] = useState('');
  const online = useOnlineStatus();

  function onDisconnect() {
    if (!online) {
      toast.error(t.settings.disconnectRequiresConnection);
      return;
    }
    startDisconnect(async () => {
      try {
        await disconnectWhatsApp();
        toast.success(t.settings.disconnectedToast);
        router.refresh();
      } catch {
        toast.error(t.settings.disconnectFailed);
      }
    });
  }

  function onDelete() {
    if (!online) {
      toast.error(t.settings.deleteRequiresConnection);
      return;
    }
    startDelete(async () => {
      try {
        await deleteAccount();
      } catch {
        toast.error(t.settings.deleteFailed);
      }
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">{t.settings.dangerZone}</CardTitle>
        <CardDescription>{t.settings.dangerNote}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!online && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t.settings.accountAndWhatsappRequireConnection}
          </p>
        )}
        {connected && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full" disabled={!online}>
                {t.settings.disconnectWhatsapp}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.settings.disconnectTitle}</DialogTitle>
                <DialogDescription>
                  {t.settings.disconnectBody}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{t.actions.cancel}</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={onDisconnect}
                  disabled={disconnecting || !online}
                >
                  {disconnecting ? t.settings.disconnecting : t.settings.disconnectConfirm}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog onOpenChange={() => setConfirmText('')}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="w-full" disabled={!online}>
              {t.settings.deleteAccount}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.settings.deleteTitle}</DialogTitle>
              <DialogDescription>
                {t.settings.deleteBody}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                {t.settings.deleteTypePrompt(practiceName)}
              </Label>
              <Input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t.actions.cancel}</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={
                  deleting ||
                  !online ||
                  confirmText.trim() !== practiceName.trim()
                }
              >
                {deleting ? t.settings.deleting : t.settings.deleteConfirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
