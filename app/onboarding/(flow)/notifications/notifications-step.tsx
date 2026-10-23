'use client';

import { Bell, BellOff, CalendarCheck, CalendarX } from 'lucide-react';
import { useState } from 'react';
import { NotificationExample } from '@/components/onboarding/notification-example';
import { markNotificationsAnsweredHere } from '@/components/onboarding/notifications-answered';
import { StepShell } from '@/components/onboarding/step-shell';
import { useNotificationsView } from '@/components/onboarding/use-notifications-device';
import { t } from '@/lib/i18n';
import type { ScreenContext } from '@/lib/onboarding/guard';
import {
  NOTIFICATIONS_STEP_HREF,
  notificationsView,
  type NotificationsView,
} from '@/lib/onboarding/notifications';
import { readNotificationsEnv } from '@/lib/pwa/device';
import { enableNotifications } from '@/lib/pwa/push-client';
import { markSeenAndAdvance } from '../actions';
import { showNotificationsGuide } from './actions';

const n = t.onboarding.notifications;
const f = t.onboarding.flow;

/** "Stay on this screen": the shell refreshes and stops pending. */
const STAY = { ok: true, next: NOTIFICATIONS_STEP_HREF } as const;

function Disc({
  icon,
  tone,
}: {
  icon: 'bell' | 'off';
  tone: 'brand' | 'neutral';
}) {
  const Icon = icon === 'bell' ? Bell : BellOff;
  return (
    <div
      aria-hidden="true"
      className={
        tone === 'brand'
          ? 'mb-3 flex size-16 items-center justify-center rounded-full bg-[var(--brand-50)] text-[var(--brand-600)]'
          : 'mb-3 flex size-16 items-center justify-center rounded-full bg-[var(--neutral-100)] text-[var(--neutral-600)]'
      }
    >
      <Icon className="size-7" />
    </div>
  );
}

function Examples() {
  return (
    <ul
      aria-label={n.examplesLabel}
      className="m-0 flex list-none flex-col gap-2 p-0"
    >
      <NotificationExample
        icon={<CalendarCheck />}
        app={n.exampleApp}
        time={n.example1Time}
        title={n.example1Title}
        body={n.example1Body}
      />
      <NotificationExample
        muted
        icon={<CalendarX />}
        app={n.exampleApp}
        time={n.example2Time}
        title={n.example2Title}
        body={n.example2Body}
      />
    </ul>
  );
}

function DeniedPaths() {
  const rows = [
    [n.deniedIphoneLabel, n.deniedIphonePath],
    [n.deniedAndroidLabel, n.deniedAndroidPath],
  ] as const;
  return (
    <ul className="border-line bg-card divide-line m-0 flex list-none flex-col divide-y rounded-lg border p-0 shadow-[var(--shadow-card)]">
      {rows.map(([label, path]) => (
        <li key={label} className="flex flex-col gap-0.5 px-4 py-3.5">
          <span className="text-[15px] font-semibold">{label}</span>
          <span className="text-ink-2 text-[13.5px] leading-snug">{path}</span>
        </li>
      ))}
    </ul>
  );
}

/** Renders one given view; the tap logic lives in `NotificationsStep`. */
export function NotificationsStepView({
  view,
  onViewChange,
  accountId,
  progress,
  backHref,
}: ScreenContext & {
  view: NotificationsView;
  onViewChange: (view: NotificationsView) => void;
}) {
  const leave = (outcome: 'completed' | 'skipped') => {
    markNotificationsAnsweredHere(accountId);
    return markSeenAndAdvance('notifications', outcome);
  };

  if (view === 'denied') {
    return (
      <StepShell
        screen="notifications"
        progress={progress}
        backHref={backHref}
        accountId={accountId}
        align="center"
        leading={<Disc icon="off" tone="neutral" />}
        heading={n.deniedTitle}
        subheading={n.deniedSub}
        primary={{ label: f.continue, onPress: () => leave('skipped') }}
      >
        <DeniedPaths />
      </StepShell>
    );
  }

  const unsupported = view === 'unsupported';

  // The system prompt needs the tap's user activation (iOS standalone): the
  // permission request is the first await, so nothing async may come before it.
  const onPress = () => {
    const current = notificationsView(readNotificationsEnv()); // sync reads only
    if (current === 'install') return showNotificationsGuide();
    if (current !== 'ask') {
      onViewChange(current);
      return Promise.resolve(STAY);
    }
    return enableNotifications().then(async (result) => {
      if (result === 'granted') return leave('completed');
      if (result === 'denied') {
        markNotificationsAnsweredHere(accountId);
        onViewChange('denied');
        return STAY;
      }
      if (result === 'unsupported') {
        onViewChange('unsupported');
        return STAY;
      }
      return STAY; // prompt dismissed: the user may tap again or skip
    });
  };

  return (
    <StepShell
      screen="notifications"
      progress={progress}
      backHref={backHref}
      accountId={accountId}
      align="center"
      leading={<Disc icon="bell" tone="brand" />}
      heading={n.title}
      subheading={n.sub}
      primary={
        unsupported
          ? { label: f.continue, onPress: () => leave('skipped') }
          : { label: n.enable, onPress }
      }
      skip={
        unsupported
          ? undefined
          : { label: f.notNow, onPress: () => leave('skipped') }
      }
    >
      <div className="flex flex-col gap-4">
        <Examples />
        {unsupported && (
          <p className="text-ink-2 text-[13.5px] leading-snug">
            {n.unsupportedNote}
          </p>
        )}
      </div>
    </StepShell>
  );
}

export function NotificationsStep(ctx: ScreenContext) {
  const detected = useNotificationsView();
  const [override, setOverride] = useState<NotificationsView | null>(null);
  return (
    <NotificationsStepView
      {...ctx}
      view={override ?? detected ?? 'ask'}
      onViewChange={setOverride}
    />
  );
}
