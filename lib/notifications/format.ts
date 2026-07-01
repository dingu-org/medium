import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { sq } from 'date-fns/locale';

// Event `type` values from the `events` table that are worth surfacing to the
// PT in the notification bell. PT-initiated events (e.g. conversation.taken_over)
// are intentionally excluded — the PT did them.
export const NOTIFICATION_TYPES = [
  'appointment.booked',
  'appointment.confirmed',
  'appointment.cancelled',
  'appointment.rescheduled',
  'conversation.escalated',
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

export function formatTime(iso: string | undefined, timezone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return ` më ${format(new TZDate(date, timezone), 'EEE d MMM, HH:mm', { locale: sq })}`;
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
  const who = opts.patientName ?? 'Një klient';
  const when = formatTime(str(event.payload, 'startsAt'), opts.timezone);
  const base = { id: event.id, type: event.type, occurredAt: event.occurredAt };

  switch (event.type) {
    case 'appointment.booked':
      return {
        ...base,
        title: `${who} rezervoi një takim${when}`,
        icon: 'calendar-plus',
        href: '/calendar',
      };
    case 'appointment.confirmed':
      return {
        ...base,
        title: `${who} konfirmoi një takim${when}`,
        icon: 'check',
        href: '/calendar',
      };
    case 'appointment.cancelled': {
      const byPatient = str(event.payload, 'cancelledBy') === 'patient';
      return {
        ...base,
        title: byPatient
          ? `${who} anuloi një takim${when}`
          : `Një takim u anulua${when}`,
        icon: 'x',
        href: '/calendar',
      };
    }
    case 'appointment.rescheduled':
      return {
        ...base,
        title: `${who} ricaktoi një takim`,
        icon: 'repeat',
        href: '/calendar',
      };
    case 'conversation.escalated': {
      const conversationId = str(event.payload, 'conversationId');
      return {
        ...base,
        title: `${who} kërkoi të flasë me ty`,
        icon: 'alert',
        href: conversationId ? `/chat/${conversationId}` : '/chat',
      };
    }
    case 'conversation.failed':
      return {
        ...base,
        title: `Biseda me ${who} kërkon vëmendjen tënde`,
        icon: 'alert',
        href: '/chat',
      };
    case 'reminder.failed':
      return {
        ...base,
        title: 'Një kujtesë nuk u dërgua',
        icon: 'alert',
        href: '/calendar',
      };
    case 'wa.connection.revoked':
      return {
        ...base,
        title: 'WhatsApp u shkëput. Duhet rilidhur.',
        icon: 'unplug',
        href: '/settings',
      };
    default:
      return {
        ...base,
        title: 'Përditësim',
        icon: 'alert',
        href: '/calendar',
      };
  }
}
