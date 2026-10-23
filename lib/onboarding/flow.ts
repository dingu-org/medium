/**
 * Pure logic of the guided onboarding flow (MED-115): the step order, which
 * steps apply, what is done and where to resume. No database access, so every
 * rule here is unit-testable. `flow-state.ts` builds the `FlowFacts` snapshot
 * these functions read.
 */

export const FLOW_STEPS = [
  'intro',
  'business',
  'services',
  'where',
  'availability',
  'whatsapp',
  'notifications',
] as const;

export type FlowStepId = (typeof FLOW_STEPS)[number];
export type FlowScreenId = FlowStepId | 'finish';

/** Done from saved data. The others (`SEEN_STEPS`) remember "seen or skipped". */
export const REQUIRED_STEPS = [
  'business',
  'services',
  'where',
  'availability',
] as const satisfies readonly FlowStepId[];
export const SEEN_STEPS = [
  'intro',
  'whatsapp',
  'notifications',
] as const satisfies readonly FlowStepId[];

export type SeenStepId = (typeof SEEN_STEPS)[number];

export const SCREEN_SLUGS: Record<FlowScreenId, string> = {
  intro: 'how-it-works',
  business: 'business',
  services: 'services',
  where: 'where',
  availability: 'availability',
  whatsapp: 'whatsapp',
  notifications: 'notifications',
  finish: 'finish',
};

export function screenHref(screen: FlowScreenId): string {
  return `/onboarding/${SCREEN_SLUGS[screen]}`;
}

/** How a service is delivered. MED-118 uses these exact values for its column. */
export type ServiceMode = 'at_business' | 'at_client' | 'online';

export type FlowFacts = {
  introSeen: boolean;
  business: boolean;
  services: boolean;
  /** Modes of the active services; `null` until the services carry a mode. */
  serviceModes: (ServiceMode | null)[];
  where: boolean;
  availability: boolean;
  whatsappSeen: boolean;
  notificationsSeen: boolean;
  completed: boolean;
};

/**
 * Where is skipped (and counts as done) only for a business whose saved
 * services are all online. Before the services are saved, it applies.
 */
export function whereApplies(f: FlowFacts): boolean {
  return !(
    f.services &&
    f.serviceModes.length > 0 &&
    f.serviceModes.every((mode) => mode === 'online')
  );
}

export function applicableSteps(f: FlowFacts): FlowStepId[] {
  return FLOW_STEPS.filter((step) => step !== 'where' || whereApplies(f));
}

export function isStepDone(step: FlowStepId, f: FlowFacts): boolean {
  switch (step) {
    case 'intro':
      return f.introSeen;
    case 'business':
      return f.business;
    case 'services':
      return f.services;
    case 'where':
      return !whereApplies(f) || f.where;
    case 'availability':
      return f.availability;
    case 'whatsapp':
      return f.whatsappSeen;
    case 'notifications':
      return f.notificationsSeen;
  }
}

export function requiredDone(f: FlowFacts): boolean {
  return REQUIRED_STEPS.every((step) => isStepDone(step, f));
}

/** First applicable step that is not done, else the Finish screen. */
export function resumeScreen(f: FlowFacts): FlowScreenId {
  return applicableSteps(f).find((step) => !isStepDone(step, f)) ?? 'finish';
}

/**
 * A screen may be opened when it is at or before the resume point. Finish only
 * when everything is done, or once onboarding is complete.
 */
export function canVisit(screen: FlowScreenId, f: FlowFacts): boolean {
  const resume = resumeScreen(f);
  if (screen === 'finish') return resume === 'finish' || f.completed;
  const steps = applicableSteps(f);
  const index = steps.indexOf(screen);
  if (index === -1) return false;
  if (resume === 'finish') return true;
  return index <= steps.indexOf(resume);
}

export function nextScreen(screen: FlowScreenId, f: FlowFacts): FlowScreenId {
  if (screen === 'finish') return 'finish';
  const steps = applicableSteps(f);
  // A screen that no longer applies (Where after a mode change) continues from
  // its place in the full order.
  const position = FLOW_STEPS.indexOf(screen);
  return steps.find((step) => FLOW_STEPS.indexOf(step) > position) ?? 'finish';
}

export function previousScreen(
  screen: FlowScreenId,
  f: FlowFacts,
): FlowStepId | null {
  if (screen === 'intro' || screen === 'finish') return null;
  const position = FLOW_STEPS.indexOf(screen);
  const earlier = applicableSteps(f).filter(
    (step) => FLOW_STEPS.indexOf(step) < position,
  );
  return earlier.at(-1) ?? null;
}

export type FlowProgress =
  | { kind: 'step'; position: number; total: number }
  | { kind: 'complete'; total: number };

export function progressFor(screen: FlowScreenId, f: FlowFacts): FlowProgress {
  const steps = applicableSteps(f);
  if (screen === 'finish') return { kind: 'complete', total: steps.length };
  const index = steps.indexOf(screen);
  return {
    kind: 'step',
    position: index === -1 ? 1 : index + 1,
    total: steps.length,
  };
}
