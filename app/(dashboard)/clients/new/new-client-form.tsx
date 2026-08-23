'use client';

import { Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { AppBanner } from '@/components/ui/app-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { createManualClient } from '../actions';

export function NewClientForm() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!online)
      return toast.error('Shtimi i klientit kërkon lidhje interneti.');
    startTransition(async () => {
      const result = await createManualClient({ name, phone, notes });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Klienti u shtua.');
      router.push(`/clients/${result.clientId}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-client-name">Emri</Label>
        <Input
          id="new-client-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={120}
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-client-phone">Telefoni</Label>
        <Input
          id="new-client-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          required
          placeholder="+355 69 123 4567"
          autoComplete="tel"
        />
        <p className="text-muted-foreground text-xs">
          Përfshi prefiksin e shtetit.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-client-notes">
          Shënim privat{' '}
          <span className="text-ink-3 font-normal">· me dëshirë</span>
        </Label>
        <Textarea
          id="new-client-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1000}
          placeholder="Shto një shënim…"
        />
      </div>
      <AppBanner
        tone="info"
        icon={Info}
        title="WhatsApp lidhet kur të shkruajnë"
      >
        Klientët e shtuar me dorë s&apos;kanë WhatsApp derisa të nisin vetë një
        bisedë në numrin tënd.
      </AppBanner>
      {!online && (
        <p className="text-sm text-[var(--warning-600)]">
          Je jashtë linje. Lidhe internetin për ta shtuar klientin.
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!online || pending}
      >
        {pending ? 'Po shtohet…' : 'Shto klientin'}
      </Button>
    </form>
  );
}
