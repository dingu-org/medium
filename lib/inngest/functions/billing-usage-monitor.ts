import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import {
  countScheduledRemindersInMonth,
  emitConversationUsageEventIfCrossed,
  emitReminderPredictiveWarningOnce,
  getReminderUsage,
} from '@/lib/billing/usage';
import { inngest } from '../client';

export type UsageMonitorResult = {
  ptsScanned: number;
  reminderWarnings: number;
  conversationEvents: number;
};

/**
 * Distinct PTs with an active WhatsApp connection — the only PTs that can accrue
 * reminder or conversation usage (both arrive over WhatsApp).
 */
async function activeConnectionAccountIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ accountId: whatsappConnections.accountId })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.status, 'active'));
  return rows.map((row) => row.accountId);
}

/**
 * Daily usage sweep (Phase 16 C3). Per active PT:
 *  - Predictive reminder warning: if reminders still queued for this month's
 *    appointments (`upcoming`) would exhaust the remaining quota, warn once.
 *  - Belt-and-braces conversation re-check: re-emit an 80%/at-cap event that a
 *    race let the inline gate miss (deduped, so it never double-fires).
 * Every emit is once-per-(PT, type, kind, month) via the shared events-exists
 * dedupe, so retries and daily re-runs are safe.
 */
export async function runBillingUsageMonitor(
  now: Date = new Date(),
): Promise<UsageMonitorResult> {
  const accountIds = await activeConnectionAccountIds();
  let reminderWarnings = 0;
  let conversationEvents = 0;

  for (const accountId of accountIds) {
    const usage = await getReminderUsage(accountId, now);
    if (usage.limit > 0) {
      const upcoming = await countScheduledRemindersInMonth(accountId, now);
      if (upcoming > usage.remaining) {
        await emitReminderPredictiveWarningOnce({
          accountId,
          monthKey: usage.monthKey,
          used: usage.used,
          limit: usage.limit,
          remaining: usage.remaining,
          upcoming,
        });
        reminderWarnings++;
      }
    }

    const conv = await emitConversationUsageEventIfCrossed(accountId, now);
    if (conv !== 'none') conversationEvents++;
  }

  return { ptsScanned: accountIds.length, reminderWarnings, conversationEvents };
}

export const billingUsageMonitor = inngest.createFunction(
  { id: 'billing-usage-monitor', retries: 2, concurrency: 1 },
  { cron: '0 6 * * *' },
  async ({ step }) => step.run('scan-usage', () => runBillingUsageMonitor()),
);
