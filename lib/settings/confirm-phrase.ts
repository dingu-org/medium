/**
 * Typed confirmation for destructive dialogs. The phrase is normally the name of
 * the thing being deleted, but that name can be blank — `pts.practice_name` is
 * nullable and onboarding is skippable — and comparing against a blank phrase
 * makes an empty input "match", leaving the destructive button armed the moment
 * the dialog opens. Fall back to a literal word so there is always something to
 * type.
 */
export const CONFIRM_PHRASE_FALLBACK = 'FSHI';

/** First non-blank candidate, or the fallback word. Never blank. */
export function confirmPhrase(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return CONFIRM_PHRASE_FALLBACK;
}

/** Whether what the user typed arms the destructive action. */
export function confirmMatches(phrase: string, typed: string): boolean {
  const target = phrase.trim();
  return target.length > 0 && typed.trim() === target;
}
