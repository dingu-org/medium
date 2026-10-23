import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import {
  canVisit,
  previousScreen,
  progressFor,
  resumeScreen,
  screenHref,
  type FlowFacts,
  type FlowProgress,
  type FlowScreenId,
} from './flow';
import { ensureOnboardingCompleted, loadFlowFacts } from './flow-state';

export type ScreenContext = {
  accountId: string;
  facts: FlowFacts;
  progress: FlowProgress;
  /** `null` for the first and the Finish screens: no Back. */
  backHref: string | null;
};

async function requireUserId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

/** Next.js prefetches must never complete onboarding; only a real visit does. */
async function isPrefetch(): Promise<boolean> {
  const h = await headers();
  return (
    h.has('next-router-prefetch') ||
    h.get('purpose')?.toLowerCase() === 'prefetch'
  );
}

/**
 * Every flow page starts here. Legacy accounts go back to the old checklist,
 * completed accounts to the dashboard (except Finish itself), and a screen
 * beyond the resume point or one that does not apply goes to the resume screen.
 */
export async function enterScreen(
  screen: FlowScreenId,
): Promise<ScreenContext> {
  const accountId = await requireUserId();
  const facts = await loadFlowFacts(accountId);

  if (facts.flow === 'legacy') redirect('/onboarding');
  if (facts.completed && screen !== 'finish') redirect('/today');
  if (!canVisit(screen, facts)) redirect(screenHref(resumeScreen(facts)));

  if (screen === 'finish' && !facts.completed && !(await isPrefetch())) {
    await ensureOnboardingCompleted(accountId);
  }

  const previous = previousScreen(screen, facts);
  return {
    accountId,
    facts,
    progress: progressFor(screen, facts),
    backHref: previous ? screenHref(previous) : null,
  };
}

/** The same checks for server actions: only an active guided account may save. */
export async function requireActiveFlowAccount(): Promise<string> {
  const accountId = await requireUserId();
  const facts = await loadFlowFacts(accountId);
  if (facts.flow === 'legacy') redirect('/onboarding');
  if (facts.completed) redirect('/today');
  return accountId;
}
