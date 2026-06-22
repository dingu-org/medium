'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ONBOARDING_SKIP_COOKIE } from './constants';

/**
 * Mark onboarding dismissed (so the dashboard gate stops forcing a redirect)
 * and navigate to `href`. Used by both the "set up" step CTAs and "Skip".
 * Only internal paths are honoured.
 */
export async function dismissAndGo(formData: FormData): Promise<void> {
  const raw = formData.get('href');
  const href = typeof raw === 'string' && raw.startsWith('/') ? raw : '/today';

  const store = await cookies();
  store.set(ONBOARDING_SKIP_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  });

  redirect(href);
}
