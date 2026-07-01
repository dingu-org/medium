export const ONBOARDING_SKIP_COOKIE = 'onboarding_skipped';

export function onboardingCookieValue(
  mode: 'dismissed' | 'setup',
  userId: string,
): string {
  return `${mode}:${userId}`;
}

export function allowsOnboardingBypass(
  value: string | undefined,
  userId: string,
): boolean {
  return (
    value === onboardingCookieValue('dismissed', userId) ||
    value === onboardingCookieValue('setup', userId)
  );
}
