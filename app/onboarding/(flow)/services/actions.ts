'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { db } from '@/lib/db';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { services } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { advanceFrom } from '@/lib/onboarding/flow-state';
import { requireActiveFlowAccount } from '@/lib/onboarding/guard';
import type { StepActionResult } from '@/lib/onboarding/step-result';
import {
  parseLek,
  serviceDescriptionField,
  serviceDurationField,
  serviceModeField,
  serviceNameField,
  servicePriceField,
} from '@/lib/services/fields';
import {
  activeServiceCount,
  maxActiveServicesFor,
  serviceCount,
  serviceLockKey,
} from '@/lib/services/limits';

export type ServiceStepInput = {
  /** The service being edited; null = a new one. */
  id: string | null;
  name: string;
  durationMinutes: number | null;
  /** Raw text; parsed here so the client never decides what a price is. */
  price: string;
  mode: string | null;
  description: string;
  active: boolean;
};

/** An active service that already has what the step needs (mode + description). */
async function hasOtherCompleteActive(
  accountId: string,
  excludeId: string | null,
): Promise<boolean> {
  const conditions = [
    eq(services.accountId, accountId),
    eq(services.active, true),
    sql`${services.mode} is not null`,
    sql`btrim(coalesce(${services.description}, '')) <> ''`,
  ];
  if (excludeId) conditions.push(ne(services.id, excludeId));
  const [row] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/**
 * Saves the one service this step collects. Edit vs create is decided by `id`;
 * a create whose normalised name already exists updates that row instead, so a
 * double submit or a lost-response retry never duplicates. Runs under the same
 * advisory lock as the settings actions, so the Free limit cannot be raced.
 * `null` (saved list shown, no form open) just continues when the step is done.
 */
export const saveServiceStep = instrumentedAction(
  'onboarding.saveServiceStep',
  async (raw: ServiceStepInput | null): Promise<StepActionResult> => {
    const accountId = await requireActiveFlowAccount();
    const s = t.onboarding.services;
    if (raw === null) return advanceFrom(accountId, 'services');

    // Each field is checked on its own so bad input is a field error, never a throw.
    const fieldErrors: Record<string, string> = {};
    const name = serviceNameField.safeParse(raw.name);
    if (!name.success) {
      const tooLong = typeof raw.name === 'string' && raw.name.length > 80;
      fieldErrors.name = tooLong
        ? t.onboarding.business.tooLong
        : s.nameRequired;
    }
    let duration: number | null = null;
    if (raw.durationMinutes === null || raw.durationMinutes === undefined) {
      fieldErrors.duration = s.durationRequired;
    } else {
      const parsed = serviceDurationField.safeParse(raw.durationMinutes);
      if (parsed.success) duration = parsed.data;
      else fieldErrors.duration = s.durationRange;
    }
    const priceNumber =
      typeof raw.price === 'string' ? parseLek(raw.price) : null;
    const price =
      priceNumber === null ? null : servicePriceField.safeParse(priceNumber);
    if (!price?.success) fieldErrors.price = s.priceRequired;
    const mode = serviceModeField.safeParse(raw.mode);
    if (!mode.success) fieldErrors.mode = s.modeRequired;
    const description = serviceDescriptionField.safeParse(raw.description);
    if (!description.success) {
      const tooLong =
        typeof raw.description === 'string' && raw.description.length > 500;
      fieldErrors.description = tooLong
        ? t.onboarding.business.tooLong
        : s.descriptionRequired;
    }

    const count = Object.keys(fieldErrors).length;
    if (count > 0) {
      return {
        ok: false,
        fieldErrors,
        reason: count === 1 ? t.onboarding.business.fixOne : s.fixMany(count),
      };
    }
    if (
      !name.success ||
      duration === null ||
      !price?.success ||
      !mode.success ||
      !description.success
    ) {
      throw new Error('unreachable');
    }

    const active = typeof raw.active === 'boolean' ? raw.active : true;
    const editId = z.string().uuid().safeParse(raw.id).data ?? null;
    const values = {
      name: name.data,
      durationMin: duration,
      priceLek: price.data,
      mode: mode.data,
      description: description.data,
      active,
    };

    const result = await withAdvisoryLock(
      serviceLockKey(accountId),
      async (): Promise<StepActionResult | null> => {
        const max = await maxActiveServicesFor(accountId);

        // Target row: the edited one (when it is this account's), else the
        // account's service with the same normalised name (idempotent retry).
        let targetId: string | null = null;
        if (editId) {
          const [row] = await db
            .select({ id: services.id })
            .from(services)
            .where(
              and(eq(services.id, editId), eq(services.accountId, accountId)),
            );
          targetId = row?.id ?? null;
        }
        if (!targetId) {
          const [row] = await db
            .select({ id: services.id })
            .from(services)
            .where(
              and(
                eq(services.accountId, accountId),
                sql`lower(btrim(${services.name})) = lower(btrim(${values.name}))`,
              ),
            );
          targetId = row?.id ?? null;
        }

        // Hiding the only complete service would leave the step unfinishable.
        if (!active && !(await hasOtherCompleteActive(accountId, targetId))) {
          return {
            ok: false,
            fieldErrors: { active: s.activeRequired },
            reason: t.onboarding.business.fixOne,
          };
        }

        try {
          if (targetId) {
            if (
              active &&
              max !== null &&
              (await activeServiceCount(accountId, targetId)) >= max
            ) {
              return { ok: false, reason: s.freeLimit };
            }
            await db
              .update(services)
              .set(values)
              .where(
                and(
                  eq(services.id, targetId),
                  eq(services.accountId, accountId),
                ),
              );
          } else {
            // A new service is refused at the cap whatever state the others
            // are in: on Free a second one cannot be added at all.
            if (max !== null && (await serviceCount(accountId)) >= max) {
              return { ok: false, reason: s.freeLimit };
            }
            await db.insert(services).values({ accountId, ...values });
          }
        } catch (error) {
          // Renaming onto another of the account's own services (paid plans).
          if (getPostgresErrorCode(error) === '23505') {
            return {
              ok: false,
              fieldErrors: { name: s.nameTaken },
              reason: t.onboarding.business.fixOne,
            };
          }
          throw error;
        }
        return null;
      },
    );
    if (result) return result;

    revalidatePath('/settings/services');
    return advanceFrom(accountId, 'services');
  },
);
