'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { patients } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { createManualPatient } from '@/lib/clients/mutations';
import { erasePatient as erasePatientData } from '@/lib/patients/erase';
import { buildPatientExport, type PatientExport } from '@/lib/gdpr/export';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';

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

async function createManualClientImpl(input: {
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

  await withAuditLog(
    {
      ptId,
      actor: 'pt',
      action: 'patient.created',
      targetTable: 'patients',
      targetId: created.id,
    },
    async () => created,
  );

  revalidatePath('/clients');
  return { ok: true, clientId: created.id };
}

export const createManualClient = instrumentedAction(
  'clients.createManualClient',
  createManualClientImpl,
);

async function updateClientNotesImpl(
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
  const updated = await withAuditLog(
    {
      ptId,
      actor: 'pt',
      action: 'patient.notes_updated',
      targetTable: 'patients',
      targetId: clientId,
    },
    async () => {
      const [row] = await db
        .update(patients)
        .set({ notes: value.data || null })
        .where(and(eq(patients.id, clientId), eq(patients.ptId, ptId)))
        .returning({ id: patients.id });
      return row;
    },
  );
  if (!updated)
    return { ok: false, code: 'NOT_FOUND', error: 'Klienti nuk u gjet.' };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export const updateClientNotes = instrumentedAction(
  'clients.updateClientNotes',
  updateClientNotesImpl,
);

/** Right-to-erasure: delegates the transactional cascade + audit write to lib/patients/erase. */
async function erasePatientImpl(patientId: string): Promise<{ ok: boolean }> {
  const ptId = await requirePtId();
  await erasePatientData({ patientId, ptId });
  revalidatePath('/clients');
  return { ok: true };
}

export const erasePatient = instrumentedAction(
  'clients.erasePatient',
  erasePatientImpl,
);

/** Per-patient GDPR data export (DSAR shape). */
async function exportPatientImpl(
  patientId: string,
): Promise<{ ok: true; data: PatientExport } | { ok: false }> {
  const ptId = await requirePtId();
  const data = await withAuditLog(
    {
      ptId,
      actor: 'pt',
      action: 'export.patient',
      targetTable: 'patients',
      targetId: patientId,
    },
    () => buildPatientExport({ ptId, patientId }),
  );
  if (!data) return { ok: false };
  return { ok: true, data };
}

export const exportPatient = instrumentedAction(
  'clients.exportPatient',
  exportPatientImpl,
);
