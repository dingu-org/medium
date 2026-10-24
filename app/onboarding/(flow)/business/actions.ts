'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import {
  businessNameField,
  ownerNameField,
  taglineField,
  titleField,
} from '@/lib/accounts/profile-fields';
import { businessTypeSchema } from '@/lib/business-types';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';

const schema = z.object({
  name: businessNameField,
  fullName: ownerNameField,
  title: titleField,
  tagline: taglineField,
});

export type BusinessInput = {
  name: string;
  businessType: string | null;
  fullName: string;
  title: string;
  tagline: string;
};

const OPTIONAL_KEYS = ['fullName', 'title', 'tagline'];

/**
 * Saves the whole step: name and type are required, the rest optional (empty
 * clears). One UPDATE, so a double submit writes the same row twice. The type
 * is checked against the closed list here and again by the database enum.
 */
export const saveBusiness = instrumentedAction(
  'onboarding.saveBusiness',
  async (raw: BusinessInput): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const parsed = schema.safeParse(raw);
    // Checked on its own so a bad value is a field error, never a throw.
    const type = businessTypeSchema.safeParse(raw?.businessType);

    const fieldErrors: Record<string, string> = {};
    if (!parsed.success) {
      for (const [key, messages] of Object.entries(
        parsed.error.flatten().fieldErrors,
      )) {
        if (!messages?.[0]) continue;
        fieldErrors[key] = OPTIONAL_KEYS.includes(key)
          ? t.onboarding.business.tooLong
          : messages[0];
      }
    }
    if (!type.success) {
      fieldErrors.businessType = t.onboarding.business.typeRequired;
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        ok: false,
        fieldErrors,
        reason:
          Object.keys(fieldErrors).length === 1
            ? t.onboarding.business.fixOne
            : undefined,
      };
    }
    if (!parsed.success || !type.success) throw new Error('unreachable');

    await db
      .update(accounts)
      .set({
        name: parsed.data.name,
        businessType: type.data,
        fullName: parsed.data.fullName ?? null,
        title: parsed.data.title ?? null,
        tagline: parsed.data.tagline ?? null,
      })
      .where(eq(accounts.id, accountId));
    return advanceFrom(accountId, 'business');
  },
);
