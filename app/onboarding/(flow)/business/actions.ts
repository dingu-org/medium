'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

const schema = z.string().trim().min(1).max(120);

// PLACEHOLDER(MED-117): replaced together with the screen.
export const saveBusinessPlaceholder = instrumentedAction(
  'onboarding.saveBusiness',
  async (name: string): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const parsed = schema.safeParse(name);
    if (!parsed.success) {
      // PLACEHOLDER(MED-117) copy
      return { ok: false, fieldErrors: { name: 'Shkruaj emrin e biznesit.' } };
    }
    await db
      .update(accounts)
      .set({ name: parsed.data })
      .where(eq(accounts.id, accountId));
    return advanceFrom(accountId, 'business');
  },
);
