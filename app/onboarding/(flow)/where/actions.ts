'use server';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import {
  cityField,
  directionsField,
  entranceField,
  floorField,
  parkingField,
  serviceAreaField,
  streetAddressField,
} from '@/lib/accounts/location-fields';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { advanceFrom, loadFlowFacts } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import {
  FIXED_COUNTRY,
  whereNeeds,
  type WhereDraft,
} from '@/lib/onboarding/where';

export type WhereInput = WhereDraft;

const businessSchema = z.object({
  city: cityField,
  address: streetAddressField,
  directions: directionsField,
  parking: parkingField,
  entrance: entranceField,
  floor: floorField,
});
const clientSchema = z.object({ serviceArea: serviceAreaField });

/**
 * Saves the groups the active services' modes need, in one UPDATE (a double
 * submit writes the same values twice). The server decides the needs from the
 * saved services, so a stale tab can neither skip a required field nor write a
 * hidden group. Values of a group that is not needed are never touched.
 */
export const saveWhere = instrumentedAction(
  'onboarding.saveWhere',
  async (raw: WhereInput): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const { serviceModes } = await loadFlowFacts(accountId);
    const needs = whereNeeds(serviceModes);
    const input: Record<string, unknown> =
      raw && typeof raw === 'object' ? raw : {};

    const fieldErrors: Record<string, string> = {};
    const collect = (error: z.ZodError) => {
      for (const [key, messages] of Object.entries(
        error.flatten().fieldErrors,
      )) {
        const first = (messages as string[] | undefined)?.[0];
        if (first) fieldErrors[key] = first;
      }
    };
    const business = needs.atBusiness
      ? businessSchema.safeParse(input)
      : undefined;
    const client = needs.atClient ? clientSchema.safeParse(input) : undefined;
    if (business && !business.success) collect(business.error);
    if (client && !client.success) collect(client.error);

    const count = Object.keys(fieldErrors).length;
    if (count > 0) {
      return {
        ok: false,
        fieldErrors,
        reason: count === 1 ? t.onboarding.business.fixOne : undefined,
      };
    }

    const set = {
      ...(business?.success
        ? {
            country: FIXED_COUNTRY,
            city: business.data.city,
            address: business.data.address,
            // Emptied optional details are cleared: the user emptied them on screen.
            directions: business.data.directions ?? null,
            parking: business.data.parking ?? null,
            entrance: business.data.entrance ?? null,
            floor: business.data.floor ?? null,
          }
        : {}),
      ...(client?.success ? { serviceArea: client.data.serviceArea } : {}),
    };
    if (Object.keys(set).length > 0) {
      await db.update(accounts).set(set).where(eq(accounts.id, accountId));
    }
    return advanceFrom(accountId, 'where');
  },
);
