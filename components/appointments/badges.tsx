import {
  StatusPill,
  type StatusPillTone,
} from '@/components/ui/status-pill';
import { t } from '@/lib/i18n';
import type { AppointmentStatus } from '@/lib/appointments';

const STATUS_TONE: Record<AppointmentStatus, StatusPillTone> = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'danger',
  completed: 'neutral',
  no_show: 'danger',
  rescheduled: 'brand',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <StatusPill tone={STATUS_TONE[status]} dot>
      {t.status[status]}
    </StatusPill>
  );
}

export type ReminderInfo = {
  status: string;
  responseType: string | null;
  skippedReason?: string | null;
} | null;

export function reminderBadge(
  r: ReminderInfo,
): { label: string; tone: StatusPillTone } | null {
  if (!r) return null;
  switch (r.status) {
    case 'scheduled':
    case 'requeued':
      return { label: t.reminder.pending, tone: 'warning' };
    case 'sent':
      if (r.responseType === 'confirm')
        return { label: t.reminder.confirmed, tone: 'success' };
      if (r.responseType === 'cancel')
        return { label: t.reminder.cancelledByCustomer, tone: 'danger' };
      if (r.responseType === 'reschedule_requested')
        return { label: t.reminder.wantsReschedule, tone: 'warning' };
      return { label: t.reminder.sent, tone: 'neutral' };
    case 'skipped':
      // A plan-cap skip is a flag, not a routine skip: warn tone + explicit copy
      // so the PT sees why the reminder didn't go out (Phase 16 C3).
      if (r.skippedReason === 'plan_reminder_quota')
        return { label: t.reminder.quotaReached, tone: 'warning' };
      return { label: t.reminder.skipped, tone: 'neutral' };
    case 'failed':
      return { label: t.reminder.failed, tone: 'danger' };
    default:
      return null;
  }
}

export function ReminderBadge({ reminder }: { reminder: ReminderInfo }) {
  const badge = reminderBadge(reminder);
  if (!badge) return null;
  return (
    <StatusPill tone={badge.tone} mono>
      {badge.label}
    </StatusPill>
  );
}
