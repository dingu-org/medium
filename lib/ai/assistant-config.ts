import type { BusinessType } from '../business-types';

export type AssistantConfig = {
  id: 'general' | BusinessType;
  /** Extra prompt text for this type, placed before the practice context. Null = none. */
  promptSection: string | null;
};

export const GENERAL_ASSISTANT_CONFIG: AssistantConfig = {
  id: 'general',
  promptSection: null,
};

/**
 * Every type resolves to the general configuration in this release (MED-117).
 * MED-128 replaces one entry per type; `other_professional` and accounts
 * without a type stay general.
 */
const CONFIG_BY_TYPE: Record<BusinessType, AssistantConfig> = {
  psychologist: GENERAL_ASSISTANT_CONFIG,
  physiotherapist: GENERAL_ASSISTANT_CONFIG,
  dentist: GENERAL_ASSISTANT_CONFIG,
  beauty_salon: GENERAL_ASSISTANT_CONFIG,
  personal_trainer: GENERAL_ASSISTANT_CONFIG,
  barber_hairdresser: GENERAL_ASSISTANT_CONFIG,
  massage_therapist: GENERAL_ASSISTANT_CONFIG,
  nutritionist: GENERAL_ASSISTANT_CONFIG,
  coach_tutor: GENERAL_ASSISTANT_CONFIG,
  consultant: GENERAL_ASSISTANT_CONFIG,
  other_professional: GENERAL_ASSISTANT_CONFIG,
};

export function assistantConfigFor(type: BusinessType | null): AssistantConfig {
  return type == null ? GENERAL_ASSISTANT_CONFIG : CONFIG_BY_TYPE[type];
}
