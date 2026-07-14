import type { NotificationPrefs } from '@/app/(dashboard)/settings/constants';
import type { BackgroundEventPayloads } from '@/lib/events/background';
import { formatTime } from './format';
import type { PushPayload } from './push';

type Ev<K extends keyof BackgroundEventPayloads> = {
  name: K;
  data: BackgroundEventPayloads[K];
};

/** The subset of background events that produce a PT push notification. */
export type PushEvent =
  | Ev<'notification.requested'>
  | Ev<'conversation.escalated'>
  | Ev<'conversation.resume_offered'>
  | Ev<'wa.connection.revoked'>
  | Ev<'reminder.failed'>
  | Ev<'billing.limit_warning'>
  | Ev<'billing.limit_reached'>;

/** Maps each push event to the Settings toggle that gates it. */
export function pushPrefKey(event: PushEvent): keyof NotificationPrefs {
  switch (event.name) {
    case 'notification.requested': {
      const byKind = {
        'appointment.booked': 'booking',
        'appointment.cancelled': 'cancellation',
        'appointment.rescheduled': 'reschedule',
      } as const;
      return byKind[event.data.kind];
    }
    case 'conversation.escalated':
      return 'escalation';
    case 'conversation.resume_offered':
      return 'resumeOffer';
    case 'wa.connection.revoked':
      return 'connection';
    case 'reminder.failed':
      return 'reminderFailure';
    case 'billing.limit_warning':
    case 'billing.limit_reached':
      return 'billing';
  }
}

/**
 * Build the push payload for an event. Patient names are kept out of the title
 * (iOS lock-screen privacy) and surfaced in the body instead. `tag`
 * deduplicates repeat pushes for the same subject on the device.
 */
export function buildPushPayload(
  event: PushEvent,
  opts: { patientName?: string; timezone: string },
): PushPayload | null {
  const who = opts.patientName ?? 'Një klient';

  switch (event.name) {
    case 'notification.requested': {
      const when = formatTime(event.data.startsAt, opts.timezone);
      const url = `/calendar?appointmentId=${event.data.appointmentId}`;
      switch (event.data.kind) {
        case 'appointment.booked':
          return {
            title: 'Rezervim i ri',
            body: `${who} rezervoi një takim${when}`,
            url,
            tag: `appointment-${event.data.appointmentId}-booked`,
          };
        case 'appointment.cancelled':
          return {
            title: 'Takim i anuluar',
            body: `${who} anuloi një takim${when}`,
            url,
            tag: `appointment-${event.data.appointmentId}-cancelled`,
          };
        case 'appointment.rescheduled':
          return {
            title: 'Takim i ricaktuar',
            body: `${who} ricaktoi një takim${when}`,
            url,
            tag: `appointment-${event.data.appointmentId}-rescheduled`,
          };
      }
      return null;
    }
    case 'conversation.escalated':
      return {
        title: 'Kërkohet ndihma jote',
        body: `${who} kërkoi të flasë me ty`,
        url: `/chat/${event.data.conversationId}`,
        tag: `conversation-${event.data.conversationId}-escalated`,
      };
    case 'conversation.resume_offered':
      return {
        title: 'Ta rimarr bisedën?',
        body: `Dëshiron ta rimarr asistenti bisedën me ${who}?`,
        url: `/chat/${event.data.conversationId}`,
        tag: `conversation-${event.data.conversationId}-resume`,
      };
    case 'wa.connection.revoked':
      return {
        title: 'WhatsApp u shkëput',
        body: 'Lidhja u ndërpre. Rilidhe që asistenti të vazhdojë.',
        url: '/settings',
        tag: `connection-${event.data.connectionId}-revoked`,
      };
    case 'reminder.failed':
      return {
        title: 'Kujtesa nuk u dërgua',
        body: 'Një kujtesë për një takim nuk arriti të dërgohej.',
        url: `/calendar?appointmentId=${event.data.appointmentId}`,
        tag: `appointment-${event.data.appointmentId}-reminder-failed`,
      };
    // Neutral "monthly limit" copy fits both conversation and reminder kinds;
    // the tag keeps kind separate so the two never collapse on the device.
    case 'billing.limit_warning':
      return {
        title: 'Po i afrohesh kufirit mujor',
        body: 'Prek për të parë përdorimin e këtij muaji.',
        url: '/settings/billing',
        tag: `billing-warning-${event.data.kind}-${event.data.monthKey}`,
      };
    case 'billing.limit_reached':
      return {
        title: 'Arrite kufirin mujor',
        body: 'Ke arritur kufirin tënd mujor. Prek për detaje.',
        url: '/settings/billing',
        tag: `billing-reached-${event.data.kind}-${event.data.monthKey}`,
      };
  }
}
