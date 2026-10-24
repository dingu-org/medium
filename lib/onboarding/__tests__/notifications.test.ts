import { describe, expect, it } from 'vitest';
import {
  NOTIFICATIONS_GUIDE_HREF,
  NOTIFICATIONS_STEP_HREF,
  notificationsView,
  offersNotificationsPromptOnFinish,
  type NotificationsEnv,
} from '../notifications';

const env = (
  ios: boolean,
  standalone: boolean,
  permission: NotificationsEnv['permission'],
): NotificationsEnv => ({ ios, standalone, permission });

describe('notificationsView', () => {
  it.each([
    // iPhone in a Safari tab: no notification API, still "install".
    [env(true, false, 'unsupported'), 'install'],
    [env(true, false, 'default'), 'install'],
    [env(true, false, 'denied'), 'install'],
    // Installed iPhone app.
    [env(true, true, 'default'), 'ask'],
    [env(true, true, 'granted'), 'ask'],
    [env(true, true, 'denied'), 'denied'],
    [env(true, true, 'unsupported'), 'unsupported'],
    // Android and desktop.
    [env(false, false, 'default'), 'ask'],
    [env(false, false, 'granted'), 'ask'],
    [env(false, false, 'denied'), 'denied'],
    [env(false, false, 'unsupported'), 'unsupported'],
    [env(false, true, 'default'), 'ask'],
  ] as const)('%j -> %s', (input, expected) => {
    expect(notificationsView(input)).toBe(expected);
  });
});

describe('offersNotificationsPromptOnFinish', () => {
  it('offers only for ask + default + not answered here', () => {
    expect(
      offersNotificationsPromptOnFinish(env(false, false, 'default'), false),
    ).toBe(true);
    expect(
      offersNotificationsPromptOnFinish(env(true, true, 'default'), false),
    ).toBe(true);
  });

  it.each([
    ['granted', env(false, false, 'granted'), false],
    ['denied', env(false, false, 'denied'), false],
    ['install', env(true, false, 'unsupported'), false],
    ['unsupported', env(false, false, 'unsupported'), false],
    ['answered here', env(false, false, 'default'), true],
  ] as const)('does not offer when %s', (_name, input, answered) => {
    expect(offersNotificationsPromptOnFinish(input, answered)).toBe(false);
  });
});

describe('hrefs', () => {
  it('nests the guide under the step', () => {
    expect(NOTIFICATIONS_STEP_HREF).toBe('/onboarding/notifications');
    expect(NOTIFICATIONS_GUIDE_HREF).toBe('/onboarding/notifications/guide');
  });
});
