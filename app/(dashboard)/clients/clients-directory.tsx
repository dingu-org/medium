'use client';

import { Plus, Search, Users, X } from 'lucide-react';
import { TZDate } from '@date-fns/tz';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { EmptyState } from '@/components/states';
import { SnapshotCache } from '@/components/pwa/snapshot-cache';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { Input } from '@/components/ui/input';
import type { ClientDirectorySnapshot } from '@/lib/clients/queries';
import { formatDate, formatTime } from '@/lib/i18n';

export function ClientsDirectory({
  snapshot,
}: {
  snapshot: ClientDirectorySnapshot;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(snapshot.query);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      router.replace(
        value.trim()
          ? `/clients?q=${encodeURIComponent(value.trim())}`
          : '/clients',
        { scroll: false },
      );
    }, 250);
  }

  return (
    <div className="space-y-4">
      <SnapshotCache
        cacheKey={`clients:${snapshot.query}`}
        kind="clients"
        payload={snapshot}
      />
      <RealtimeRefresher
        table="patients"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      <RealtimeRefresher
        table="appointments"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      <RealtimeRefresher
        table="conversations"
        filter={`pt_id=eq.${snapshot.ptId}`}
      />
      <header className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {snapshot.total} {snapshot.total === 1 ? 'klient' : 'klientë'}
        </p>
        <Button asChild size="icon" aria-label="Shto klient">
          <Link href="/clients/new">
            <Plus className="h-5 w-5" aria-hidden />
          </Link>
        </Button>
      </header>

      <div className="relative">
        <Search
          className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Kërko emër ose telefon…"
          className="pr-9 pl-9"
          aria-label="Kërko klientët"
        />
        {query && (
          <button
            type="button"
            onClick={() => search('')}
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
            aria-label="Pastro kërkimin"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {snapshot.rows.length === 0 ? (
        <EmptyState
          icon={query ? Search : Users}
          title={query ? 'Asnjë rezultat' : 'Ende asnjë klient'}
          description={
            query
              ? 'Provo një emër ose numër tjetër.'
              : 'Klientët shfaqen këtu kur shkruajnë ose kur i shton me dorë.'
          }
          action={
            !query && (
              <Button asChild>
                <Link href="/clients/new">
                  <Plus className="h-4 w-4" aria-hidden />
                  Shto klient
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="border-border bg-card overflow-hidden rounded-md border shadow-[var(--shadow-card)]">
          {snapshot.rows.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="border-border hover:bg-muted/50 flex min-h-16 items-center gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <InitialsAvatar name={client.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {client.name}
                </span>
                <span className="text-muted-foreground block truncate text-sm">
                  {clientMeta(client, snapshot.timezone)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function clientMeta(
  client: ClientDirectorySnapshot['rows'][number],
  timezone: string,
): string {
  const appointment = client.nextAppointment ?? client.lastAppointment;
  if (!appointment) return client.manual ? 'Shtuar me dorë' : client.phone;
  const zoned = new TZDate(new Date(appointment.startsAt), timezone);
  const date = `${formatDate(zoned)}, ${formatTime(zoned)}`;
  return client.nextAppointment
    ? `Takimi tjetër: ${date}`
    : `I fundit: ${date}`;
}
