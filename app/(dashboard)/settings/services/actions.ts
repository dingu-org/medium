'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { appointments, services } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { sanitizePromptField } from '@/lib/ai/prompt';
import { getPlan } from '@/lib/billing/plans';
import { loadEffectivePlan } from '@/lib/billing/read-model';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { t } from '@/lib/i18n';
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

/** Active services for a PT, optionally excluding one (the one being toggled). */
async function activeServiceCount(
  ptId: string,
  excludeId?: string,
): Promise<number> {
  const conditions = [eq(services.ptId, ptId), eq(services.active, true)];
  if (excludeId) conditions.push(ne(services.id, excludeId));
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(services)
    .where(and(...conditions));
  return row?.count ?? 0;
}

const planLimitResult: ServiceMutationResult = {
  ok: false,
  code: 'PLAN_LIMIT',
  error: t.billing.gateServices,
};

const serviceSchema = z.object({
  // Service names are listed in the system prompt as context bullets, so a line
  // break in one would render as a bullet of its own (lib/ai/prompt.ts).
  name: z.preprocess(
    (v) => (typeof v === 'string' ? sanitizePromptField(v) : v),
    z.string().min(1).max(80),
  ),
  durationMinutes: z.number().int().min(5).max(480),
  // Aligned with the DB CHECK (price_lek > 0); max keeps int4 overflow a
  // clean INVALID instead of a Postgres 22003.
  priceLek: z.number().int().positive().max(2_147_483_647).nullable(),
});

async function requirePtId(): Promise<string> {
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
  const ptId = await requirePtId();
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
  return withAdvisoryLock(`usage:services:${ptId}`, async () => {
    const max = getPlan(await loadEffectivePlan(ptId)).maxActiveServices;
    if (max !== null && (await activeServiceCount(ptId)) >= max) {
      return planLimitResult;
    }
    try {
      await db.insert(services).values({
        ptId,
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
  const ptId = await requirePtId();
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
      .where(and(eq(services.id, serviceId), eq(services.ptId, ptId)))
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
  const ptId = await requirePtId();

  async function flip(): Promise<ServiceMutationResult> {
    const [updated] = await db
      .update(services)
      .set({ active })
      .where(and(eq(services.id, serviceId), eq(services.ptId, ptId)))
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
  return withAdvisoryLock(`usage:services:${ptId}`, async () => {
    const max = getPlan(await loadEffectivePlan(ptId)).maxActiveServices;
    if (max !== null && (await activeServiceCount(ptId, serviceId)) >= max) {
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
  const ptId = await requirePtId();

  // Appointments link to a service by name (service_type text), not a FK.
  const [svc] = await db
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.ptId, ptId)))
    .limit(1);
  if (!svc) return { ok: false, code: 'NOT_FOUND', error: 'Shërbimi nuk u gjet.' };

  // Guard: any appointment (any status) referencing this service by name blocks
  // deletion — the service must be deactivated instead, preserving history.
  const [ref] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.ptId, ptId),
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
    .where(and(eq(services.id, serviceId), eq(services.ptId, ptId)));
  revalidatePath('/settings/services');
  revalidatePath('/settings');
  revalidatePath('/onboarding');
  return { ok: true };
}

export const deleteService = instrumentedAction(
  'services.deleteService',
  deleteServiceImpl,
);
