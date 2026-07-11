import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
