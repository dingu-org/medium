import { config as loadDotenv } from 'dotenv';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const env = loadDotenv({ path: '.env.test' }).parsed ?? {};

export default defineConfig({
  plugins: [tsconfigPaths()],
  // tsconfig sets jsx: "preserve" (Next transforms it); vitest's rolldown
  // pipeline must compile JSX itself or .tsx imports fail to parse.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    env,
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
