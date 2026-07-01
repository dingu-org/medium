import { eq } from 'drizzle-orm';
import { getTemplateStatus } from '@/lib/channels/whatsapp/client';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { inngest } from '../client';
import {
  applyTemplateStatus,
  bootstrapWaConnectionCore,
  FALLBACK_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE,
  type ReminderTemplateDefinition,
} from './bootstrap-wa-connection';

type ReconciliationResult = {
  name: string;
  status: 'pending' | 'approved' | 'rejected';
};

async function reconcileDefinition(args: {
  ptId: string;
  connectionId: string;
  template: ReminderTemplateDefinition;
}): Promise<ReconciliationResult> {
  const record = await bootstrapWaConnectionCore(args);
  if (record.status !== 'pending') {
    return { name: record.name, status: record.status };
  }

  const remote = await getTemplateStatus(args.connectionId, record.metaId);
  const status = await applyTemplateStatus({
    ptId: args.ptId,
    templateId: record.templateId,
    status: remote.status,
  });
  return { name: record.name, status };
}

export async function reconcileAlbanianReminderTemplatesCore(args: {
  ptId: string;
  connectionId: string;
}): Promise<ReconciliationResult> {
  const primary = await reconcileDefinition({
    ...args,
    template: REMINDER_TEMPLATE,
  });
  if (primary.status !== 'rejected') return primary;

  return reconcileDefinition({
    ...args,
    template: FALLBACK_REMINDER_TEMPLATE,
  });
}

export const reconcileAlbanianReminderTemplates = inngest.createFunction(
  {
    id: 'reconcile-albanian-reminder-templates',
    retries: 2,
    concurrency: 1,
  },
  { cron: '30 5 * * *' },
  async ({ step }) => {
    const connections = await step.run('load-active-connections', () =>
      db
        .select({
          id: whatsappConnections.id,
          ptId: whatsappConnections.ptId,
        })
        .from(whatsappConnections)
        .where(eq(whatsappConnections.status, 'active')),
    );

    const results: ReconciliationResult[] = [];
    for (const connection of connections) {
      results.push(
        await step.run(`reconcile-template-${connection.id}`, () =>
          reconcileAlbanianReminderTemplatesCore({
            ptId: connection.ptId,
            connectionId: connection.id,
          }),
        ),
      );
    }
    return { checked: connections.length, results };
  },
);
