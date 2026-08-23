'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { customers } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';
import { createManualCustomer } from '@/lib/clients/mutations';
import { eraseCustomer as eraseCustomerData } from '@/lib/customers/erase';
import { buildCustomerExport, type CustomerExport } from '@/lib/gdpr/export';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';

export type ClientActionResult =
  | { ok: true; clientId?: string }
  | {
      ok: false;
      code: 'INVALID_PHONE' | 'DUPLICATE_PHONE' | 'INVALID' | 'NOT_FOUND';
      error: string;
    };

async function requireAccountId(): Promise<string> {
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
  const accountId = await requireAccountId();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID',
      error: 'Kontrollo emrin dhe telefonin.',
    };
  }
  const created = await createManualCustomer({ accountId, ...parsed.data });
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
      accountId,
      actor: 'account',
      action: 'customer.created',
      targetTable: 'customers',
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
  const accountId = await requireAccountId();
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
      accountId,
      actor: 'account',
      action: 'customer.notes_updated',
      targetTable: 'customers',
      targetId: clientId,
    },
    async () => {
      const [row] = await db
        .update(customers)
        .set({ notes: value.data || null })
        .where(and(eq(customers.id, clientId), eq(customers.accountId, accountId)))
        .returning({ id: customers.id });
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

/** Right-to-erasure: delegates the transactional cascade + audit write to lib/customers/erase. */
async function eraseCustomerImpl(customerId: string): Promise<{ ok: boolean }> {
  const accountId = await requireAccountId();
  await eraseCustomerData({ customerId, accountId });
  revalidatePath('/clients');
  return { ok: true };
}

export const eraseCustomer = instrumentedAction(
  'clients.eraseCustomer',
  eraseCustomerImpl,
);

/** Per-customer GDPR data export (DSAR shape). */
async function exportCustomerImpl(
  customerId: string,
): Promise<{ ok: true; data: CustomerExport } | { ok: false }> {
  const accountId = await requireAccountId();
  const data = await withAuditLog(
    {
      accountId,
      actor: 'account',
      action: 'export.customer',
      targetTable: 'customers',
      targetId: customerId,
    },
    () => buildCustomerExport({ accountId, customerId }),
  );
  if (!data) return { ok: false };
  return { ok: true, data };
}

export const exportCustomer = instrumentedAction(
  'clients.exportCustomer',
  exportCustomerImpl,
);
