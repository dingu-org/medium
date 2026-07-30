import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA service worker source', () => {
  it('caches dashboard/read surfaces and excludes sensitive APIs', () => {
    const source = readFileSync(path.join(process.cwd(), 'app', 'sw.ts'), 'utf8');

    expect(source).toContain('medium-dashboard-pages');
    expect(source).toContain('medium-dashboard-rsc');

    for (const excluded of [
      '/api/webhooks',
      '/api/inngest',
      '/api/auth',
      '/api/pwa/mutations',
    ]) {
      expect(source).toContain(excluded);
    }
  });

  // A browser-initiated endpoint rotation is invisible to the app otherwise: the
  // server prunes the row on the next 404/410 and push dies silently.
  it('relays push subscription changes to open clients', () => {
    const source = readFileSync(path.join(process.cwd(), 'app', 'sw.ts'), 'utf8');

    expect(source).toContain("addEventListener('pushsubscriptionchange'");
    expect(source).toContain('MEDIUM_PWA_RECONCILE_PUSH');
  });
});
