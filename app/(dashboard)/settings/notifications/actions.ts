'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { NOTIFICATION_PREF_KEYS, type NotificationPrefs } from '../constants';

type NotificationPrefKey = keyof NotificationPrefs;

const prefKeySchema = z.enum(
  [...NOTIFICATION_PREF_KEYS] as [NotificationPrefKey, ...NotificationPrefKey[]],
);

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

async function setNotificationPrefImpl(
  key: NotificationPrefKey,
  enabled: boolean,
): Promise<void> {
  const prefKey = prefKeySchema.parse(key); // throws on bad key → client reverts
  const value = z.boolean().parse(enabled);
  const ptId = await requirePtId();

  // Atomic jsonb merge — no read-modify-write, so concurrent toggles of
  // different rows never clobber. coalesce guards the nullable column
  // (plain NULL || x = NULL).
  await db
    .update(pts)
    .set({
      notificationPrefs: sql`coalesce(${pts.notificationPrefs}, '{}'::jsonb) || ${JSON.stringify(
        { [prefKey]: value },
      )}::jsonb`,
    })
    .where(eq(pts.id, ptId));

  revalidatePath('/settings/notifications');
}

export const setNotificationPref = instrumentedAction(
  'settings.setNotificationPref',
  setNotificationPrefImpl,
);
