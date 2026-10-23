import { describe, expect, it } from 'vitest';
import { guidedGateRedirect } from '../gate';

describe('guidedGateRedirect', () => {
  it('hands legacy and missing rows to the old gate', () => {
    expect(
      guidedGateRedirect({
        onboardingFlow: 'legacy',
        onboardingCompletedAt: null,
      }),
    ).toBe('legacy');
    expect(guidedGateRedirect(undefined)).toBe('legacy');
  });

  it('sends a guided account that has not finished back into the flow', () => {
    expect(
      guidedGateRedirect({
        onboardingFlow: 'guided',
        onboardingCompletedAt: null,
      }),
    ).toBe('/onboarding');
  });

  it('lets a completed guided account through', () => {
    expect(
      guidedGateRedirect({
        onboardingFlow: 'guided',
        onboardingCompletedAt: new Date(),
      }),
    ).toBeNull();
  });
});
