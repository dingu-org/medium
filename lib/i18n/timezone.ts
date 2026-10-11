// Albania is the only market. This is the column default for
// `accounts.timezone`, the zone the signup trigger seeds, and the fallback
// wherever an account row is missing. Kept import-free so the schema (loaded by
// drizzle-kit) and client components can both use it.
export const DEFAULT_TIMEZONE = 'Europe/Tirane';
