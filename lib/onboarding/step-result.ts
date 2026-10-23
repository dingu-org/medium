/**
 * What a flow step's save action returns to the shell. Validation problems are
 * returned; unexpected save failures throw, and the shell shows its retry
 * banner for any thrown or rejected call (including a network failure).
 */
export type StepSuccess = { ok: true; next: string; replace?: boolean };
export type StepInvalid = {
  ok: false;
  reason?: string;
  fieldErrors?: Record<string, string>;
};
export type StepActionResult = StepSuccess | StepInvalid;
