import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BUSINESS_TYPES } from '@/lib/business-types';
import { t } from '@/lib/i18n';
import { BusinessStep, type BusinessDraft } from '../business-step';

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
vi.mock('../actions', () => ({ saveBusiness: vi.fn() }));

const empty: BusinessDraft = {
  name: '',
  businessType: null,
  fullName: '',
  title: '',
  tagline: '',
};

function render(initial: BusinessDraft) {
  return renderToStaticMarkup(
    <BusinessStep
      accountId="acc-1"
      facts={{
        introSeen: true,
        business: false,
        services: false,
        serviceModes: [],
        where: false,
        availability: false,
        whatsappSeen: false,
        notificationsSeen: false,
        completed: false,
      }}
      progress={{ kind: 'step', position: 2, total: 7 }}
      backHref="/onboarding/how-it-works"
      initial={initial}
    />,
  );
}

const html = render(empty);

describe('BusinessStep', () => {
  it('shows the heading and subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Biznesi yt<\/h1>/);
    expect(html).toContain(t.onboarding.business.sub);
  });

  it('puts the name field before the type list', () => {
    expect(html.indexOf('id="business-name"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="business-name"')).toBeLessThan(
      html.indexOf('role="radiogroup"'),
    );
  });

  it('offers the type as a labelled group of exactly eleven radios', () => {
    expect(html).toMatch(
      /role="radiogroup"[^>]*aria-labelledby="business-type-label"/,
    );
    expect(html).toMatch(/id="business-type-label"[^>]*>Lloji i biznesit</);
    expect(html.match(/type="radio"/g)).toHaveLength(11);
    expect(html.match(/name="business-type"/g)).toHaveLength(11);
    const labels = [
      ...html.matchAll(/<span class="min-w-0[^>]*>([^<]*)</g),
    ].map((m) => m[1].replace('&#x27;', "'"));
    expect(labels).toEqual(BUSINESS_TYPES.map((type) => t.businessTypes[type]));
  });

  it('has no free-text or dropdown path for the type', () => {
    expect(html).not.toContain('<select');
    for (const m of html.matchAll(/<(?:input|textarea)[^>]*>/g)) {
      if (m[0].includes('type="radio"')) continue;
      expect(m[0]).not.toMatch(/(?:id|name)="[^"]*type/i);
    }
  });

  it('selects nothing by default and exactly the saved type otherwise', () => {
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
    const selected = render({ ...empty, businessType: 'dentist' });
    expect(selected.match(/<input[^>]*type="radio"[^>]*checked/g)).toHaveLength(
      1,
    );
    expect(selected).toMatch(/checked=""[^>]*value="dentist"/);
    expect(selected.match(/lucide-check/g)).toHaveLength(1);
  });

  it('collapses the optional fields unless one is filled', () => {
    const button = html.match(
      /<button[^>]*aria-controls="business-more"[^>]*>/,
    )![0];
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-expanded="false"');
    expect(html).toMatch(/<div id="business-more" hidden/);
    const filled = render({ ...empty, title: 'Manikyriste' });
    expect(filled).toContain('aria-expanded="true"');
    expect(filled).not.toMatch(/<div id="business-more" hidden/);
  });

  it('does not disable Continue', () => {
    expect(
      html.match(/<button[^>]*type="submit"[^>]*>[^]*?<\/button>/)?.[0],
    ).toContain('Vazhdo');
    expect(html).not.toMatch(
      /<button[^>]*type="submit"[^>]*\sdisabled(=|\s|>)/,
    );
  });
});
