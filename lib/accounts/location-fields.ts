import { z } from 'zod';
import { t } from '@/lib/i18n';
import { promptSafe } from './profile-fields';

// Field schemas for the Where step (MED-119). Prompt-safe like the address
// column: MED-120 puts these values into the system prompt as context bullets.

const w = t.onboarding.where;

const required = (max: number, message: string) =>
  z.preprocess(
    promptSafe,
    z.string({ error: message }).min(1, message).max(max, w.tooLong),
  );
const optional = (max: number) =>
  z.preprocess(promptSafe, z.string().max(max, w.tooLong).optional());

export const cityField = required(120, w.cityRequired);
// Same 240 cap as the settings addressField.
export const streetAddressField = required(240, w.addressRequired);
export const serviceAreaField = required(240, w.serviceAreaRequired);
export const directionsField = optional(200);
export const parkingField = optional(200);
export const entranceField = optional(200);
export const floorField = optional(40);
