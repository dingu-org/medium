import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  markNotificationsAnsweredHere,
  notificationsAnsweredHere,
} from '../notifications-answered';

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('notificationsAnsweredHere', () => {
  it('round-trips per account', () => {
    stubStorage();
    expect(notificationsAnsweredHere('a')).toBe(false);
    markNotificationsAnsweredHere('a');
    expect(notificationsAnsweredHere('a')).toBe(true);
    expect(notificationsAnsweredHere('b')).toBe(false);
  });

  it('uses an onb: key so sign-out cleanup drops it', () => {
    const store = stubStorage();
    markNotificationsAnsweredHere('a');
    expect([...store.keys()].every((k) => k.startsWith('onb:'))).toBe(true);
  });

  it('never throws when storage is blocked', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('blocked');
      },
    });
    expect(() => markNotificationsAnsweredHere('a')).not.toThrow();
    expect(notificationsAnsweredHere('a')).toBe(false);
  });
});
