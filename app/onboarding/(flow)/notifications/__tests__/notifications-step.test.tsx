import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import type { NotificationsView } from '@/lib/onboarding/notifications';
import { NotificationsStepView } from '../notifications-step';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock('@/lib/auth/actions', () => ({ signOut: vi.fn() }));
vi.mock('@/lib/pwa/client-store', () => ({ clearPwaData: vi.fn() }));
vi.mock('@/lib/pwa/push-client', () => ({
  unsubscribeFromPush: vi.fn(),
  enableNotifications: vi.fn(),
  getPushPermissionState: vi.fn(() => 'unsupported'),
}));
vi.mock('../../actions', () => ({ markSeenAndAdvance: vi.fn() }));
vi.mock('../actions', () => ({ showNotificationsGuide: vi.fn() }));

const n = t.onboarding.notifications;
const esc = (s: string) => s.replace(/'/g, '&#x27;');

function render(view: NotificationsView) {
  return renderToStaticMarkup(
    <NotificationsStepView
      view={view}
      onViewChange={vi.fn()}
      accountId="acc-1"
      facts={{
        introSeen: true,
        business: true,
        services: true,
        serviceModes: [],
        where: true,
        availability: true,
        whatsappSeen: true,
        notificationsSeen: false,
        completed: false,
      }}
      progress={{ kind: 'step', position: 7, total: 7 }}
      backHref="/onboarding/whatsapp"
    />,
  );
}

describe.each(['ask', 'install'] as const)('benefit screen (%s)', (view) => {
  const html = render(view);

  it('shows the benefit heading and subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Mëso menjëherë kur rezervon dikush<\/h1>/);
    expect(html).toContain(esc(n.sub));
  });

  it('lists two example notifications in a labelled list', () => {
    expect(html).toContain(`aria-label="${n.examplesLabel}"`);
    expect(html.match(/<li/g)).toHaveLength(2);
    expect(html).toContain(n.example1Title);
    expect(html).toContain(n.example1Body);
    expect(html).toContain(n.example2Title);
  });

  it('has the enable button and the Jo tani skip', () => {
    expect(html).toContain(`>${n.enable}<`);
    expect(html).toContain(`>${t.onboarding.flow.notNow}<`);
  });
});

describe('denied view', () => {
  const html = render('denied');

  it('explains how to turn notifications on later, with both paths', () => {
    expect(html).toMatch(/<h1[^>]*>Njoftimet janë të fikura<\/h1>/);
    expect(html).toContain(n.deniedIphonePath);
    expect(html).toContain(n.deniedAndroidPath);
  });

  it('has a single Vazhdo and no skip or enable', () => {
    expect(html.match(/<button[^>]*type="submit"[^>]*>/g)).toHaveLength(1);
    expect(html).toContain(`>${t.onboarding.flow.continue}<`);
    expect(html).not.toContain(t.onboarding.flow.notNow);
    expect(html).not.toContain(n.enable);
  });
});

describe('unsupported view', () => {
  const html = render('unsupported');

  it('shows the note, one Vazhdo, no skip', () => {
    expect(html).toContain(esc(n.unsupportedNote));
    expect(html).toContain(`>${t.onboarding.flow.continue}<`);
    expect(html).not.toContain(t.onboarding.flow.notNow);
    expect(html).not.toContain(`>${n.enable}<`);
  });
});

describe('copy', () => {
  it('never says push or PWA', () => {
    const all = JSON.stringify([
      t.onboarding.notifications,
      t.onboarding.notificationsGuide,
    ]);
    expect(all).not.toMatch(/push|pwa/i);
  });
});
