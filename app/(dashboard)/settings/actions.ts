'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { detachWabaSubscription } from '@/lib/channels/whatsapp/client';
import { recordErasureArchive } from '@/lib/gdpr/archive';
import { buildPtExport, type PtExport } from '@/lib/gdpr/export';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/** Mark the active WhatsApp connection revoked so the PT can reconnect later. */
async function disconnectWhatsAppImpl(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [latest] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.ptId, user.id))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (latest) {
    await db
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(whatsappConnections.id, latest.id),
          eq(whatsappConnections.ptId, user.id),
        ),
      );
  }

  revalidatePath('/settings');
  revalidatePath('/settings/whatsapp');
}

export const disconnectWhatsApp = instrumentedAction(
  'settings.disconnectWhatsApp',
  disconnectWhatsAppImpl,
);

/**
 * Permanently delete the PT's auth user; the FK cascade purges all their data.
 * Order matters: the compliance archive is written before anything is deleted
 * (it must survive the cascade), WhatsApp is best-effort detached from Meta's
 * side, and only then is the auth user removed.
 */
async function deleteAccountImpl(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  try {
    await recordErasureArchive({
      ptId: user.id,
      scope: 'account',
      metadata: { deletedAt: new Date().toISOString() },
    });
  } catch {
    throw new Error('Could not delete account. Please try again.');
  }

  try {
    await detachWabaSubscription({ ptId: user.id });
  } catch {
    // Best-effort: a Meta-side detach failure must never block account deletion.
  }

  const admin = createServiceClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    throw new Error('Could not delete account. Please try again.');
  }

  await supabase.auth.signOut();
  redirect('/sign-in');
}

export const deleteAccount = instrumentedAction(
  'settings.deleteAccount',
  deleteAccountImpl,
);

/** Full-account GDPR export: settings, patients, conversations, everything scoped to this PT. */
async function exportPtImpl(): Promise<
  { ok: true; data: PtExport } | { ok: false }
> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const ptId = user.id;

  const data = await withAuditLog(
    { ptId, actor: 'pt', action: 'export.pt', targetTable: 'pts', targetId: ptId },
    () => buildPtExport(ptId),
  );
  return { ok: true, data };
}

export const exportPt = instrumentedAction('settings.exportPt', exportPtImpl);
