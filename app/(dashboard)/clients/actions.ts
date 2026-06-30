'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { patients } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { createManualPatient } from '@/lib/clients/mutations';

export type ClientActionResult =
  | { ok: true; clientId?: string }
  | {
      ok: false;
      code: 'INVALID_PHONE' | 'DUPLICATE_PHONE' | 'INVALID' | 'NOT_FOUND';
      error: string;
    };

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(1000).optional(),
});

export async function createManualClient(input: {
  name: string;
  phone: string;
  notes?: string;
}): Promise<ClientActionResult> {
  const ptId = await requirePtId();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin dhe telefonin.',
    };
  }
  const created = await createManualPatient({ ptId, ...parsed.data });
  if ('failure' in created && created.failure === 'INVALID_PHONE') {
    return {
      ok: false,
      code: 'INVALID_PHONE',
      error:
        'Përdor një numër me 8 deri në 15 shifra, përfshirë prefiksin e shtetit.',
    };
  }
  if ('failure' in created) {
    return {
      ok: false,
      code: 'DUPLICATE_PHONE',
      error: 'Një klient me këtë numër ekziston tashmë.',
    };
  }

  revalidatePath('/clients');
  return { ok: true, clientId: created.id };
}

export async function updateClientNotes(
  clientId: string,
  notes: string,
): Promise<ClientActionResult> {
  const ptId = await requirePtId();
  const value = z.string().trim().max(1000).safeParse(notes);
  if (!value.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Shënimi është shumë i gjatë.',
    };
  }
  const [updated] = await db
    .update(patients)
    .set({ notes: value.data || null })
    .where(and(eq(patients.id, clientId), eq(patients.ptId, ptId)))
    .returning({ id: patients.id });
  if (!updated)
    return { ok: false, code: 'NOT_FOUND', error: 'Klienti nuk u gjet.' };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
