'use server';

import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { detachWabaSubscription } from '@/lib/channels/whatsapp/client';
import { recordErasureArchive } from '@/lib/gdpr/archive';
import { buildAccountExport, type AccountExport } from '@/lib/gdpr/export';
import { logger } from '@/lib/log';
import { withAuditLog } from '@/lib/tenancy';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * Detach Medium from the PT's WABA at Meta and mark their connection revoked
 * (they can reconnect later, which mints a new token).
 */
async function disconnectWhatsAppImpl(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const [latest] = await db
    .select({ id: whatsappConnections.id, status: whatsappConnections.status })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.accountId, user.id))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  if (latest) {
    // Detach Medium's app from the WABA first — while the row is still active,
    // which is what detachWabaSubscription requires — so Meta stops POSTing the
    // PT's customer messages to our webhook once they have disconnected.
    let detached = false;
    try {
      ({ detached } = await detachWabaSubscription({ accountId: user.id }));
    } catch {
      // Best-effort: a Meta-side detach failure must never block the disconnect.
    }

    // The token is dropped with the status flip: nothing may decrypt a Graph
    // token that outlived the PT's disconnect. Reconnecting writes a fresh one.
    // It survives only while Meta still has us subscribed, because it is the
    // sole credential that can finish the detach — dropping it there would
    // leave Medium receiving this WABA's customer messages with no way out.
    await db
      .update(whatsappConnections)
      .set({
        status: 'revoked',
        ...(detached ? { accessTokenEncrypted: null } : {}),
      })
      .where(
        and(
          eq(whatsappConnections.id, latest.id),
          eq(whatsappConnections.accountId, user.id),
        ),
      );

    if (!detached && latest.status === 'active') {
      // Meta may still POST this WABA's customer messages to our webhook, so the
      // failure needs to be visible — the client-side detach only console.warns.
      logger.warn(
        'settings.waba_detach_failed',
        'WhatsApp disconnected locally but Meta still has the app subscribed',
        { accountId: user.id, connectionId: latest.id },
      );
    }
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
      accountId: user.id,
      scope: 'account',
      metadata: { deletedAt: new Date().toISOString() },
    });
  } catch {
    throw new Error('Could not delete account. Please try again.');
  }

  try {
    await detachWabaSubscription({ accountId: user.id });
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

/** Full-account GDPR export: settings, customers, conversations, everything scoped to this PT. */
async function exportAccountImpl(): Promise<
  { ok: true; data: AccountExport } | { ok: false }
> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  const accountId = user.id;

  const data = await withAuditLog(
    { accountId, actor: 'account', action: 'export.account', targetTable: 'accounts', targetId: accountId },
    () => buildAccountExport(accountId),
  );
  return { ok: true, data };
}

export const exportAccount = instrumentedAction('settings.exportAccount', exportAccountImpl);
