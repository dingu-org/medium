/**
 * Guided-onboarding funnel trail (MED-125): one content-free row per
 * (account, step, outcome) in `onboarding_events`. Only step and outcome are
 * stored; see migration 0039 for why this is its own table.
 */
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appEnv } from '@/lib/env/app-env';
import { logger, serializeError } from '@/lib/log';
import { FLOW_STEPS, type FlowScreenId } from './flow';

export const FUNNEL_STEPS = [
  ...FLOW_STEPS,
  'finish',
] as const satisfies readonly FlowScreenId[];

export const FUNNEL_OUTCOMES = [
  'shown',
  'completed',
  'skipped',
  'not_applicable',
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];
export type FunnelOutcome = (typeof FUNNEL_OUTCOMES)[number];

/** Bump when the flow changes shape, so old and new trails stay distinguishable. */
export const ONBOARDING_FLOW_VERSION = 1;

/**
 * Records one funnel event. Never throws: a funnel write must not fail or slow
 * a step. Eligibility lives in the statement itself: only a guided account
 * emits, and a completed one only for 'finish' (a legacy account, or a
 * completed account reopening WhatsApp, writes nothing). A repeat is a no-op
 * (unique index), so the first occurrence wins.
 */
export async function recordOnboardingEvent(
  accountId: string,
  step: FunnelStep,
  outcome: FunnelOutcome,
): Promise<void> {
  try {
    await db.execute(sql`
      insert into onboarding_events (account_id, step, outcome, flow_version, app_env)
      select id, ${step}::onboarding_step, ${outcome}::onboarding_event_outcome,
             ${ONBOARDING_FLOW_VERSION}, ${appEnv()}
      from accounts
      where id = ${accountId}
        and onboarding_flow = 'guided'
        and (onboarding_completed_at is null or ${step} = 'finish')
      on conflict (account_id, step, outcome) do nothing
    `);
  } catch (error) {
    // Only step, outcome and the error: never the request's values.
    logger.warn('onboarding.funnel_write_failed', 'Onboarding funnel write failed', {
      account_id: accountId,
      step,
      outcome,
      ...serializeError(error),
    });
  }
}

/**
 * The one result of a step across its events: completed beats skipped beats
 * not_applicable (a skip followed by a later completion counts as completed).
 * `null`: no terminal event yet.
 */
export function finalOutcome(
  outcomes: readonly FunnelOutcome[],
): 'completed' | 'skipped' | 'not_applicable' | null {
  if (outcomes.includes('completed')) return 'completed';
  if (outcomes.includes('skipped')) return 'skipped';
  if (outcomes.includes('not_applicable')) return 'not_applicable';
  return null;
}
