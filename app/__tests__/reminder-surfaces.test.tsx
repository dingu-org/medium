import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@/lib/billing/plans';
import { t } from '@/lib/i18n';
import { LandingPage } from '@/app/_landing/landing-page';
import HelpPlansPage from '@/app/(legal)/help/plans/page';
import { NotificationPrefs } from '@/app/(dashboard)/settings/notifications/notification-prefs';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs as NotificationPrefsShape,
} from '@/app/(dashboard)/settings/constants';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

// The whole vitest run turns reminders ON (see vitest.config.ts) so the suites
// that document the feature keep exercising it. These are the opt-outs: they
// assert what the two PUBLIC surfaces show once the flag is back at its real
// default. Both are pre-auth marketing — a visitor reading either one is being
// told what they would be buying, so a bullet left behind here is a promise the
// product cannot keep, not just a stray pixel in the dashboard.
afterEach(() => {
  vi.unstubAllEnvs();
});

const freeBullet = t.billing.featReminders(PLANS.free.remindersPerMonth);
const soloBullet = t.billing.featReminders(PLANS.solo.remindersPerMonth);

describe('landing page with reminders off', () => {
  it('sells neither the allowance nor the feature', () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');
    const html = renderToStaticMarkup(<LandingPage />);

    expect(html).not.toContain(freeBullet);
    expect(html).not.toContain(soloBullet);
    // The feature card is the stronger claim of the two: it names the reply
    // words a customer would try and get no answer to.
    expect(html).not.toContain('Kujtesa automatike');
    expect(html).not.toContain('KONFIRMO');
    expect(html).not.toContain('ANULO');

    // Only the reminder rows go. The plan cards still have to sell a plan.
    expect(html).toContain(
      t.billing.featConversations(PLANS.free.conversationsPerMonth),
    );
    expect(html).toContain(
      t.billing.featConversations(PLANS.solo.conversationsPerMonth),
    );
  });

  it('restores every one of them when the flag is on', () => {
    vi.stubEnv('REMINDERS_ENABLED', 'true');
    const html = renderToStaticMarkup(<LandingPage />);

    expect(html).toContain(freeBullet);
    expect(html).toContain(soloBullet);
    expect(html).toContain('Kujtesa automatike');
    expect(html).toContain('KONFIRMO');
  });
});

describe('help → plans with reminders off', () => {
  it('lists no reminder allowance and does not meter one', () => {
    vi.stubEnv('REMINDERS_ENABLED', 'false');
    const html = renderToStaticMarkup(<HelpPlansPage />);

    expect(html).not.toContain(`${PLANS.free.remindersPerMonth} kujtesa`);
    expect(html).not.toContain(`${PLANS.solo.remindersPerMonth} kujtesa`);
    // "Të dyja numëratoret" would be a second wrong claim — it counts a meter
    // the reader can no longer see anywhere.
    expect(html).not.toContain('Të dyja');
    expect(html).toContain('Numëratori niset nga zero');

    expect(html).toContain(`${PLANS.free.conversationsPerMonth} biseda`);
    expect(html).toContain(`${PLANS.solo.conversationsPerMonth} biseda`);
  });

  it('restores both bullets and the two-counter wording when the flag is on', () => {
    vi.stubEnv('REMINDERS_ENABLED', 'true');
    const html = renderToStaticMarkup(<HelpPlansPage />);

    expect(html).toContain(`${PLANS.free.remindersPerMonth} kujtesa`);
    expect(html).toContain(`${PLANS.solo.remindersPerMonth} kujtesa`);
    expect(html).toContain('Të dyja');
  });
});

describe('settings → notifications with reminders off', () => {
  const prefs = Object.fromEntries(
    NOTIFICATION_PREF_KEYS.map((key) => [key, true]),
  ) as NotificationPrefsShape;

  it('offers no toggle for a notification that can never arrive', () => {
    const html = renderToStaticMarkup(
      <NotificationPrefs prefs={prefs} remindersEnabled={false} />,
    );

    expect(html).not.toContain(t.settings.notifReminderFailure);
    // Only that row goes: the group it lived in still carries its siblings, so
    // this is a removed row rather than a collapsed section.
    expect(html).toContain(t.settings.notifConnection);
    expect(html).toContain(t.settings.notifBilling);
    expect(html).toContain(t.settings.notifNewBookings);
  });

  it('restores the row when the flag is on', () => {
    const html = renderToStaticMarkup(
      <NotificationPrefs prefs={prefs} remindersEnabled={true} />,
    );

    expect(html).toContain(t.settings.notifReminderFailure);
  });
});
