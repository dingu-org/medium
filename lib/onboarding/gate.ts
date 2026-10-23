/**
 * The dashboard gate's decision for the account row, kept pure so the layout
 * branch is unit-testable. `'legacy'` (or a missing row) hands over to the old
 * checklist gate; guided accounts are decided here, from the completion
 * marker alone, and never re-evaluated against data.
 */
export function guidedGateRedirect(
  account:
    | {
        onboardingFlow: 'legacy' | 'guided';
        onboardingCompletedAt: Date | null;
      }
    | undefined,
): string | null | 'legacy' {
  if (!account || account.onboardingFlow === 'legacy') return 'legacy';
  return account.onboardingCompletedAt ? null : '/onboarding';
}
