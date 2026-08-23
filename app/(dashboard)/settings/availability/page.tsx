import { TZDate } from '@date-fns/tz';
import { isSameDay } from 'date-fns';
import { asc, eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { availabilityRules, blockedPeriods, accounts } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { formatDate, formatTime } from '@/lib/i18n/datetime';
import { createServerClient } from '@/lib/supabase/server';
import { AvailabilityEditor, type BlockView } from './availability-editor';

export const metadata = { title: `${t.availability.title} · Medium` };

export default async function AvailabilityPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [[account], rules, blocks] = await Promise.all([
    db
      .select({ timezone: accounts.timezone })
      .from(accounts)
      .where(eq(accounts.id, user.id))
      .limit(1),
    db
      .select({
        weekday: availabilityRules.weekday,
        startTime: availabilityRules.startTime,
        endTime: availabilityRules.endTime,
      })
      .from(availabilityRules)
      .where(eq(availabilityRules.accountId, user.id))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db
      .select({
        id: blockedPeriods.id,
        startsAt: blockedPeriods.startsAt,
        endsAt: blockedPeriods.endsAt,
        label: blockedPeriods.label,
      })
      .from(blockedPeriods)
      .where(eq(blockedPeriods.accountId, user.id))
      .orderBy(asc(blockedPeriods.startsAt)),
  ]);

  const timezone = account?.timezone ?? 'Europe/Berlin';

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
    const when = isSameDay(start, end)
      ? `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)}`
      : `${formatDate(start)} ${formatTime(start)} → ${formatDate(end)} ${formatTime(end)}`;
    return { id: b.id, when, label: b.label };
  });

  return (
    <div className="-mx-4 -mt-4">
      <AvailabilityEditor
        initialRules={initialRules}
        blocks={blockViews}
        timezone={timezone}
      />
    </div>
  );
}
