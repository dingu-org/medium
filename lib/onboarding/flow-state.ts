import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import type { BusinessType } from '@/lib/business-types';
import { db } from '@/lib/db';
import {
  accounts,
  availabilityRules,
  services,
  whatsappConnections,
} from '@/lib/db/schema';
import {
  isStepDone,
  nextScreen,
  resumeScreen,
  screenHref,
  type FlowFacts,
  type FlowScreenId,
  type SeenStepId,
} from './flow';
import type { ServiceMode } from '../services/modes';
import type { StepSuccess } from './step-result';
import { whereFieldsDone, whereNeeds, type WhereRow } from './where';

export type FlowAccountFacts = { flow: 'legacy' | 'guided' } & FlowFacts;

// Each step's "done" predicate sits in its own commented function, so a step
// ticket changes exactly one of them and the change reaches the resume logic,
// the gate, the progress total and the Where recalculation.

/** Business name and a type from the closed list (MED-117). */
function businessDone(row: {
  name: string | null;
  businessType: BusinessType | null;
}): boolean {
  return Boolean(row.name?.trim()) && row.businessType != null;
}

/** At least one active service with a mode and a description (MED-118). */
function servicesDone(
  active: { mode: ServiceMode | null; description: string | null }[],
): boolean {
  return active.some((s) => s.mode != null && Boolean(s.description?.trim()));
}

/** Every location group the active services' modes need is filled (MED-119). */
function whereDone(
  row: WhereRow,
  activeModes: (ServiceMode | null)[],
): boolean {
  return whereFieldsDone(whereNeeds(activeModes), row);
}

/** At least one weekly availability rule exists. */
function availabilityDone(ruleCount: number): boolean {
  return ruleCount > 0;
}

/** Always a fresh read: pages and actions call this on every render and save. */
export async function loadFlowFacts(
  accountId: string,
): Promise<FlowAccountFacts> {
  const [[account], activeServices, rules, connections] = await Promise.all([
    db
      .select({
        flow: accounts.onboardingFlow,
        name: accounts.name,
        businessType: accounts.businessType,
        address: accounts.address,
        city: accounts.city,
        serviceArea: accounts.serviceArea,
        introSeenAt: accounts.onboardingIntroSeenAt,
        whatsappSeenAt: accounts.onboardingWhatsappSeenAt,
        notificationsSeenAt: accounts.onboardingNotificationsSeenAt,
        completedAt: accounts.onboardingCompletedAt,
      })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1),
    db
      .select({
        id: services.id,
        mode: services.mode,
        description: services.description,
      })
      .from(services)
      .where(and(eq(services.accountId, accountId), eq(services.active, true))),
    db
      .select({ id: availabilityRules.id })
      .from(availabilityRules)
      .where(eq(availabilityRules.accountId, accountId))
      .limit(1),
    db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.accountId, accountId),
          eq(whatsappConnections.status, 'active'),
        ),
      )
      .limit(1),
  ]);
  if (!account) throw new Error('Account row missing');

  const activeModes = activeServices.map((s) => s.mode);

  return {
    flow: account.flow,
    introSeen: account.introSeenAt != null,
    business: businessDone(account),
    services: servicesDone(activeServices),
    serviceModes: activeModes,
    where: whereDone(account, activeModes),
    availability: availabilityDone(rules.length),
    whatsappSeen: account.whatsappSeenAt != null || connections.length > 0,
    notificationsSeen: account.notificationsSeenAt != null,
    completed: account.completedAt != null,
  };
}

const SEEN_COLUMNS = {
  intro: sql.identifier('onboarding_intro_seen_at'),
  whatsapp: sql.identifier('onboarding_whatsapp_seen_at'),
  notifications: sql.identifier('onboarding_notifications_seen_at'),
} as const;

/** Idempotent: the first timestamp wins, so a double tap changes nothing. */
export async function markStepSeen(
  accountId: string,
  step: SeenStepId,
): Promise<void> {
  const column = SEEN_COLUMNS[step];
  await db.execute(
    sql`update accounts set ${column} = coalesce(${column}, now()) where id = ${accountId}`,
  );
}

/** Sets the completion marker once; never touches legacy rows. */
export async function ensureOnboardingCompleted(
  accountId: string,
): Promise<void> {
  await db
    .update(accounts)
    .set({ onboardingCompletedAt: sql`now()` })
    .where(
      and(
        eq(accounts.id, accountId),
        eq(accounts.onboardingFlow, 'guided'),
        sql`${accounts.onboardingCompletedAt} is null`,
      ),
    );
}

/**
 * The success result of a step save: reloads the facts and points at the next
 * screen. A step that is still not done (it cannot be skipped) resumes at the
 * first unfinished one instead.
 */
export async function advanceFrom(
  accountId: string,
  screen: FlowScreenId,
): Promise<StepSuccess> {
  const facts = await loadFlowFacts(accountId);
  const target =
    screen !== 'finish' && !isStepDone(screen, facts)
      ? resumeScreen(facts)
      : nextScreen(screen, facts);
  revalidatePath('/onboarding', 'layout');
  return { ok: true, next: screenHref(target) };
}
