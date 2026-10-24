import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Sign-in and sign-up pages: a signed-in guided account that has not finished
 * onboarding goes straight back into the flow. Without this, system Back from
 * the first flow screen would land on an auth form, i.e. leave the flow.
 * Everyone else (signed out, legacy, completed) sees the page as before.
 */
export async function redirectUnfinishedGuidedAccount(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const [account] = await db
    .select({
      flow: accounts.onboardingFlow,
      completedAt: accounts.onboardingCompletedAt,
    })
    .from(accounts)
    .where(eq(accounts.id, user.id))
    .limit(1);
  if (account?.flow === 'guided' && !account.completedAt) {
    redirect('/onboarding');
  }
}
