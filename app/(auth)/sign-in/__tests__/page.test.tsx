import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  LINK_EXPIRED,
  LINK_FAILED,
  OAUTH_CANCELLED,
} from '@/lib/auth/link-errors';
import { t } from '@/lib/i18n';
import SignInPage from '../page';

async function render(searchParams: {
  confirm?: string;
  error?: string;
  reset?: string;
}): Promise<string> {
  return renderToStaticMarkup(
    await SignInPage({ searchParams: Promise.resolve(searchParams) }),
  );
}

/**
 * How many routes into password recovery the page offers. One is the standing
 * "Harrove?" link next to the password field; a second means the error banner
 * is also pushing the PT towards a new emailed link. Counting beats searching
 * for the CTA copy, which is a substring of the expired-link banner itself.
 */
function recoveryRoutes(markup: string): number {
  return markup.split('href="/forgot-password"').length - 1;
}

describe('SignInPage', () => {
  it('explains a failed email link and points at a fresh one', async () => {
    const markup = await render({ error: LINK_FAILED });

    expect(markup).toContain(t.auth.signIn.linkFailed);
    expect(recoveryRoutes(markup)).toBe(2);
  });

  it('says so when the link merely expired, so the PT knows to ask again', async () => {
    const markup = await render({ error: LINK_EXPIRED });

    expect(markup).toContain(t.auth.signIn.linkExpired);
    expect(markup).not.toContain(t.auth.signIn.linkFailed);
    expect(recoveryRoutes(markup)).toBe(2);
  });

  // /auth/callback is the Google OAuth landing route too. Someone who closed the
  // consent screen has no broken link to replace, and nudging them into password
  // recovery is a wrong turn — the banner says what happened and stops there.
  it('does not push a cancelled Google sign-in into password recovery', async () => {
    const markup = await render({ error: OAUTH_CANCELLED });

    expect(markup).toContain(t.auth.errors.oauthFailed);
    expect(markup).not.toContain(t.auth.signIn.linkFailed);
    expect(recoveryRoutes(markup)).toBe(1);
  });

  it('falls back to the generic banner for an unrecognised error param', async () => {
    // Older links still in inboxes point at the pre-rename codes.
    const markup = await render({ error: 'callback_failed' });

    expect(markup).toContain(t.auth.signIn.linkFailed);
    expect(recoveryRoutes(markup)).toBe(2);
  });

  it('shows no banner without an error param', async () => {
    const markup = await render({ confirm: '1' });

    expect(markup).toContain(t.auth.signIn.confirmHint);
    expect(markup).not.toContain(t.auth.signIn.linkFailed);
    expect(markup).not.toContain(t.auth.signIn.linkExpired);
    expect(recoveryRoutes(markup)).toBe(1);
  });

  it('shows the reset confirmation after a completed recovery', async () => {
    const markup = await render({ reset: '1' });

    expect(markup).toContain(t.auth.reset.complete);
  });
});
