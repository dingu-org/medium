import { z } from 'zod';
import { sanitizePromptField } from '@/lib/ai/prompt';
import { SERVICE_MODES } from './modes';

// Field validators shared by the settings services actions and the onboarding
// services step, so both enforce the same rules.

// Service names are listed in the system prompt as context bullets, so a line
// break in one would render as a bullet of its own (lib/ai/prompt.ts).
export const serviceNameField = z.preprocess(
  (v) => (typeof v === 'string' ? sanitizePromptField(v) : v),
  z.string().min(1).max(80),
);

export const serviceDurationField = z.number().int().min(5).max(480);

// Aligned with the DB CHECK (price_lek > 0); max keeps int4 overflow a clean
// validation error instead of a Postgres 22003.
export const servicePriceField = z.number().int().positive().max(2_147_483_647);

// Stored prompt-safe (newlines collapsed) so the assistant can use it as-is.
export const serviceDescriptionField = z.preprocess(
  (v) => (typeof v === 'string' ? sanitizePromptField(v) : v),
  z.string().min(1).max(500),
);

export const serviceModeField = z.enum(SERVICE_MODES);

/**
 * Whole Lekë from what a person types: "2500", "2 500", "2.500" and "2,500"
 * all give 2500. Decimals, signs, letters and empty input give null.
 */
export function parseLek(raw: string): number | null {
  const text = raw.replace(/[\s ]/g, '');
  if (/^\d+$/.test(text) || /^\d{1,3}([.,]\d{3})+$/.test(text)) {
    return Number(text.replace(/[.,]/g, ''));
  }
  return null;
}
