import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

// Event `type` values from the `events` table that are worth surfacing to the
// PT in the notification bell. PT-initiated events (e.g. conversation.taken_over)
// are intentionally excluded — the PT did them.
export const NOTIFICATION_TYPES = [
  'appointment.booked',
  'appointment.confirmed',
  'appointment.cancelled',
  'appointment.rescheduled',
  'conversation.failed',
  'reminder.failed',
  'wa.connection.revoked',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export function isNotificationType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

export type NotificationView = {
  id: string;
  type: string;
  title: string;
  /** Icon key the client maps to a Lucide icon. */
  icon: 'calendar-plus' | 'check' | 'x' | 'repeat' | 'alert' | 'unplug';
  href: string;
  occurredAt: string;
};

type Payload = Record<string, unknown>;

function str(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function formatTime(iso: string | undefined, timezone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return ` for ${format(new TZDate(date, timezone), 'EEE d MMM, HH:mm')}`;
}

/**
 * Build a human-readable notification line from an event row. `patientName` is
 * resolved by the caller (a join on the payload's patientId); falls back to a
 * neutral label when absent.
 */
export function formatNotification(
  event: { id: string; type: string; payload: Payload; occurredAt: string },
  opts: { timezone: string; patientName?: string },
): NotificationView {
  const who = opts.patientName ?? 'A patient';
  const when = formatTime(str(event.payload, 'startsAt'), opts.timezone);
  const base = { id: event.id, type: event.type, occurredAt: event.occurredAt };

  switch (event.type) {
    case 'appointment.booked':
      return {
        ...base,
        title: `${who} booked an appointment${when}`,
        icon: 'calendar-plus',
        href: '/calendar',
      };
    case 'appointment.confirmed':
      return {
        ...base,
        title: `${who} confirmed an appointment${when}`,
        icon: 'check',
        href: '/calendar',
      };
    case 'appointment.cancelled': {
      const byPatient = str(event.payload, 'cancelledBy') === 'patient';
      return {
        ...base,
        title: byPatient
          ? `${who} cancelled an appointment${when}`
          : `An appointment was cancelled${when}`,
        icon: 'x',
        href: '/calendar',
      };
    }
    case 'appointment.rescheduled':
      return {
        ...base,
        title: `${who} rescheduled an appointment`,
        icon: 'repeat',
        href: '/calendar',
      };
    case 'conversation.failed':
      return {
        ...base,
        title: `A conversation with ${who.toLowerCase() === 'a patient' ? 'a patient' : who} needs your attention`,
        icon: 'alert',
        href: '/chat',
      };
    case 'reminder.failed':
      return {
        ...base,
        title: 'A reminder failed to send',
        icon: 'alert',
        href: '/calendar',
      };
    case 'wa.connection.revoked':
      return {
        ...base,
        title: 'WhatsApp disconnected — reconnect needed',
        icon: 'unplug',
        href: '/settings',
      };
    default:
      return {
        ...base,
        title: 'Update',
        icon: 'alert',
        href: '/calendar',
      };
  }
}
