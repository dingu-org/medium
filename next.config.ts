import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
