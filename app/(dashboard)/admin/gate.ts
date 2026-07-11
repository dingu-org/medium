/**
 * Env-var allowlist gate for the admin page. Split out of page.tsx (a plain
 * function, not JSX) so it's unit-testable — vitest's esbuild-based transform
 * can't parse this repo's `tsconfig.json` (`jsx: "preserve"`, Next's own
 * compiler handles that), so no `.tsx` page/component in this codebase is
 * imported directly in a test; the gating logic lives here instead.
 */
export function isAllowedAdminEmail(
  email: string | null | undefined,
  adminEmailsEnv: string | undefined,
): boolean {
  const allowlist = (adminEmailsEnv ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;
  const normalized = email?.toLowerCase().trim();
  if (!normalized) return false;
  return allowlist.includes(normalized);
}
