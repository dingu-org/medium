'use server';

import { and, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { appointments, services } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { t } from '@/lib/i18n';
import {
  serviceDurationField,
  serviceNameField,
  servicePriceField,
} from '@/lib/services/fields';
import {
  activeServiceCount,
  maxActiveServicesFor,
  serviceLockKey,
} from '@/lib/services/limits';
import { createServerClient } from '@/lib/supabase/server';

export type ServiceMutationResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'INVALID'
        | 'DUPLICATE'
        | 'NOT_FOUND'
        | 'HAS_APPOINTMENTS'
        | 'PLAN_LIMIT'
        | 'UNKNOWN';
      error: string;
    };

const planLimitResult: ServiceMutationResult = {
  ok: false,
  code: 'PLAN_LIMIT',
  error: t.billing.gateServices,
};

const serviceSchema = z.object({
  name: serviceNameField,
  durationMinutes: serviceDurationField,
  priceLek: servicePriceField.nullable(),
});

async function requireAccountId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

function failure(error: unknown): ServiceMutationResult {
  if (getPostgresErrorCode(error) === '23505') {
    return {
      ok: false,
      code: 'DUPLICATE',
      error: 'Një shërbim me këtë emër ekziston tashmë.',
    };
  }
  return {
    ok: false,
    code: 'UNKNOWN',
    error: 'Shërbimi nuk u ruajt. Provo sërish.',
  };
}

async function createServiceImpl(input: {
  name: string;
  durationMinutes: number;
  priceLek: number | null;
}): Promise<ServiceMutationResult> {
  const accountId = await requireAccountId();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin, kohëzgjatjen dhe çmimin.',
    };
  }
  // New services default to active — gate on the plan's active-service cap under
  // an advisory lock so two concurrent creates can't both slip past the limit.
  return withAdvisoryLock(serviceLockKey(accountId), async () => {
    const max = await maxActiveServicesFor(accountId);
    if (max !== null && (await activeServiceCount(accountId)) >= max) {
      return planLimitResult;
    }
    try {
      await db.insert(services).values({
        accountId,
        name: parsed.data.name,
        durationMin: parsed.data.durationMinutes,
        priceLek: parsed.data.priceLek,
      });
      revalidatePath('/settings/services');
      revalidatePath('/settings');
      revalidatePath('/onboarding');
      return { ok: true };
    } catch (error) {
      return failure(error);
    }
  });
}

export const createService = instrumentedAction(
  'services.createService',
  createServiceImpl,
);

async function updateServiceImpl(
  serviceId: string,
  input: { name: string; durationMinutes: number; priceLek: number | null },
): Promise<ServiceMutationResult> {
  const accountId = await requireAccountId();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin, kohëzgjatjen dhe çmimin.',
    };
  }
  try {
    const [updated] = await db
      .update(services)
      // priceLek is always set — null clears an existing price.
      .set({
        name: parsed.data.name,
        durationMin: parsed.data.durationMinutes,
        priceLek: parsed.data.priceLek,
      })
      .where(and(eq(services.id, serviceId), eq(services.accountId, accountId)))
      .returning({ id: services.id });
    if (!updated)
      return { ok: false, code: 'NOT_FOUND', error: 'Shërbimi nuk u gjet.' };
    revalidatePath('/settings/services');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export const updateService = instrumentedAction(
  'services.updateService',
  updateServiceImpl,
);

async function setServiceActiveImpl(
  serviceId: string,
  active: boolean,
): Promise<ServiceMutationResult> {
  const accountId = await requireAccountId();

  async function flip(): Promise<ServiceMutationResult> {
    const [updated] = await db
      .update(services)
      .set({ active })
      .where(and(eq(services.id, serviceId), eq(services.accountId, accountId)))
      .returning({ id: services.id });
    if (!updated)
      return { ok: false, code: 'NOT_FOUND', error: 'Shërbimi nuk u gjet.' };
    revalidatePath('/settings/services');
    revalidatePath('/settings');
    revalidatePath('/onboarding');
    return { ok: true };
  }

  // Deactivating never needs a guard (it frees a slot — this is the swap path).
  if (!active) return flip();

  // Activating is gated on the plan cap under a lock so a concurrent activation
  // can't slip a second service past a 1-active-service plan. Count OTHER active
  // services: activating this one is allowed only if that count is under the cap.
  return withAdvisoryLock(serviceLockKey(accountId), async () => {
    const max = await maxActiveServicesFor(accountId);
    if (max !== null && (await activeServiceCount(accountId, serviceId)) >= max) {
      return planLimitResult;
    }
    return flip();
  });
}

export const setServiceActive = instrumentedAction(
  'services.setServiceActive',
  setServiceActiveImpl,
);

async function deleteServiceImpl(
  serviceId: string,
): Promise<ServiceMutationResult> {
  const accountId = await requireAccountId();

  // Appointments link to a service by name (service_type text), not a FK.
  const [svc] = await db
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.accountId, accountId)))
    .limit(1);
  if (!svc) return { ok: false, code: 'NOT_FOUND', error: 'Shërbimi nuk u gjet.' };

  // Guard: any appointment (any status) referencing this service by name blocks
  // deletion — the service must be deactivated instead, preserving history.
  const [ref] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.accountId, accountId),
        sql`lower(btrim(${appointments.serviceType})) = lower(btrim(${svc.name}))`,
      ),
    )
    .limit(1);
  if (ref)
    return {
      ok: false,
      code: 'HAS_APPOINTMENTS',
      error:
        'Ky shërbim përdoret nga takime ekzistuese. Çaktivizoje në vend që ta fshish.',
    };

  await db
    .delete(services)
    .where(and(eq(services.id, serviceId), eq(services.accountId, accountId)));
  revalidatePath('/settings/services');
  revalidatePath('/settings');
  revalidatePath('/onboarding');
  return { ok: true };
}

export const deleteService = instrumentedAction(
  'services.deleteService',
  deleteServiceImpl,
);
