import { sq } from './sq';

/**
 * The active UI dictionary. Import in components: `import { t } from '@/lib/i18n'`.
 * Single locale (Albanian) for now — swap the source here if more locales ship.
 */
export const t = sq;

export { sq };
export type { Dictionary } from './sq';
export * from './datetime';
