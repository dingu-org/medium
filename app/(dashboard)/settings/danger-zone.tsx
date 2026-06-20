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
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { deleteAccount, disconnectWhatsApp } from './actions';

export function DangerZone({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [disconnecting, startDisconnect] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [confirmText, setConfirmText] = useState('');
  const online = useOnlineStatus();

  function onDisconnect() {
    if (!online) {
      toast.error('Disconnecting WhatsApp requires a connection.');
      return;
    }
    startDisconnect(async () => {
      try {
        await disconnectWhatsApp();
        toast.success('WhatsApp disconnected.');
        router.refresh();
      } catch {
        toast.error('Could not disconnect. Please try again.');
      }
    });
  }

  function onDelete() {
    if (!online) {
      toast.error('Deleting your account requires a connection.');
      return;
    }
    startDelete(async () => {
      try {
        await deleteAccount();
      } catch {
        toast.error('Could not delete account. Please try again.');
      }
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>These actions cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!online && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Account and WhatsApp connection actions require a connection.
          </p>
        )}
        {connected && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full" disabled={!online}>
                Disconnect WhatsApp
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Disconnect WhatsApp?</DialogTitle>
                <DialogDescription>
                  Patients won&apos;t be able to message your practice until you
                  reconnect. Your appointments and history are kept.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={onDisconnect}
                  disabled={disconnecting || !online}
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog onOpenChange={() => setConfirmText('')}>
          <DialogTrigger asChild>
            <Button variant="destructive" className="w-full" disabled={!online}>
              Delete account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes your practice, patients, appointments,
                conversations, and WhatsApp connection. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirm-delete">
                Type <span className="font-mono font-semibold">DELETE</span> to
                confirm
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
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={deleting || !online || confirmText !== 'DELETE'}
              >
                {deleting ? 'Deleting…' : 'Delete account'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
