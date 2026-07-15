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

export function NotificationPrefs({ prefs }: { prefs: NotificationPrefs }) {
  const online = useOnlineStatus();
  return (
    <>
      {GROUPS.map((group) => (
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
