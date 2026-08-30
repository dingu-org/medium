'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { GroupedList, GroupedListRow } from '@/components/ui/grouped-list';
import { Switch } from '@/components/ui/switch';
import { useOnlineStatus } from '@/lib/hooks/realtime';
import { t } from '@/lib/i18n';
import type { NotificationPrefs } from '../constants';
import { setNotificationPref } from './actions';

type PrefKey = keyof NotificationPrefs;

const GROUPS: {
  title: string;
  rows: { key: PrefKey; label: string; description?: string }[];
}[] = [
  {
    title: t.settings.notifGroupAppointments,
    rows: [
      { key: 'booking', label: t.settings.notifNewBookings },
      { key: 'cancellation', label: t.settings.notifCancellations },
      { key: 'reschedule', label: t.settings.notifReschedules },
    ],
  },
  {
    title: t.settings.notifGroupConversations,
    rows: [
      {
        key: 'escalation',
        label: t.settings.notifEscalations,
        description: t.settings.notifEscalationSub,
      },
      {
        key: 'manualReply',
        label: t.settings.notifManualReply,
        description: t.settings.notifManualReplySub,
      },
      { key: 'resumeOffer', label: t.settings.notifResumeOffer },
    ],
  },
  {
    title: t.settings.notifGroupSystem,
    rows: [
      { key: 'connection', label: t.settings.notifConnection },
      { key: 'reminderFailure', label: t.settings.notifReminderFailure },
      {
        key: 'billing',
        label: t.settings.notifBilling,
        description: t.settings.notifBillingSub,
      },
    ],
  },
];

/** One autosaving toggle. Owns its own transition so a pending write on one
 *  row never disables the others; reverts + toasts on failure. */
function PrefSwitch({
  prefKey,
  initial,
  label,
  online,
}: {
  prefKey: PrefKey;
  initial: boolean;
  label: string;
  online: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={on}
      disabled={pending || !online}
      aria-label={label}
      onCheckedChange={(next) => {
        setOn(next);
        startTransition(async () => {
          try {
            await setNotificationPref(prefKey, next);
          } catch {
            setOn(!next);
            toast.error(t.settings.notifSaveFailed);
          }
        });
      }}
    />
  );
}

export function NotificationPrefs({
  prefs,
  remindersEnabled,
}: {
  prefs: NotificationPrefs;
  /**
   * Read on the server (lib/reminders/flag.ts) and handed down, because the
   * flag has no `NEXT_PUBLIC_` twin. Required rather than defaulted: there is
   * one caller, and a silent default would let an omission decide whether a
   * parked feature is advertised.
   */
  remindersEnabled: boolean;
}) {
  const online = useOnlineStatus();
  // Reminders are parked (lib/reminders/flag.ts). `reminderFailure` stays in
  // NOTIFICATION_PREF_KEYS as dormant config — the stored preference is
  // preserved for the rebuild — but nothing can send a reminder, so nothing can
  // report one failing. A toggle for a notification that can never arrive is a
  // promise the product no longer keeps, so hide the row with the feature.
  const groups = remindersEnabled
    ? GROUPS
    : GROUPS.map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.key !== 'reminderFailure'),
      })).filter((group) => group.rows.length > 0);
  return (
    <>
      {groups.map((group) => (
        <GroupedList key={group.title} title={group.title}>
          {group.rows.map((row) => (
            <GroupedListRow
              key={row.key}
              title={row.label}
              titleWeight="medium"
              description={row.description}
              accessory={
                <PrefSwitch
                  prefKey={row.key}
                  initial={prefs[row.key]}
                  label={row.label}
                  online={online}
                />
              }
            />
          ))}
        </GroupedList>
      ))}
    </>
  );
}
