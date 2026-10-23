import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { NotificationsGuideStep } from '../guide-step';

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
vi.mock('@/lib/pwa/push-client', () => ({ unsubscribeFromPush: vi.fn() }));
vi.mock('../../../actions', () => ({ markSeenAndAdvance: vi.fn() }));

const g = t.onboarding.notificationsGuide;
const html = renderToStaticMarkup(
  <NotificationsGuideStep
    accountId="acc-1"
    facts={{
      introSeen: true,
      business: true,
      services: true,
      serviceModes: [],
      where: true,
      availability: true,
      whatsappSeen: true,
      notificationsSeen: true,
      completed: false,
    }}
    progress={{ kind: 'step', position: 7, total: 7 }}
    backHref="/onboarding/notifications"
  />,
);
const esc = (s: string) => s.replace(/'/g, '&#x27;');
const at = (s: string) => html.indexOf(esc(s));

describe('NotificationsGuideStep', () => {
  it('shows the heading and subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Shto Medium në ekranin bazë<\/h1>/);
    expect(html).toContain(esc(g.sub));
  });

  it('lists three cards in order', () => {
    expect(html).toContain('<ol');
    expect(html.match(/<li/g)).toHaveLength(3);
    const order = [g.card1Title, g.card2Title, g.card3Title].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('names the iOS buttons in English and mentions the three-dot menu', () => {
    expect(html).toContain('(Share)');
    expect(html).toContain('Add to Home Screen');
    expect(html).toContain('tri pika');
  });

  it('has only Vazhdo në shfletues, no Jo tani', () => {
    expect(html.match(/<button[^>]*type="submit"[^>]*>/g)).toHaveLength(1);
    expect(html).toContain(`>${g.continueInBrowser}<`);
    expect(html).not.toContain(t.onboarding.flow.notNow);
  });
});
