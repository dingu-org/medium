import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * connect-whatsapp.tsx assembles the FB.login options only on click, and the
 * repo has no DOM environment to render the client component — so the launch
 * parameters are guarded here at the source level.
 *
 * Regression: the v4 migration (5777b0a) dropped `featureType` on the theory
 * that the Facebook Login for Business configuration alone carried the
 * Coexistence intent. The 2026-09-04 live test disproved that — Meta opened the
 * standard Cloud API number picker and rejected the operator's existing
 * WhatsApp Business app number. Meta's current v4 + Coexistence docs still
 * require this key in `extras`.
 * See docs/research/whatsapp-business-app-number-onboarding.md.
 */
const source = readFileSync(
  join(process.cwd(), 'app/(dashboard)/settings/connect-whatsapp.tsx'),
  'utf8',
);

describe('connect-whatsapp.tsx — Embedded Signup launch options', () => {
  it('requests the WhatsApp Business app onboarding (Coexistence) flow', () => {
    // Without this key in `extras` the popup falls back to the Cloud API
    // number picker and rejects an existing Business-app number.
    expect(source).toMatch(
      /fb\.login\([\s\S]*?extras:\s*\{[\s\S]*?featureType:\s*'whatsapp_business_app_onboarding'[\s\S]*?\}/,
    );
  });

  it('keeps the v4 `setup: {}` payload shape in the same extras object', () => {
    expect(source).toMatch(/extras:\s*\{[\s\S]*?setup:\s*\{\s*\}[\s\S]*?\}/);
  });
});
