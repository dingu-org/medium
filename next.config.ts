import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';
import pkg from './package.json';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7),
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
