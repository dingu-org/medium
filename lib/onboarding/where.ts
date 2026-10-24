import type { ServiceMode } from '../services/modes';

/** Albania only for now (KD); saved on the account with the at-business group. */
export const FIXED_COUNTRY = 'AL';
/** What the "Shembull" link fills in (ticket, canvas 4b). */
export const SERVICE_AREA_EXAMPLE = 'Tiranë dhe rrethinat';

export type WhereNeeds = { atBusiness: boolean; atClient: boolean };

/** Which location groups the active services' modes need. Online and unknown (null) modes need nothing. */
export function whereNeeds(modes: readonly (ServiceMode | null)[]): WhereNeeds {
  return {
    atBusiness: modes.includes('at_business'),
    atClient: modes.includes('at_client'),
  };
}

export type WhereRow = {
  city: string | null;
  address: string | null;
  serviceArea: string | null;
};

/** Every needed group is filled; nothing needed counts as done. Country is fixed, so it is not checked. */
export function whereFieldsDone(needs: WhereNeeds, row: WhereRow): boolean {
  const filled = (v: string | null) => Boolean(v?.trim());
  return (
    (!needs.atBusiness || (filled(row.city) && filled(row.address))) &&
    (!needs.atClient || filled(row.serviceArea))
  );
}

export type WhereDraft = {
  city: string;
  address: string;
  directions: string;
  parking: string;
  entrance: string;
  floor: string;
  serviceArea: string;
};

export const WHERE_DRAFT_KEYS = [
  'city',
  'address',
  'directions',
  'parking',
  'entrance',
  'floor',
  'serviceArea',
] as const satisfies readonly (keyof WhereDraft)[];

/**
 * A stored draft may be in the old placeholder format (a plain string) or
 * tampered with: take every key from it only when it is a string, else from
 * the saved values.
 */
export function normalizeWhereDraft(
  stored: unknown,
  initial: WhereDraft,
): WhereDraft {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return initial;
  }
  const record = stored as Record<string, unknown>;
  const out = { ...initial };
  for (const key of WHERE_DRAFT_KEYS) {
    const value = record[key];
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
