import { z } from 'zod';

/**
 * The closed list of business types (MED-117), in display order. The single
 * source: the database enum, the onboarding step, the labels (t.businessTypes)
 * and the assistant configuration lookup all derive from it. Adding a type
 * means defining its behaviour in lib/ai/assistant-config.ts.
 */
export const BUSINESS_TYPES = [
  'psychologist',
  'physiotherapist',
  'dentist',
  'beauty_salon',
  'personal_trainer',
  'barber_hairdresser',
  'massage_therapist',
  'nutritionist',
  'coach_tutor',
  'consultant',
  'other_professional',
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const isBusinessType = (value: unknown): value is BusinessType =>
  typeof value === 'string' &&
  (BUSINESS_TYPES as readonly string[]).includes(value);

export const businessTypeSchema = z.enum(BUSINESS_TYPES);
