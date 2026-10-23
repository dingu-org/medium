import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import {
  defaultDraft,
  draftFromRules,
  type AvailabilityDraft,
} from '@/lib/onboarding/availability';
import { AvailabilityStep } from '../availability-step';

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
vi.mock('../actions', () => ({ saveAvailabilityStep: vi.fn() }));

function render(initial: AvailabilityDraft) {
  return renderToStaticMarkup(
    <AvailabilityStep
      accountId="acc-1"
      facts={{
        introSeen: true,
        business: true,
        services: true,
        serviceModes: [],
        where: true,
        availability: false,
        whatsappSeen: false,
        notificationsSeen: false,
        completed: false,
      }}
      progress={{ kind: 'step', position: 5, total: 7 }}
      backHref="/onboarding/where"
      initial={initial}
    />,
  );
}

const a = t.onboarding.availability;
const TZ = 'Europe/Tirane';

describe('AvailabilityStep: default', () => {
  const html = render(defaultDraft(TZ));
  const at = (s: string) => html.indexOf(s);

  it('shows the heading then the subheading', () => {
    expect(html).toMatch(/<h1[^>]*>Kur punon\?<\/h1>/);
    expect(at(a.sub)).toBeGreaterThan(at('Kur punon?'));
  });

  it('puts the timezone line under the subheading, above the days and hours', () => {
    const order = [
      a.sub,
      a.tzPrefix,
      'Tiranë',
      `aria-label="${a.tzChangeLabel}"`,
      a.daysLegend,
      'aria-pressed',
      a.hoursLegend,
      'id="availability-start"',
    ].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    const main = html.slice(at('<main'), at('</main>'));
    expect(main).toContain(a.tzPrefix);
  });

  it('renders seven named day chips, Monday first, Mon-Fri pressed', () => {
    const chips = [
      ...html.matchAll(
        /<button type="button" aria-pressed="(true|false)" aria-label="([^"]+)"/g,
      ),
    ];
    expect(chips.map((m) => m[2])).toEqual(
      [1, 2, 3, 4, 5, 6, 0].map((w) => t.availability.days[w]),
    );
    expect(chips.map((m) => m[1])).toEqual([
      'true',
      'true',
      'true',
      'true',
      'true',
      'false',
      'false',
    ]);
    for (const w of [1, 2, 3, 4, 5, 6, 0]) {
      expect(html).toContain(`>${t.availability.daysShort[w]}</button>`);
    }
  });

  it('uses native time inputs with labels', () => {
    expect(html).toMatch(
      /id="availability-start"[^>]*type="time"[^>]*value="09:00"|type="time"[^>]*id="availability-start"/,
    );
    expect(html).toMatch(/for="availability-start"[^>]*>Fillon</);
    expect(html).toMatch(/for="availability-end"[^>]*>Mbaron</);
    expect(html).toContain('value="17:00"');
  });

  it('has a collapsed disclosure and a hidden weekly list', () => {
    expect(html).toMatch(
      /aria-expanded="false"[^>]*aria-controls="availability-week"/,
    );
    expect(html).toContain(a.differentHours);
    const list = html.slice(at('id="availability-week"'));
    expect(list).toMatch(/^id="availability-week" hidden/);
    expect(list).toContain('E hënë ora e fillimit');
    expect(list.match(/Mbyllur/g)).toHaveLength(2);
  });

  it('never disables Continue and has no extras', () => {
    expect(html).not.toMatch(/<button[^>]*\sdisabled[\s=>]/);
    expect(html).not.toContain('Kopjo');
    expect(html).not.toContain('Shto më shumë');
  });
});

describe('AvailabilityStep: other data', () => {
  it('opens the list by itself when the days differ', () => {
    const html = render(
      draftFromRules([{ weekday: 3, start: '12:00', end: '20:00' }], TZ),
    );
    // Uniform (one day): collapsed. Add a second day with other hours.
    const mixed = render(
      draftFromRules(
        [
          { weekday: 3, start: '12:00', end: '20:00' },
          { weekday: 5, start: '09:00', end: '14:00' },
        ],
        TZ,
      ),
    );
    expect(html).toMatch(/aria-expanded="false"/);
    expect(mixed).toMatch(/aria-expanded="true"/);
    expect(mixed).not.toMatch(/id="availability-week" hidden/);
    expect(mixed).toMatch(/<fieldset id="availability-hours" hidden/);
    expect(mixed).toContain('value="12:00"');
    expect(mixed).toContain('value="20:00"');
  });

  it('labels a non-Tirana timezone by its city', () => {
    expect(render(defaultDraft('Europe/Rome'))).toContain('>Rome<');
  });
});
