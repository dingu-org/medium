import { redirect } from 'next/navigation';
import { t } from '@/lib/i18n';
import { resumeScreen, screenHref } from '@/lib/onboarding/flow';
import { loadFlowFacts } from '@/lib/onboarding/flow-state';
import { createServerClient } from '@/lib/supabase/server';
import { LegacyChecklist } from './legacy-checklist';

export const metadata = { title: t.onboarding.metaTitle };

/**
 * Entry point for both flows. Legacy accounts get the old checklist; guided
 * accounts are sent to the screen they should be on (or to the dashboard once
 * onboarding is complete).
 */
export default async function OnboardingPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const facts = await loadFlowFacts(user.id);
  if (facts.flow === 'guided') {
    redirect(facts.completed ? '/today' : screenHref(resumeScreen(facts)));
  }

  return <LegacyChecklist userId={user.id} />;
}
