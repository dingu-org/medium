import { config as loadDotenv } from 'dotenv';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const env = loadDotenv({ path: '.env' }).parsed ?? {};

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig sets jsx: "preserve" (Next transforms it); vitest's rolldown
  // pipeline must compile JSX itself or .tsx imports fail to parse.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // Reminders are off by default in every real environment
    // (lib/reminders/flag.ts). The suites that document the feature must keep
    // exercising it, so the whole run turns it back on here; both projects
    // inherit this the same way they inherit DATABASE_URL from `.env`. A test
    // that asserts the disabled path opts out with
    // `vi.stubEnv('REMINDERS_ENABLED', 'false')`.
    env: { ...env, REMINDERS_ENABLED: 'true' },
    globalSetup: ['./tests/setup/global.ts'],
    fileParallelism: false,
    sequence: { hooks: 'list' },
    projects: [
      {
        plugins: [tsconfigPaths()],
        oxc: { jsx: { runtime: 'automatic' } },
        test: {
          name: 'unit',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/*.integration.test.ts'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          include: ['**/*.integration.test.ts'],
          exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**'],
        },
      },
    ],
  },
});
