import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { WhatsappGuideStep } from '../guide-step';

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

const g = t.onboarding.whatsappGuide;
const html = renderToStaticMarkup(
  <WhatsappGuideStep
    accountId="acc-1"
    facts={{
      introSeen: true,
      business: true,
      services: true,
      serviceModes: [],
      where: true,
      availability: true,
      whatsappSeen: false,
      notificationsSeen: false,
      completed: false,
    }}
    progress={{ kind: 'step', position: 6, total: 7 }}
    backHref="/onboarding/whatsapp"
    reopened={false}
  />,
);
const esc = (s: string) => s.replace(/'/g, '&#x27;');
const at = (s: string) => html.indexOf(esc(s));

describe('WhatsappGuideStep', () => {
  it('shows the heading and subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Si të marrësh një numër<\/h1>/);
    expect(html).toContain(esc(g.sub));
  });

  it('lists three cards in order inside an ordered list', () => {
    expect(html).toContain('<ol');
    expect(html.match(/<li/g)).toHaveLength(3);
    const order = [g.card1Title, g.card2Title, g.card3Title].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain(g.card1Body);
    expect(html).toContain(g.card2Body);
  });

  it('bolds the dashboard card label in card 3', () => {
    expect(html).toContain(`<strong>${g.card3Strong}</strong>`);
    expect(html).toContain(g.card3Tail);
  });

  it('puts the note before the single Vazhdo button and has no skip', () => {
    const buttons = html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(html).toContain(`>${t.onboarding.flow.continue}<`);
    expect(at(g.note)).toBeGreaterThan(-1);
    expect(at(g.note)).toBeLessThan(at(`>${t.onboarding.flow.continue}<`));
    expect(html).not.toContain(t.onboarding.flow.later);
  });

  it('has Back', () => {
    expect(html).toContain(`aria-label="${t.onboarding.flow.back}"`);
  });
});
