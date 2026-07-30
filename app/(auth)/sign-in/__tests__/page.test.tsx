import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';
import SignInPage from '../page';
import { SignInForm } from '../form';

type FormProps = {
  confirmHint?: boolean;
  resetHint?: boolean;
  callbackError?: string | null;
};

async function formProps(
  searchParams: { confirm?: string; error?: string; reset?: string },
): Promise<FormProps> {
  const page = (await SignInPage({
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement<{ children: ReactElement[] }>;
  const form = page.props.children.find((child) => child.type === SignInForm);
  return (form as ReactElement<FormProps>).props;
}

describe('SignInPage', () => {
  it('explains a failed email link and points at a fresh one', async () => {
    // /auth/callback collapses every exchange failure into this param; the most
    // common cause is opening the mail in a different browser (PKCE verifier).
    const props = await formProps({ error: 'callback_failed' });
    expect(props.callbackError).toBe(t.auth.signIn.linkFailed);
    expect(t.auth.signIn.linkFailedAction).toBeTruthy();
  });

  it('shows no banner without an error param', async () => {
    const props = await formProps({ confirm: '1' });
    expect(props.callbackError).toBeNull();
    expect(props.confirmHint).toBe(true);
  });
});
