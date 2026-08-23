'use server';

import { TZDate } from '@date-fns/tz';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { availabilityRules, blockedPeriods, accounts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const ruleSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start: z.string().regex(TIME, 'Invalid time'),
    end: z.string().regex(TIME, 'Invalid time'),
  })
  .refine((r) => r.end > r.start, {
    message: 'End time must be after start time',
  });

const rulesSchema = z.array(ruleSchema).max(7);

async function requireAccountId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

export type AvailabilityResult = { ok: boolean; error?: string };

/** Replace the PT's weekly availability with the supplied rules (one per day). */
async function saveAvailabilityImpl(input: {
  rules: { weekday: number; start: string; end: string }[];
}): Promise<AvailabilityResult> {
  const accountId = await requireAccountId();
  const parsed = rulesSchema.safeParse(input.rules);
  if (!parsed.success) {
    return { ok: false, error: 'Please check your working hours.' };
  }

  await db.transaction(async (tx) => {
    await tx.delete(availabilityRules).where(eq(availabilityRules.accountId, accountId));
    if (parsed.data.length > 0) {
      await tx.insert(availabilityRules).values(
        parsed.data.map((r) => ({
          accountId,
          weekday: r.weekday,
          startTime: `${r.start}:00`,
          endTime: `${r.end}:00`,
        })),
      );
    }
  });

  revalidatePath('/settings/availability');
  return { ok: true };
}

export const saveAvailability = instrumentedAction(
  'availability.saveAvailability',
  saveAvailabilityImpl,
);

const validTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const timezoneSchema = z.object({
  timezone: z.string().min(1).refine(validTimezone, 'Invalid timezone'),
});

/** Persist the PT timezone (moved here from /settings/account in Phase 15). */
async function saveTimezoneImpl(input: {
  timezone: string;
}): Promise<AvailabilityResult> {
  const accountId = await requireAccountId();
  const parsed = timezoneSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  }
  await db
    .update(accounts)
    .set({ timezone: parsed.data.timezone })
    .where(eq(accounts.id, accountId));
  revalidatePath('/settings/availability');
  return { ok: true };
}

export const saveTimezone = instrumentedAction(
  'availability.saveTimezone',
  saveTimezoneImpl,
);

const blockSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    startTime: z.string().regex(TIME, 'Invalid time'),
    endTime: z.string().regex(TIME, 'Invalid time'),
    label: z.string().trim().max(80).optional(),
  })
  .refine((b) => b.endTime > b.startTime, {
    message: 'End time must be after start time',
  });

/** Add a blocked period, interpreting the entered wall-clock times in the PT tz. */
async function addBlockedPeriodImpl(input: {
  date: string;
  startTime: string;
  endTime: string;
  label?: string;
}): Promise<AvailabilityResult> {
  const accountId = await requireAccountId();
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
  }

  const [account] = await db
    .select({ timezone: accounts.timezone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const timezone = account?.timezone ?? 'Europe/Berlin';

  const [year, month, day] = parsed.data.date.split('-').map(Number);
  const toInstant = (time: string): Date => {
    const [h, m] = time.split(':').map(Number);
    return new Date(
      new TZDate(year, month - 1, day, h, m, 0, 0, timezone).getTime(),
    );
  };

  await db.insert(blockedPeriods).values({
    accountId,
    startsAt: toInstant(parsed.data.startTime),
    endsAt: toInstant(parsed.data.endTime),
    label: parsed.data.label || null,
  });

  revalidatePath('/settings/availability');
  return { ok: true };
}

export const addBlockedPeriod = instrumentedAction(
  'availability.addBlockedPeriod',
  addBlockedPeriodImpl,
);

async function deleteBlockedPeriodImpl(id: string): Promise<void> {
  const accountId = await requireAccountId();
  await db
    .delete(blockedPeriods)
    .where(and(eq(blockedPeriods.id, id), eq(blockedPeriods.accountId, accountId)));
  revalidatePath('/settings/availability');
}

export const deleteBlockedPeriod = instrumentedAction(
  'availability.deleteBlockedPeriod',
  deleteBlockedPeriodImpl,
);
