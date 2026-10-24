import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { PushDeniedBanner } from '../pwa-provider';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/pwa/client-store', () => ({
  listPendingMutations: vi.fn(),
  PWA_ENGAGEMENT_EVENT: 'e',
  PWA_MUTATION_FAILED_EVENT: 'f',
  PWA_MUTATION_SYNCED_EVENT: 's',
  replayPendingMutations: vi.fn(),
  removeMutation: vi.fn(),
  retryMutation: vi.fn(),
  subscribeToQueueChanges: vi.fn(),
}));
vi.mock('@/lib/pwa/push-client', () => ({
  getPushPermissionState: vi.fn(),
  isPushSupported: vi.fn(),
  reconcilePushSubscription: vi.fn(),
  subscribeToPush: vi.fn(),
}));
vi.mock('@/app/(dashboard)/pwa-install-actions', () => ({
  recordPwaInstalled: vi.fn(),
}));

const n = t.onboarding.notifications;
const esc = (s: string) => s.replace(/'/g, '&#x27;');

describe('PushDeniedBanner', () => {
  it('shows only the iPhone path on iOS', () => {
    const html = renderToStaticMarkup(
      <PushDeniedBanner ios onDismiss={vi.fn()} />,
    );
    expect(html).toContain(n.deniedTitle);
    expect(html).toContain(esc(n.deniedSub));
    expect(html).toContain(n.deniedIphonePath);
    expect(html).not.toContain(n.deniedAndroidPath);
  });

  it('shows only the Android path elsewhere', () => {
    const html = renderToStaticMarkup(
      <PushDeniedBanner ios={false} onDismiss={vi.fn()} />,
    );
    expect(html).toContain(n.deniedAndroidPath);
    expect(html).not.toContain(n.deniedIphonePath);
  });

  it('only offers a labelled dismiss, never a permission request', () => {
    const html = renderToStaticMarkup(
      <PushDeniedBanner ios onDismiss={vi.fn()} />,
    );
    expect(html).toContain(`aria-label="${t.pwa.dismissPushDenied}"`);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain(t.pwa.pushEnable);
    expect(html).not.toContain(n.enable);
  });
});
