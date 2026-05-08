import { config as loadDotenv } from 'dotenv';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const env = loadDotenv({ path: '.env.test' }).parsed ?? {};

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    env,
    globalSetup: ['./tests/setup/global.ts'],
    fileParallelism: false,
    sequence: { hooks: 'list' },
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
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
