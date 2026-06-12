import type { InngestFunction } from 'inngest';
import { handleAppointmentEvent } from './functions/appointment-events';
import { bootstrapWaConnection } from './functions/bootstrap-wa-connection';
import { handleInboundMessage } from './functions/handle-inbound-message';
import { offerResumeAfterPtInactivity } from './functions/offer-resume';
import {
  monitorWaTokenExpiry,
  pollQualityRating,
} from './functions/poll-whatsapp-health';
import { publishEventOutbox } from './functions/publish-event-outbox';
import { purgeExpiredMessages } from './functions/purge-expired-messages';
import { sendReminder } from './functions/send-reminder';

export const functions: InngestFunction.Like[] = [
  bootstrapWaConnection,
  handleInboundMessage,
  handleAppointmentEvent,
  sendReminder,
  purgeExpiredMessages,
  offerResumeAfterPtInactivity,
  pollQualityRating,
  monitorWaTokenExpiry,
  publishEventOutbox,
];
