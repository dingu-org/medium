'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import {
  addressField,
  businessNameField,
  ownerNameField,
  titleField,
} from '@/lib/accounts/profile-fields';
import { createServerClient } from '@/lib/supabase/server';
import type { SettingsState } from '../constants';

const schema = z.object({
  name: businessNameField,
  fullName: ownerNameField,
  title: titleField,
  address: addressField,
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

  // Optional fields stay untouched when the form does not submit them.
  const parsed = schema.safeParse({
    name: formData.get('name'),
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
    .update(accounts)
    .set({
      name: parsed.data.name,
      ...(formData.has('fullName') ? { fullName: parsed.data.fullName ?? null } : {}),
      ...(formData.has('title') ? { title: parsed.data.title ?? null } : {}),
      ...(formData.has('address') ? { address: parsed.data.address ?? null } : {}),
    })
    .where(eq(accounts.id, user.id));

  revalidatePath('/settings');
  revalidatePath('/settings/profile');
  return { error: null, success: true, fieldErrors: null };
}

export const updateProfile = instrumentedAction(
  'settings.updateProfile',
  updateProfileImpl,
);
