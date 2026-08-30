import { afterEach, describe, expect, it, vi } from 'vitest';
import { remindersEnabled } from '../flag';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('remindersEnabled', () => {
  it('is off when nothing is set — the default in every environment', () => {
    expect(remindersEnabled({})).toBe(false);
  });

  it("is on for the exact string 'true'", () => {
    expect(remindersEnabled({ REMINDERS_ENABLED: 'true' })).toBe(true);
  });

  // Fail closed: a parked feature must not start running because someone wrote
  // a plausible-looking value.
  it('treats every other value as off', () => {
    for (const value of [
      'false',
      '1',
      '0',
      'TRUE',
      'True',
      'yes',
      'on',
      'enabled',
      '',
      ' true',
      'true ',
      'nonsense',
    ]) {
      expect(remindersEnabled({ REMINDERS_ENABLED: value })).toBe(false);
    }
  });

  /**
   * `vitest.config.ts` sets `REMINDERS_ENABLED=true` for the whole run, so the
   * suites documenting the dormant feature keep exercising it unchanged. Every
   * later flag-off test overrides that with `vi.stubEnv`, so prove the
   * mechanism actually works here rather than assuming it.
   */
  describe('against the ambient process environment', () => {
    it('reads the value vitest.config.ts provides', () => {
      expect(process.env.REMINDERS_ENABLED).toBe('true');
      expect(remindersEnabled()).toBe(true);
    });

    it('re-reads the environment on every call, so vi.stubEnv wins', () => {
      expect(remindersEnabled()).toBe(true);
      vi.stubEnv('REMINDERS_ENABLED', 'false');
      expect(process.env.REMINDERS_ENABLED).toBe('false');
      expect(remindersEnabled()).toBe(false);
    });

    it('lets vi.stubEnv remove the variable entirely', () => {
      vi.stubEnv('REMINDERS_ENABLED', undefined);
      expect(process.env.REMINDERS_ENABLED).toBeUndefined();
      expect(remindersEnabled()).toBe(false);
    });

    // Runs after the two stubbing cases above: a stub that leaked past the
    // afterEach would silently disable reminders for every suite behind it.
    it('is back on once unstubAllEnvs has run', () => {
      expect(remindersEnabled()).toBe(true);
    });
  });
});
