import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HowItWorksStep } from '../how-it-works-step';

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
vi.mock('../../actions', () => ({ markSeenAndAdvance: vi.fn() }));

const html = renderToStaticMarkup(
  <HowItWorksStep
    accountId="acc-1"
    facts={{
      introSeen: false,
      business: false,
      services: false,
      serviceModes: [],
      where: false,
      availability: false,
      whatsappSeen: false,
      notificationsSeen: false,
      completed: false,
    }}
    progress={{ kind: 'step', position: 1, total: 7 }}
    backHref={null}
  />,
);
const text = html.replace(/<[^>]*>/g, ' ');

describe('HowItWorksStep', () => {
  it('shows the heading and position, without Back', () => {
    expect(html).toMatch(/<h1[^>]*>Ja si funksionon<\/h1>/);
    expect(html).toContain('Hapi 1 nga 7');
    expect(html).not.toContain('aria-label="Mbrapa"');
  });

  it('has exactly one action: Fillo, no links, no skip', () => {
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(
      html.match(/<button[^>]*type="submit"[^>]*>[^]*?<\/button>/)?.[0],
    ).toContain('Fillo');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Më vonë');
    expect(html).not.toContain('Kalo për tani');
    expect(html).not.toMatch(
      /<button[^>]*type="submit"[^>]*\sdisabled(=|\s|>)/,
    );
  });

  it('lists the three lines in order', () => {
    expect(html).toContain('<ol');
    expect(html).toContain('role="list"');
    expect(html.match(/<li/g)).toHaveLength(3);
    const at = [
      'Klientët të shkruajnë në WhatsApp.',
      'Medium u përgjigjet dhe gjen një orë që të përshtatet ty.',
      'Ti merr takimin, gati në kalendar.',
    ].map((line) => html.indexOf(line));
    expect(at[0]).toBeGreaterThan(-1);
    expect(at[1]).toBeGreaterThan(at[0]);
    expect(at[2]).toBeGreaterThan(at[1]);
  });

  it('is honest about time and never promises a fixed duration', () => {
    expect(html).toContain('Konfigurimi zgjat disa minuta.');
    expect(text).not.toMatch(/3 minuta|tre minuta/i);
  });

  it('mentions no medical, plan or price concepts', () => {
    expect(text).not.toMatch(
      /pacient|klinik|mjek|terapi|plan|çmim|lekë|abonim|premium|falas|pagu/i,
    );
  });
});
