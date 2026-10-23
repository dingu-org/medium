'use server';

import { and, eq, sql } from 'drizzle-orm';
import { instrumentedAction } from '@/lib/actions/instrument';
import { db } from '@/lib/db';
import { accounts, services } from '@/lib/db/schema';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

// PLACEHOLDER(MED-118): replaced together with the screen. Relies on
// `servicesConfiguredAt` until the signup trigger stops seeding services.
export const confirmServicesPlaceholder = instrumentedAction(
  'onboarding.confirmServices',
  async (): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const [active] = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.accountId, accountId), eq(services.active, true)))
      .limit(1);
    if (!active) {
      // PLACEHOLDER(MED-118) copy
      return {
        ok: false,
        reason: 'Shto të paktën një shërbim.',
        fieldErrors: {},
      };
    }
    await db
      .update(accounts)
      .set({
        servicesConfiguredAt: sql`coalesce(${accounts.servicesConfiguredAt}, now())`,
      })
      .where(eq(accounts.id, accountId));
    return advanceFrom(accountId, 'services');
  },
);
