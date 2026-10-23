import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import type { WhereNeeds } from '@/lib/onboarding/where';
import { WhereStep, type WhereDraft } from '../where-step';

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
vi.mock('../actions', () => ({ saveWhere: vi.fn() }));

const empty: WhereDraft = {
  city: '',
  address: '',
  directions: '',
  parking: '',
  entrance: '',
  floor: '',
  serviceArea: '',
};
const business: WhereNeeds = { atBusiness: true, atClient: false };
const client: WhereNeeds = { atBusiness: false, atClient: true };
const mixed: WhereNeeds = { atBusiness: true, atClient: true };

function render(needs: WhereNeeds, initial: Partial<WhereDraft> = {}) {
  return renderToStaticMarkup(
    <WhereStep
      accountId="acc-1"
      facts={{
        introSeen: true,
        business: true,
        services: true,
        serviceModes: [],
        where: false,
        availability: false,
        whatsappSeen: false,
        notificationsSeen: false,
        completed: false,
      }}
      progress={{ kind: 'step', position: 4, total: 7 }}
      backHref="/onboarding/services"
      needs={needs}
      initial={{ ...empty, ...initial }}
    />,
  );
}

const w = t.onboarding.where;

describe('WhereStep: at the business', () => {
  const html = render(business);

  it('shows the heading and subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Ku i pret klientët\?<\/h1>/);
    expect(html).toContain(w.sub);
  });

  it('orders country, city, address, details', () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('Shteti')).toBeGreaterThan(-1);
    expect(at('Shteti')).toBeLessThan(at('Shqipëri'));
    expect(at('Shqipëri')).toBeLessThan(at('id="where-city"'));
    expect(at('id="where-city"')).toBeLessThan(at('id="where-address"'));
    expect(at('id="where-address"')).toBeLessThan(at('Shto detaje'));
  });

  it('renders the country as plain text, not a control', () => {
    const idx = html.indexOf('Shqipëri');
    const before = html.slice(0, idx);
    expect(before.lastIndexOf('<input')).toBeLessThan(before.lastIndexOf('>'));
    expect(html).not.toContain('<select');
    expect(html).not.toContain('Ndrysho');
    expect(html).not.toMatch(/<button[^>]*>[^<]*Shqipëri/);
  });

  it('shows nothing about a service area, and no section labels', () => {
    expect(html).not.toContain('id="where-area"');
    expect(html).not.toContain('Zona ku shërben');
    expect(html).not.toContain('Shembull');
    expect(html).not.toContain('<h2');
  });

  it('keeps the four optional inputs mounted in a collapsed disclosure', () => {
    expect(html).toMatch(
      /<button[^>]*aria-expanded="false"[^>]*aria-controls="where-details"/,
    );
    expect(html).toMatch(/<div id="where-details" hidden=""/);
    for (const id of ['directions', 'parking', 'entrance', 'floor']) {
      expect(html).toContain(`id="where-${id}"`);
    }
    expect(html).toContain(w.directionsPlaceholder);
    expect(html).toContain(w.floorPlaceholder);
  });

  it('never disables Continue and has no link field', () => {
    expect(html).not.toMatch(/ disabled(=|>|\s)/);
    expect(html).not.toContain('type="url"');
  });

  it('opens the disclosure when an optional value is filled', () => {
    const filled = render(business, { directions: 'X' });
    expect(filled).toMatch(/aria-expanded="true"[^>]*aria-controls/);
    expect(filled).not.toMatch(/<div id="where-details" hidden=""/);
  });
});

describe('WhereStep: at the client', () => {
  const html = render(client);

  it('shows the heading, subheading and the area field', () => {
    expect(html).toMatch(/<h1[^>]*>Ku shkon te klientët\?<\/h1>/);
    expect(html).toContain(w.subAtClient);
    expect(html).toContain('id="where-area"');
    expect(html).toContain(w.areaPlaceholder);
  });

  it('has a labelled Shembull button', () => {
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="Shembull: Tiranë dhe rrethinat"|<button[^>]*aria-label="Shembull: Tiranë dhe rrethinat"[^>]*type="button"/,
    );
  });

  it('asks for no address', () => {
    for (const s of ['where-city', 'where-address', 'Shteti', 'Shto detaje']) {
      expect(html).not.toContain(s);
    }
  });
});

describe('WhereStep: mixed', () => {
  const html = render(mixed);

  it('shows both groups under two section headings, business first', () => {
    expect(html).toMatch(/<h1[^>]*>Ku i ofron shërbimet\?<\/h1>/);
    expect(html).toContain(w.subMixed);
    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(html.indexOf('Në ambientin tënd')).toBeLessThan(
      html.indexOf('Te klienti'),
    );
    expect(html.indexOf('id="where-city"')).toBeLessThan(
      html.indexOf('id="where-area"'),
    );
    expect(html).not.toContain('Ndrysho');
  });
});

describe('WhereStep: retained values', () => {
  const saved = { city: 'Tiranë', address: 'Rruga 1', serviceArea: 'Durrës' };

  it('at client shows the area and drops the hidden group', () => {
    const html = render(client, saved);
    expect(html).toMatch(/id="where-area"[^>]*value="Durrës"/);
    expect(html).not.toContain('where-address');
  });

  it('at business shows city and address', () => {
    const html = render(business, saved);
    expect(html).toMatch(/id="where-city"[^>]*value="Tiranë"/);
    expect(html).toMatch(/id="where-address"[^>]*value="Rruga 1"/);
  });
});

describe('WhereStep: online only', () => {
  it('renders no fields and no link field', () => {
    const html = render({ atBusiness: false, atClient: false });
    expect(html).toContain(w.nothingNeeded);
    expect(html).not.toContain('<input');
  });
});
