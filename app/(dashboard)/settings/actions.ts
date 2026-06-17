'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts, whatsappConnections } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
  RETENTION_OPTIONS,
  type SettingsState,
} from './constants';

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const schema = z.object({
  practiceName: z.string().trim().min(1, 'Practice name is required').max(120),
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
  aiName: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(60).optional(),
  ),
  aiGreeting: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(1000).optional(),
  ),
  aiEscalationKeyword: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(40).optional(),
  ),
  retentionDays: z.coerce
    .number()
    .int()
    .refine(
      (n) => (RETENTION_OPTIONS as readonly number[]).includes(n),
      'Invalid retention period',
    ),
});

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const parsed = schema.safeParse({
    practiceName: formData.get('practiceName'),
    timezone: formData.get('timezone'),
    aiName: formData.get('aiName'),
    aiGreeting: formData.get('aiGreeting'),
    aiEscalationKeyword: formData.get('aiEscalationKeyword'),
    retentionDays: formData.get('retentionDays'),
  });
  if (!parsed.success) {
    return {
      error: null,
      success: false,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const prefs = Object.fromEntries(
    NOTIFICATION_PREF_KEYS.map((key) => [
      key,
      formData.get(`notify_${key}`) === 'on',
    ]),
  ) as NotificationPrefs;

  await db
    .update(pts)
    .set({
      practiceName: parsed.data.practiceName,
      timezone: parsed.data.timezone,
      aiName: parsed.data.aiName ?? null,
      aiGreeting: parsed.data.aiGreeting ?? null,
      aiEscalationKeyword: parsed.data.aiEscalationKeyword ?? null,
      retentionDays: parsed.data.retentionDays,
      notificationPrefs: prefs,
    })
    .where(eq(pts.id, user.id));

  revalidatePath('/settings');
  return { error: null, success: true, fieldErrors: null };
}

/** Mark the active WhatsApp connection revoked so the PT can reconnect later. */
export async function disconnectWhatsApp(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [latest] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.ptId, user.id))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (latest) {
    await db
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(whatsappConnections.id, latest.id),
          eq(whatsappConnections.ptId, user.id),
        ),
      );
  }

  revalidatePath('/settings');
}

/** Permanently delete the PT's auth user; the FK cascade purges all their data. */
export async function deleteAccount(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error('Could not delete account. Please try again.');
  }

  await supabase.auth.signOut();
  redirect('/sign-in');
}
