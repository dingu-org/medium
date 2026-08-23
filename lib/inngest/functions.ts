import type { InngestFunction } from 'inngest';
import { handleAppointmentEvent } from './functions/appointment-events';
import { billingRenewalMonitor } from './functions/billing-renewal-monitor';
import { billingUsageMonitor } from './functions/billing-usage-monitor';
import { bootstrapWaConnection } from './functions/bootstrap-wa-connection';
import { dailyCostRollup } from './functions/daily-cost-rollup';
import { dispatchPushNotification } from './functions/dispatch-push';
import { handleInboundMessage } from './functions/handle-inbound-message';
import { offerResumeAfterAccountInactivity } from './functions/offer-resume';
import {
  monitorWaTokenExpiry,
  pollQualityRating,
} from './functions/poll-whatsapp-health';
import { publishEventOutbox } from './functions/publish-event-outbox';
import { purgeExpiredMessages } from './functions/purge-expired-messages';
import { reconcileAlbanianReminderTemplates } from './functions/reconcile-reminder-templates';
import { reconcilePokOrders } from './functions/reconcile-pok-orders';
import { resumeBusinessAppAi } from './functions/resume-business-app-ai';
import { sendReminder } from './functions/send-reminder';
import { syncWhatsappCoexistence } from './functions/sync-whatsapp-coexistence';

export const functions: InngestFunction.Like[] = [
  bootstrapWaConnection,
  handleInboundMessage,
  handleAppointmentEvent,
  sendReminder,
  purgeExpiredMessages,
  offerResumeAfterAccountInactivity,
  resumeBusinessAppAi,
  syncWhatsappCoexistence,
  pollQualityRating,
  monitorWaTokenExpiry,
  reconcileAlbanianReminderTemplates,
  publishEventOutbox,
  dispatchPushNotification,
  dailyCostRollup,
  billingUsageMonitor,
  billingRenewalMonitor,
  reconcilePokOrders,
];
