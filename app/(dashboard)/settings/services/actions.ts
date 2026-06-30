'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import { services } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

export type ServiceMutationResult =
  | { ok: true }
  | {
      ok: false;
      code: 'INVALID' | 'DUPLICATE' | 'NOT_FOUND' | 'UNKNOWN';
      error: string;
    };

const serviceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480),
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

export async function createService(input: {
  name: string;
  durationMinutes: number;
}): Promise<ServiceMutationResult> {
  const ptId = await requirePtId();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin dhe kohëzgjatjen.',
    };
  }
  try {
    await db.insert(services).values({
      ptId,
      name: parsed.data.name,
      durationMin: parsed.data.durationMinutes,
    });
    revalidatePath('/settings/services');
    revalidatePath('/onboarding');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateService(
  serviceId: string,
  input: { name: string; durationMinutes: number },
): Promise<ServiceMutationResult> {
  const ptId = await requirePtId();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin dhe kohëzgjatjen.',
    };
  }
  try {
    const [updated] = await db
      .update(services)
      .set({ name: parsed.data.name, durationMin: parsed.data.durationMinutes })
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

export async function setServiceActive(
  serviceId: string,
  active: boolean,
): Promise<ServiceMutationResult> {
  const ptId = await requirePtId();
  const [updated] = await db
    .update(services)
    .set({ active })
    .where(and(eq(services.id, serviceId), eq(services.ptId, ptId)))
    .returning({ id: services.id });
  if (!updated)
    return { ok: false, code: 'NOT_FOUND', error: 'Shërbimi nuk u gjet.' };
  revalidatePath('/settings/services');
  revalidatePath('/onboarding');
  return { ok: true };
}
