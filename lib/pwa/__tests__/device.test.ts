import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(dashboard)/settings/push-actions', () => ({
  getVapidPublicKey: vi.fn(),
  isEndpointOwned: vi.fn(),
  removePushSubscription: vi.fn(),
  savePushSubscription: vi.fn(),
}));

import {
  isIosDevice,
  isStandaloneDisplay,
  readNotificationsEnv,
} from '../device';

function stub({
  userAgent = 'Mozilla/5.0 (X11; Linux x86_64)',
  platform = 'Linux x86_64',
  maxTouchPoints = 0,
  standalone,
  displayStandalone = false,
}: {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  displayStandalone?: boolean;
} = {}) {
  vi.stubGlobal('navigator', {
    userAgent,
    platform,
    maxTouchPoints,
    standalone,
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: displayStandalone }),
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('isIosDevice', () => {
  it('detects an iPhone user agent', () => {
    stub({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    expect(isIosDevice()).toBe(true);
  });
  it('detects iPadOS (a touch-capable Mac)', () => {
    stub({
      userAgent: 'Mozilla/5.0 (Macintosh)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(isIosDevice()).toBe(true);
  });
  it('does not treat a Mac without touch as iOS', () => {
    stub({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel' });
    expect(isIosDevice()).toBe(false);
  });
  it('does not treat Android as iOS', () => {
    stub({ userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 });
    expect(isIosDevice()).toBe(false);
  });
});

describe('isStandaloneDisplay', () => {
  it('reads the display-mode media query', () => {
    stub({ displayStandalone: true });
    expect(isStandaloneDisplay()).toBe(true);
  });
  it('reads navigator.standalone (iOS)', () => {
    stub({ standalone: true });
    expect(isStandaloneDisplay()).toBe(true);
  });
  it('is false in a plain tab', () => {
    stub();
    expect(isStandaloneDisplay()).toBe(false);
  });
});

describe('readNotificationsEnv', () => {
  it('reads an iPhone Safari tab (no Notification API) as unsupported', () => {
    stub({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    expect(readNotificationsEnv()).toEqual({
      ios: true,
      standalone: false,
      permission: 'unsupported',
    });
  });
});
