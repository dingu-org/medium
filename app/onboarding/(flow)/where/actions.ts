'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

const schema = z.string().trim().min(1).max(200);

// PLACEHOLDER(MED-119): replaced together with the screen.
export const saveWherePlaceholder = instrumentedAction(
  'onboarding.saveWhere',
  async (address: string): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const parsed = schema.safeParse(address);
    if (!parsed.success) {
      // PLACEHOLDER(MED-119) copy
      return { ok: false, fieldErrors: { address: 'Shkruaj adresën.' } };
    }
    await db
      .update(accounts)
      .set({ address: parsed.data })
      .where(eq(accounts.id, accountId));
    return advanceFrom(accountId, 'where');
  },
);
