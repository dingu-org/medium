import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { formatLek } from '@/lib/i18n/number';
import { EMPTY_FORM, type ServiceCardData } from '../form';
import { ServicesStep } from '../services-step';

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
vi.mock('../actions', () => ({ saveServiceStep: vi.fn() }));

const saved: ServiceCardData = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Manikyr me xhel',
  durationMinutes: 60,
  priceLek: 2500,
  mode: 'at_business',
  description: 'Manikyr me xhel dhe lyerje.',
  active: true,
};

function render(props: {
  form: Parameters<typeof ServicesStep>[0]['initial']['form'];
  services?: ServiceCardData[];
  canAddMore?: boolean;
}) {
  return renderToStaticMarkup(
    <ServicesStep
      accountId="acc-1"
      facts={{
        introSeen: true,
        business: true,
        services: false,
        serviceModes: [],
        where: false,
        availability: false,
        whatsappSeen: false,
        notificationsSeen: false,
        completed: false,
      }}
      progress={{ kind: 'step', position: 3, total: 7 }}
      backHref="/onboarding/business"
      services={props.services ?? []}
      canAddMore={props.canAddMore ?? true}
      initial={{ form: props.form }}
    />,
  );
}

const html = render({ form: EMPTY_FORM });

describe('ServicesStep form', () => {
  it('shows the heading and the form subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Shërbimi yt<\/h1>/);
    expect(html).toContain(t.onboarding.services.sub.replace("'", '&#x27;'));
  });

  it('orders name, duration, price, mode, description', () => {
    const order = [
      'id="service-name"',
      'id="service-duration-label"',
      'id="service-price"',
      'id="service-mode-label"',
      'id="service-description"',
    ].map((marker) => html.indexOf(marker));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('offers six unpressed duration chips', () => {
    const chips = [
      ...html.matchAll(/<button[^>]*aria-pressed="(\w+)"[^>]*>([^<]*)</g),
    ];
    expect(chips.map((m) => m[2])).toEqual([
      '15 min',
      '30 min',
      '45 min',
      '60 min',
      '90 min',
      'Tjetër',
    ]);
    expect(chips.every((m) => m[1] === 'false')).toBe(true);
  });

  it('has a numeric price input with the Lekë unit', () => {
    expect(html).toMatch(/<input[^>]*id="service-price"[^>]*/);
    expect(html.match(/<input[^>]*id="service-price"[^>]*>/)![0]).toContain(
      'inputMode="numeric"',
    );
    expect(html).toMatch(/id="service-price-unit"[^>]*>Lekë</);
  });

  it('offers exactly three mode radios and preselects none', () => {
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html.match(/name="service-mode"/g)).toHaveLength(3);
    expect(html).not.toMatch(/type="radio"[^>]*checked/);
    for (const mode of Object.values(t.onboarding.services.modes)) {
      expect(html).toContain(mode.title);
      expect(html).toContain(mode.sub.replace("'", '&#x27;'));
    }
    expect(html).toMatch(/role="radiogroup"[^>]*aria-required="true"/);
  });

  it('has a description textarea, no dropdown, no suggestions', () => {
    expect(html).toMatch(/<textarea[^>]*id="service-description"/);
    expect(html).not.toContain('<select');
    expect(html.toLowerCase()).not.toContain('sugjer');
  });

  it('keeps Continue enabled and the optional switch closed', () => {
    expect(
      html.match(/<button[^>]*type="submit"[^>]*>[^]*?<\/button>/)?.[0],
    ).toContain('Vazhdo');
    expect(html).not.toMatch(
      /<button[^>]*type="submit"[^>]*\sdisabled(=|\s|>)/,
    );
    expect(html).toMatch(/aria-controls="service-more"[^>]*/);
    expect(html).toMatch(/<div id="service-more" hidden/);
  });

  it('shows a custom duration as Tjetër with the minutes filled', () => {
    const custom = render({
      form: { ...EMPTY_FORM, customDuration: true, customMinutes: '50' },
    });
    expect(custom).toMatch(/aria-pressed="true"[^>]*>Tjetër</);
    expect(custom.match(/<input[^>]*id="service-minutes"[^>]*>/)![0]).toContain(
      'value="50"',
    );
  });

  it('checks only the saved mode', () => {
    const online = render({ form: { ...EMPTY_FORM, mode: 'online' } });
    expect(online.match(/<input[^>]*type="radio"[^>]*checked/g)).toHaveLength(
      1,
    );
    expect(online).toMatch(/checked=""[^>]*value="online"/);
  });
});

describe('ServicesStep saved list', () => {
  const list = render({ form: null, services: [saved], canAddMore: false });

  it('shows the saved subheading and a compact card without form fields', () => {
    expect(list).toContain(t.onboarding.services.subSaved);
    expect(list).not.toContain('id="service-name"');
    expect(list).toContain('Manikyr me xhel');
    expect(list).toContain(`60 min · ${formatLek(2500)} Lekë`);
    expect(list).toContain('aria-label="Ndrysho shërbimin Manikyr me xhel"');
  });

  it('explains the Free limit on a gated row, with no link or upsell', () => {
    const gated = list.match(
      /<button[^>]*aria-disabled="true"[^>]*>[^]*?<\/button>/,
    )![0];
    expect(gated).toContain('Shto shërbim');
    expect(gated).toContain('Plani falas përfshin një shërbim.');
    expect(list).not.toContain('<a ');
    expect(list).not.toMatch(/Solo|Kalo/);
  });

  it('shows an enabled add row when more services are allowed', () => {
    const open = render({ form: null, services: [saved], canAddMore: true });
    expect(open).toContain('Shto shërbim');
    expect(open).not.toContain('aria-disabled');
  });

  it('marks a hidden service', () => {
    const hidden = render({
      form: null,
      services: [saved, { ...saved, id: 'x', active: false }],
    });
    expect(hidden).toContain(t.onboarding.services.hiddenTag);
  });

  it('keeps the gated row visible under the form while editing', () => {
    const editing = render({
      form: { ...EMPTY_FORM, id: saved.id, name: saved.name },
      services: [saved],
      canAddMore: false,
    });
    expect(editing).toContain('id="service-name"');
    expect(editing).toContain('aria-disabled="true"');
  });
});
