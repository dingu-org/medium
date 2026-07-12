'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { RETENTION_OPTIONS, type SettingsState } from '../constants';

// Timezone lives here transitionally; task 9 moves it to the availability screen.
const schema = z.object({
  timezone: z
    .string()
    .min(1, 'Select a timezone')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'Invalid timezone'),
  retentionDays: z.coerce
    .number()
    .int()
    .refine(
      (n) => (RETENTION_OPTIONS as readonly number[]).includes(n),
      'Invalid retention period',
    ),
});

async function updateAccountPrefsImpl(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const parsed = schema.safeParse({
    timezone: formData.get('timezone'),
    retentionDays: formData.get('retentionDays'),
  });
  if (!parsed.success) {
    return {
      error: null,
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await db
    .update(pts)
    .set({
      timezone: parsed.data.timezone,
      retentionDays: parsed.data.retentionDays,
    })
    .where(eq(pts.id, user.id));

  revalidatePath('/settings/account');
  return { error: null, success: true, fieldErrors: null };
}

export const updateAccountPrefs = instrumentedAction(
  'settings.updateAccountPrefs',
  updateAccountPrefsImpl,
);
