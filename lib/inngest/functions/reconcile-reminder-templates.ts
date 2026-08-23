import { and, eq, sql } from 'drizzle-orm';
import { editTemplate, getTemplateStatus } from '@/lib/channels/whatsapp/client';
import { db } from '@/lib/db';
import { messageTemplates, whatsappConnections } from '@/lib/db/schema';
import { getServiceClient } from '@/lib/tenancy';
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

/**
 * Zero-width sentinel stamped onto `message_templates.body` once an example-fix
 * repair edit has been submitted for a rejected template. `body` is audit-only
 * metadata — `sendTemplate` sends positional `{{n}}` params and never reads this
 * text — so it doubles as a no-migration loop-bound: a rejected row already
 * carrying the marker for its current body has been repaired once and is not
 * edited again. Without it the daily cron would edit → re-review → reject on any
 * content Meta keeps rejecting, forever. Bumping the suffix (…-v3) forces a fresh
 * repair pass if the example fix ever needs to change.
 */
export const EXAMPLE_FIX_MARKER = '\u200b#example-fix-v2';

/** Canonical stored body for a template whose example-fix repair has been applied. */
export function repairedBody(body: string): string {
  return `${body}${EXAMPLE_FIX_MARKER}`;
}

/**
 * Re-submit a rejected template with the current body + example values, then flip
 * the local row to `pending` so the normal status poll picks it up on the next
 * run. Bounded: returns false without editing when the stored body already
 * carries the repair marker for the current body, so a template Meta keeps
 * rejecting is edited at most once per body version.
 */
async function repairRejectedTemplate(args: {
  accountId: string;
  connectionId: string;
  template: ReminderTemplateDefinition;
  templateId: string;
  metaId: string;
  storedBody: string;
}): Promise<boolean> {
  const target = repairedBody(args.template.body);
  if (args.storedBody === target) return false;

  await editTemplate(
    args.connectionId,
    args.metaId,
    args.template.body,
    args.template.exampleValues,
  );
  await getServiceClient(args.accountId)
    .db.update(messageTemplates)
    .set({ status: 'pending', body: target, lastStatusAt: sql`now()` })
    .where(
      and(
        eq(messageTemplates.id, args.templateId),
        eq(messageTemplates.accountId, args.accountId),
      ),
    );
  return true;
}

async function reconcileDefinition(args: {
  accountId: string;
  connectionId: string;
  template: ReminderTemplateDefinition;
}): Promise<ReconciliationResult> {
  const record = await bootstrapWaConnectionCore(args);

  if (record.status === 'rejected' && record.metaId) {
    const [row] = await getServiceClient(args.accountId)
      .db.select({ body: messageTemplates.body })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.id, record.templateId),
          eq(messageTemplates.accountId, args.accountId),
        ),
      )
      .limit(1);

    if (
      row &&
      (await repairRejectedTemplate({
        accountId: args.accountId,
        connectionId: args.connectionId,
        template: args.template,
        templateId: record.templateId,
        metaId: record.metaId,
        storedBody: row.body,
      }))
    ) {
      return { name: record.name, status: 'pending' };
    }
    return { name: record.name, status: 'rejected' };
  }

  if (record.status !== 'pending') {
    return { name: record.name, status: record.status };
  }

  const remote = await getTemplateStatus(args.connectionId, record.metaId);
  const status = await applyTemplateStatus({
    accountId: args.accountId,
    templateId: record.templateId,
    status: remote.status,
  });
  return { name: record.name, status };
}

export async function reconcileAlbanianReminderTemplatesCore(args: {
  accountId: string;
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
          accountId: whatsappConnections.accountId,
        })
        .from(whatsappConnections)
        .where(eq(whatsappConnections.status, 'active')),
    );

    const results: ReconciliationResult[] = [];
    for (const connection of connections) {
      results.push(
        await step.run(`reconcile-template-${connection.id}`, () =>
          reconcileAlbanianReminderTemplatesCore({
            accountId: connection.accountId,
            connectionId: connection.id,
          }),
        ),
      );
    }
    return { checked: connections.length, results };
  },
);
