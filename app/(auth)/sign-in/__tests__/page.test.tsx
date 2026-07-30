import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { LINK_EXPIRED, LINK_FAILED } from '@/lib/auth/link-errors';
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
    const props = await formProps({ error: LINK_FAILED });
    expect(props.callbackError).toBe(t.auth.signIn.linkFailed);
    expect(t.auth.signIn.linkFailedAction).toBeTruthy();
  });

  it('says so when the link merely expired, so the PT knows to ask again', async () => {
    const props = await formProps({ error: LINK_EXPIRED });
    expect(props.callbackError).not.toBe(t.auth.signIn.linkFailed);
    expect(props.callbackError).toMatch(/skaduar/i);
  });

  it('falls back to the generic banner for an unrecognised error param', async () => {
    // Older links still in inboxes point at the pre-rename codes.
    const props = await formProps({ error: 'callback_failed' });
    expect(props.callbackError).toBe(t.auth.signIn.linkFailed);
  });

  it('shows no banner without an error param', async () => {
    const props = await formProps({ confirm: '1' });
    expect(props.callbackError).toBeNull();
    expect(props.confirmHint).toBe(true);
  });
});
