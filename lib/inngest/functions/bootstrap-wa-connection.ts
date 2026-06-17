import { and, eq, sql } from 'drizzle-orm';
import { messageTemplates } from '@/lib/db/schema';
import { getServiceClient } from '@/lib/tenancy';
import {
  getTemplateStatus,
  submitTemplate,
} from '@/lib/channels/whatsapp/client';
import { inngest } from '../client';

export type ReminderTemplateDefinition = {
  name: string;
  language: 'en_US';
  body: string;
  variableSet: 'v2' | 'legacy';
};

// Shared reminder templates (Option A from the spec — consistent wording across PTs).
// v2 {{1}} = patient first name, {{2}} = practice name, {{3}} = appointment time.
export const REMINDER_TEMPLATE: ReminderTemplateDefinition = {
  name: 'appointment_reminder_24h_v2',
  language: 'en_US',
  body: 'Hi {{1}}, this is a reminder about your appointment with {{2}} on {{3}}. Reply CONFIRM to confirm, CANCEL to cancel, or RESCHEDULE to change the time.',
  variableSet: 'v2',
};

export const FALLBACK_REMINDER_TEMPLATE: ReminderTemplateDefinition = {
  name: 'appointment_reminder_24h_fallback',
  language: 'en_US',
  body: 'Hi {{1}}, reminder: your appointment with {{2}} is on {{3}}. Reply CONFIRM, CANCEL, or RESCHEDULE.',
  variableSet: 'v2',
};

export const LEGACY_REMINDER_TEMPLATE: ReminderTemplateDefinition = {
  name: 'appointment_reminder_24h',
  language: 'en_US',
  body: 'Hi {{1}}, this is a reminder of your appointment on {{2}}. Reply CONFIRM to keep it, CANCEL to cancel, or RESCHEDULE to change the time.',
  variableSet: 'legacy',
};

export const REMINDER_TEMPLATE_PRIORITY = [
  REMINDER_TEMPLATE,
  FALLBACK_REMINDER_TEMPLATE,
  LEGACY_REMINDER_TEMPLATE,
] as const;

/**
 * Create the PT's reminder template on connect. Idempotent: a reconnect re-emits
 * `wa.connection.created`, so we skip if the template row already exists rather
 * than resubmitting to Meta. Factored out of the Inngest wrapper for direct testing.
 */
export async function bootstrapWaConnectionCore(args: {
  ptId: string;
  connectionId: string;
  template?: ReminderTemplateDefinition;
}): Promise<{
  templateId: string;
  metaId: string;
  status: 'pending' | 'approved' | 'rejected';
  created: boolean;
  name: string;
}> {
  const { ptId, connectionId } = args;
  const template = args.template ?? REMINDER_TEMPLATE;
  const svc = getServiceClient(ptId);

  const [existing] = await svc.db
    .select({
      id: messageTemplates.id,
      metaId: messageTemplates.metaId,
      status: messageTemplates.status,
    })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.ptId, ptId),
        eq(messageTemplates.name, template.name),
        eq(messageTemplates.language, template.language),
      ),
    )
    .limit(1);

  if (existing?.metaId) {
    return {
      templateId: existing.id,
      metaId: existing.metaId,
      status: existing.status,
      created: false,
      name: template.name,
    };
  }

  const { metaId } = await submitTemplate(
    connectionId,
    template.name,
    template.language,
    template.body,
  );

  const [row] = await svc.db
    .insert(messageTemplates)
    .values({
      ptId,
      name: template.name,
      language: template.language,
      status: 'pending',
      metaId,
      body: template.body,
      lastStatusAt: sql`now()`,
    })
    .returning({ id: messageTemplates.id });

  return {
    templateId: row.id,
    metaId,
    status: 'pending',
    created: true,
    name: template.name,
  };
}

export async function applyTemplateStatus(args: {
  ptId: string;
  templateId: string;
  status: string;
}): Promise<'pending' | 'approved' | 'rejected'> {
  const normalized = args.status.toUpperCase();
  const status =
    normalized === 'APPROVED'
      ? 'approved'
      : normalized === 'REJECTED'
        ? 'rejected'
        : 'pending';
  await getServiceClient(args.ptId)
    .db.update(messageTemplates)
    .set({ status, lastStatusAt: sql`now()` })
    .where(
      and(
        eq(messageTemplates.id, args.templateId),
        eq(messageTemplates.ptId, args.ptId),
      ),
    );
  return status;
}

export const bootstrapWaConnection = inngest.createFunction(
  {
    id: 'bootstrap-wa-connection',
    retries: 2,
    idempotency: 'event.id',
  },
  { event: 'wa.connection.created' },
  async ({ event, step }) => {
    const { ptId, connectionId } = event.data;
    let template = await step.run('create-reminder-template', () =>
      bootstrapWaConnectionCore({ ptId, connectionId }),
    );
    if (template.status === 'approved') {
      return { status: template.status, existing: true };
    }
    if (template.status === 'rejected') {
      template = await step.run('create-fallback-reminder-template', () =>
        bootstrapWaConnectionCore({
          ptId,
          connectionId,
          template: FALLBACK_REMINDER_TEMPLATE,
        }),
      );
      if (template.status === 'approved' || template.status === 'rejected') {
        return {
          status: template.status,
          existing: !template.created,
          fallback: true,
        };
      }
    }

    for (let attempt = 1; attempt <= 72; attempt++) {
      const status = await step.run(
        `poll-template-status-${attempt}`,
        async () => {
          const result = await getTemplateStatus(connectionId, template.metaId);
          return applyTemplateStatus({
            ptId,
            templateId: template.templateId,
            status: result.status,
          });
        },
      );

      if (status === 'approved') {
        await step.sendEvent('emit-template-approved', {
          name: 'wa.template.approved',
          data: {
            ptId,
            templateId: template.templateId,
            metaId: template.metaId,
          },
        });
        return { status };
      }
      if (status === 'rejected') {
        await step.sendEvent('emit-template-rejected', {
          name: 'wa.template.rejected',
          data: {
            ptId,
            templateId: template.templateId,
            metaId: template.metaId,
          },
        });
        if (template.name === REMINDER_TEMPLATE.name) {
          template = await step.run('create-fallback-reminder-template', () =>
            bootstrapWaConnectionCore({
              ptId,
              connectionId,
              template: FALLBACK_REMINDER_TEMPLATE,
            }),
          );
          if (template.status === 'approved') {
            await step.sendEvent('emit-fallback-template-approved', {
              name: 'wa.template.approved',
              data: {
                ptId,
                templateId: template.templateId,
                metaId: template.metaId,
              },
            });
            return { status: 'approved', fallback: true };
          }
          if (template.status === 'rejected') {
            await step.sendEvent('emit-fallback-template-rejected', {
              name: 'wa.template.rejected',
              data: {
                ptId,
                templateId: template.templateId,
                metaId: template.metaId,
              },
            });
            return { status: 'rejected', fallback: true };
          }
          continue;
        }
        return { status, fallback: true };
      }
      if (attempt < 72) {
        await step.sleep(`wait-template-poll-${attempt}`, '1h');
      }
    }

    await step.sendEvent('emit-template-timeout', {
      name: 'wa.template.timed_out',
      data: {
        ptId,
        templateId: template.templateId,
        metaId: template.metaId,
      },
    });
    return { status: 'timed_out' };
  },
);
