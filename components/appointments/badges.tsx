import { Badge } from '@/components/ui/badge';
import type { AppointmentStatus } from '@/lib/appointments';

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

const STATUS: Record<AppointmentStatus, { label: string; variant: Variant }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  confirmed: { label: 'Confirmed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  completed: { label: 'Completed', variant: 'outline' },
  no_show: { label: 'No-show', variant: 'destructive' },
  rescheduled: { label: 'Rescheduled', variant: 'secondary' },
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export type ReminderInfo = {
  status: string;
  responseType: string | null;
} | null;

export function reminderBadge(
  r: ReminderInfo,
): { label: string; variant: Variant } | null {
  if (!r) return null;
  switch (r.status) {
    case 'scheduled':
    case 'requeued':
      return { label: 'Reminder pending', variant: 'secondary' };
    case 'sent':
      if (r.responseType === 'confirm')
        return { label: 'Confirmed', variant: 'default' };
      if (r.responseType === 'cancel')
        return { label: 'Cancelled by patient', variant: 'destructive' };
      if (r.responseType === 'reschedule_requested')
        return { label: 'Wants to reschedule', variant: 'secondary' };
      return { label: 'Reminder sent', variant: 'outline' };
    case 'skipped':
      return { label: 'Reminder skipped', variant: 'outline' };
    case 'failed':
      return { label: 'Reminder failed', variant: 'destructive' };
    default:
      return null;
  }
}

export function ReminderBadge({ reminder }: { reminder: ReminderInfo }) {
  const badge = reminderBadge(reminder);
  if (!badge) return null;
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}
