import { z } from 'zod';
import { sanitizePromptField } from '@/lib/ai/prompt';
import { t } from '@/lib/i18n';

// Field schemas for the account profile columns, shared by the settings profile
// form and onboarding step 2 so both validate the same columns the same way.

export const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

// name, title, address and tagline are interpolated into the system prompt as
// context bullets, so a line break in them would render as a bullet of its own
// and read as a practice-authored rule (lib/ai/prompt.ts).
export const promptSafe = (v: unknown) =>
  emptyToUndefined(typeof v === 'string' ? sanitizePromptField(v) : v);

export const businessNameField = z.preprocess(
  (v) => (typeof v === 'string' ? sanitizePromptField(v) : v),
  z.string().min(1, t.settings.profilePracticeRequired).max(120),
);
export const ownerNameField = z.preprocess(
  emptyToUndefined,
  z.string().trim().max(120).optional(),
);
export const titleField = z.preprocess(
  promptSafe,
  z.string().max(120).optional(),
);
export const addressField = z.preprocess(
  promptSafe,
  z.string().max(240).optional(),
);
// Stored only for now; prompt-safe so a later prompt use needs no data cleanup.
export const taglineField = z.preprocess(
  promptSafe,
  z.string().max(160).optional(),
);
