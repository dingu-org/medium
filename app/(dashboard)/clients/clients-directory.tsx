'use client';

import { ChevronRight, Plus, Search, Users, X } from 'lucide-react';
import { TZDate } from '@date-fns/tz';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { EmptyState } from '@/components/states';
import { RealtimeRefresher } from '@/components/realtime-refresher';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/ui/initials-avatar';
import { SectionLabel } from '@/components/ui/section-label';
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
      <RealtimeRefresher
        table="customers"
        filter={`account_id=eq.${snapshot.accountId}`}
      />
      <RealtimeRefresher
        table="appointments"
        filter={`account_id=eq.${snapshot.accountId}`}
      />
      <RealtimeRefresher
        table="conversations"
        filter={`account_id=eq.${snapshot.accountId}`}
      />

      {/* Always-visible directory search (canvas SearchBar). */}
      <div className="relative">
        <Search
          className="text-ink-3 absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2"
          aria-hidden
        />
        <input
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Kërko klient"
          aria-label="Kërko klientët"
          className="placeholder:text-ink-3 h-11 w-full rounded-[14px] bg-[#ecece7] pr-11 pl-11 text-[15px] outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
        />
        {query && (
          <button
            type="button"
            onClick={() => search('')}
            className="text-ink-3 absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
            aria-label="Pastro kërkimin"
          >
            <X className="h-[17px] w-[17px]" aria-hidden />
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
              : 'Sapo një pacient të shkruajë në WhatsApp, shtohet këtu vetë. Ose shto një me dorë.'
          }
          className="pt-14"
          action={
            !query && (
              <Button asChild variant="tinted" className="h-11">
                <Link href="/clients/new">
                  <Plus className="h-4 w-4" aria-hidden />
                  Shto klient
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <section>
          <SectionLabel>
            {snapshot.query
              ? `${snapshot.rows.length} ${snapshot.rows.length === 1 ? 'rezultat' : 'rezultate'}`
              : `${snapshot.total} ${snapshot.total === 1 ? 'klient' : 'klientë'}`}
          </SectionLabel>
          <div className="border-line overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)] [&>*+*]:border-t [&>*+*]:border-sep">
            {snapshot.rows.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="hover:bg-muted/50 active:bg-muted/50 flex items-center gap-3 px-4 py-3"
              >
                <InitialsAvatar name={client.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold tracking-[-0.005em]">
                    {client.name}
                  </span>
                  <span
                    className={
                      client.nextAppointment
                        ? 'block truncate text-[13px] text-[var(--success-500)]'
                        : 'text-ink-3 block truncate text-[13px]'
                    }
                  >
                    {clientMeta(client, snapshot.timezone)}
                  </span>
                </span>
                <ChevronRight
                  className="text-ink-3/70 h-[17px] w-[17px] shrink-0"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </section>
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
  const date = `${formatDate(zoned)} · ${formatTime(zoned)}`;
  return client.nextAppointment ? `Më pas: ${date}` : `I fundit: ${date}`;
}
