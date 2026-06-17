import { TZDate } from '@date-fns/tz';
import { asc, eq } from 'drizzle-orm';
import { format, isSameDay } from 'date-fns';
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { availabilityRules, blockedPeriods, pts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { AvailabilityEditor, type BlockView } from './availability-editor';

export const metadata = { title: 'Availability · Medium' };

export default async function AvailabilityPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [[pt], rules, blocks] = await Promise.all([
    db
      .select({ timezone: pts.timezone })
      .from(pts)
      .where(eq(pts.id, user.id))
      .limit(1),
    db
      .select({
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.ptId, user.id))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db
      .select({
        id: blockedPeriods.id,
        startsAt: blockedPeriods.startsAt,
        endsAt: blockedPeriods.endsAt,
        label: blockedPeriods.label,
      })
      .from(blockedPeriods)
      .where(eq(blockedPeriods.ptId, user.id))
      .orderBy(asc(blockedPeriods.startsAt)),
  ]);

  const timezone = pt?.timezone ?? 'Europe/Berlin';

  // One range per weekday for the MVP editor — keep the earliest block.
  const seen = new Set<number>();
  const initialRules = rules
    .filter((r) => !seen.has(r.weekday) && seen.add(r.weekday))
    .map((r) => ({
      weekday: r.weekday,
      start: r.startTime.slice(0, 5),
      end: r.endTime.slice(0, 5),
    }));

  const blockViews: BlockView[] = blocks.map((b) => {
    const start = new TZDate(b.startsAt, timezone);
    const end = new TZDate(b.endsAt, timezone);
    const day = format(start, 'EEE d MMM');
    const times = isSameDay(start, end)
      ? `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`
      : `${format(start, 'HH:mm')} → ${format(end, 'EEE d MMM HH:mm')}`;
    return { id: b.id, when: `${day} · ${times}`, label: b.label };
  });

  return (
    <div className="space-y-4">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Settings
      </Link>
      <AvailabilityEditor initialRules={initialRules} blocks={blockViews} />
    </div>
  );
}
