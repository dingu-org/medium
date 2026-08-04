import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import { resolveAppEnv } from './lib/env/app-env';
import pkg from './package.json';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
    // Stamps the build with the environment it was produced for, so the client
    // bundle can resolve it too (VERCEL_ENV is server-only). Derived here
    // rather than set in the Vercel dashboard: one fewer variable to keep in
    // sync per target, and it cannot disagree with the build it belongs to.
    NEXT_PUBLIC_APP_ENV: resolveAppEnv(),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  swUrl: '/sw.js',
  scope: '/',
  register: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
  globPublicPatterns: ['manifest.json', 'icons/**/*', 'apple-touch-icon.png'],
});

export default withSerwist(nextConfig);
