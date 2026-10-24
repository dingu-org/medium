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

  return screenContextFor(accountId, facts, screen);
}

function screenContextFor(
  accountId: string,
  facts: FlowFacts,
  screen: FlowScreenId,
): ScreenContext {
  const previous = previousScreen(screen, facts);
  return {
    accountId,
    facts,
    progress: progressFor(screen, facts),
    backHref: previous ? screenHref(previous) : null,
  };
}

export type WhatsappScreenContext = Omit<ScreenContext, 'progress'> & {
  /** `null` when reopened after completion: "step 6 of 7" would be false. */
  progress: FlowProgress | null;
  /** A completed account reopening the step from the dashboard (MED-124). */
  reopened: boolean;
};

/**
 * The WhatsApp screens' entry. Unlike every other flow screen they stay open to
 * a completed account (reopened from the dashboard), so skipping the step never
 * closes the door on it. A completed account that is already connected has
 * nothing to do here and goes to the settings page. Everything else is exactly
 * `enterScreen('whatsapp')`.
 */
export async function enterWhatsappScreen(): Promise<WhatsappScreenContext> {
  const accountId = await requireUserId();
  const facts = await loadFlowFacts(accountId);

  if (facts.flow === 'legacy') redirect('/onboarding');
  if (facts.completed) {
    if (facts.whatsappConnected) redirect('/settings/whatsapp');
    return {
      accountId,
      facts,
      progress: null,
      backHref: '/today',
      reopened: true,
    };
  }
  if (!canVisit('whatsapp', facts)) redirect(screenHref(resumeScreen(facts)));

  return {
    ...screenContextFor(accountId, facts, 'whatsapp'),
    reopened: false,
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
