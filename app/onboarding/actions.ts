'use server';

import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { pts, services } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { ONBOARDING_SKIP_COOKIE, onboardingCookieValue } from './constants';

function internalPath(value: FormDataEntryValue | null): string | null {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : null;
}

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

/**
 * Mark onboarding dismissed (so the dashboard gate stops forcing a redirect)
 * and navigate to `href`. Used by both the "set up" step CTAs and "Skip".
 * Only internal paths are honoured.
 */
export async function dismissAndGo(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const href = internalPath(formData.get('href')) ?? '/today';

  const store = await cookies();
  store.set(
    ONBOARDING_SKIP_COOKIE,
    onboardingCookieValue('dismissed', userId),
    {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
    },
  );

  redirect(href);
}

export async function continueSetup(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const path = internalPath(formData.get('href')) ?? '/today';
  const separator = path.includes('?') ? '&' : '?';

  const store = await cookies();
  store.set(ONBOARDING_SKIP_COOKIE, onboardingCookieValue('setup', userId), {
    path: '/',
    maxAge: 60 * 60,
    sameSite: 'lax',
  });

  redirect(`${path}${separator}from=onboarding`);
}

export async function confirmServices(): Promise<void> {
  const userId = await requireUserId();

  const [activeService] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.ptId, userId), eq(services.active, true)))
    .limit(1);
  if (!activeService) redirect('/settings/services?from=onboarding');

  await db
    .update(pts)
    .set({ servicesConfiguredAt: new Date() })
    .where(eq(pts.id, userId));
  revalidatePath('/onboarding');
  redirect('/onboarding');
}
