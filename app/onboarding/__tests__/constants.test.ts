import { describe, expect, it } from 'vitest';
import { allowsOnboardingBypass, onboardingCookieValue } from '../constants';

describe('onboarding cookies', () => {
  it('allows dismissal and setup only for the matching practice account', () => {
    expect(
      allowsOnboardingBypass(
        onboardingCookieValue('dismissed', 'pt-a'),
        'pt-a',
      ),
    ).toBe(true);
    expect(
      allowsOnboardingBypass(onboardingCookieValue('setup', 'pt-a'), 'pt-a'),
    ).toBe(true);
    expect(
      allowsOnboardingBypass(
        onboardingCookieValue('dismissed', 'pt-a'),
        'pt-b',
      ),
    ).toBe(false);
    expect(allowsOnboardingBypass('1', 'pt-a')).toBe(false);
  });
});
