import { and, eq, sql } from 'drizzle-orm';
import { messageTemplates } from '@/lib/db/schema';
import { getServiceClient } from '@/lib/tenancy';
import { submitTemplate } from '@/lib/channels/whatsapp/client';
import { inngest } from '../client';

// Shared reminder template (Option A from the spec — consistent wording across PTs).
// {{1}} = patient name, {{2}} = appointment time.
export const REMINDER_TEMPLATE = {
  name: 'appointment_reminder_24h',
  language: 'en_US',
  body: 'Hi {{1}}, this is a reminder of your appointment on {{2}}. Reply CONFIRM to keep it, CANCEL to cancel, or RESCHEDULE to change the time.',
} as const;

/**
 * Create the PT's reminder template on connect. Idempotent: a reconnect re-emits
 * `wa.connection.created`, so we skip if the template row already exists rather
 * than resubmitting to Meta. Factored out of the Inngest wrapper for direct testing.
 */
export async function bootstrapWaConnectionCore(args: {
  ptId: string;
  connectionId: string;
}): Promise<{ templateId: string; created: boolean }> {
  const { ptId, connectionId } = args;
  const svc = getServiceClient(ptId);

  const [existing] = await svc.db
    .select({ id: messageTemplates.id })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.ptId, ptId),
        eq(messageTemplates.name, REMINDER_TEMPLATE.name),
        eq(messageTemplates.language, REMINDER_TEMPLATE.language),
      ),
    )
    .limit(1);

  if (existing) return { templateId: existing.id, created: false };

  const { metaId } = await submitTemplate(
    connectionId,
    REMINDER_TEMPLATE.name,
    REMINDER_TEMPLATE.language,
    REMINDER_TEMPLATE.body,
  );

  const [row] = await svc.db
    .insert(messageTemplates)
    .values({
      ptId,
      name: REMINDER_TEMPLATE.name,
      language: REMINDER_TEMPLATE.language,
      status: 'pending',
      metaId,
      body: REMINDER_TEMPLATE.body,
      lastStatusAt: sql`now()`,
    })
    .returning({ id: messageTemplates.id });

  return { templateId: row.id, created: true };
}

export const bootstrapWaConnection = inngest.createFunction(
  { id: 'bootstrap-wa-connection' },
  { event: 'wa.connection.created' },
  async ({ event, step }) => {
    const { ptId, connectionId } = event.data;
    return step.run('create-reminder-template', () =>
      bootstrapWaConnectionCore({ ptId, connectionId }),
    );
    // Phase 5: poll Meta for approval (hourly, up to 72h), update
    // message_templates.status, and emit `wa.template.approved`.
  },
);
