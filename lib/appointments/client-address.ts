import { z } from 'zod';
import { sanitizePromptField } from '@/lib/ai/prompt';

// Same cap as accounts.address.
export const CLIENT_ADDRESS_MAX = 240;

/**
 * The client's own address for an at-the-client's booking (MED-120): plain text
 * in the client's words, flattened to one line so it is safe to echo in
 * confirmations, prompts and tool results. No geocoding.
 */
export const clientAddressField = z.preprocess(
  (v) => (typeof v === 'string' ? sanitizePromptField(v) : v),
  z.string().min(3).max(CLIENT_ADDRESS_MAX),
);
