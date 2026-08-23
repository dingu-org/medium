import { describe, expect, it } from 'vitest';
import { allowsOnboardingBypass, onboardingCookieValue } from '../constants';

describe('onboarding cookies', () => {
  it('allows dismissal and setup only for the matching practice account', () => {
    expect(
      allowsOnboardingBypass(
        onboardingCookieValue('dismissed', 'account-a'),
        'account-a',
      ),
    ).toBe(true);
    expect(
      allowsOnboardingBypass(onboardingCookieValue('setup', 'account-a'), 'account-a'),
    ).toBe(true);
    expect(
      allowsOnboardingBypass(
        onboardingCookieValue('dismissed', 'account-a'),
        'account-b',
      ),
    ).toBe(false);
    expect(allowsOnboardingBypass('1', 'account-a')).toBe(false);
  });
});
