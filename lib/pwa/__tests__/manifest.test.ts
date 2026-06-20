import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('PWA manifest', () => {
  it('declares the required installability fields and icons', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'),
    ) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      background_color?: string;
      theme_color?: string;
      orientation?: string;
      lang?: string;
      dir?: string;
      icons?: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    expect(manifest).toMatchObject({
      name: 'Medium',
      short_name: 'Medium',
      start_url: '/calendar',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#242424',
      orientation: 'portrait',
      lang: 'en',
      dir: 'ltr',
    });

    for (const size of [192, 256, 384, 512]) {
      expect(manifest.icons).toContainEqual({
        src: `/icons/icon-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
      });
    }

    for (const size of [192, 512]) {
      expect(manifest.icons).toContainEqual({
        src: `/icons/maskable-${size}.png`,
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose: 'maskable',
      });
    }
  });

  it('has all referenced icon files on disk', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'),
    ) as { icons: { src: string }[] };

    for (const icon of manifest.icons) {
      const file = path.join(root, 'public', icon.src);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(0);
    }

    const appleIcon = path.join(root, 'public', 'apple-touch-icon.png');
    expect(existsSync(appleIcon)).toBe(true);
    expect(statSync(appleIcon).size).toBeGreaterThan(0);
  });
});
