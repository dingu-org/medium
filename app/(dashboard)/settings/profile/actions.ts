'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import type { SettingsState } from '../constants';

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const schema = z.object({
  practiceName: z.string().trim().min(1, 'Practice name is required').max(120),
  fullName: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  title: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  address: z.preprocess(emptyToUndefined, z.string().trim().max(240).optional()),
});

async function updateProfileImpl(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  // Optional fields stay untouched when the form does not submit them
  // (the transitional form only sends practiceName).
  const parsed = schema.safeParse({
    practiceName: formData.get('practiceName'),
    fullName: formData.get('fullName') ?? undefined,
    title: formData.get('title') ?? undefined,
    address: formData.get('address') ?? undefined,
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
      practiceName: parsed.data.practiceName,
      ...(formData.has('fullName') ? { fullName: parsed.data.fullName ?? null } : {}),
      ...(formData.has('title') ? { title: parsed.data.title ?? null } : {}),
      ...(formData.has('address') ? { address: parsed.data.address ?? null } : {}),
    })
    .where(eq(pts.id, user.id));

  revalidatePath('/settings');
  revalidatePath('/settings/profile');
  return { error: null, success: true, fieldErrors: null };
}

export const updateProfile = instrumentedAction(
  'settings.updateProfile',
  updateProfileImpl,
);
