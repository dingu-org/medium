import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import type { WhatsappChoice } from '@/lib/onboarding/whatsapp';
import { WhatsappStep } from '../whatsapp-step';

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
vi.mock('@/lib/hooks/realtime', () => ({ useOnlineStatus: () => true }));
vi.mock('../../actions', () => ({ markSeenAndAdvance: vi.fn() }));

const w = t.onboarding.whatsapp;
const FACTS = {
  introSeen: true,
  business: true,
  services: true,
  serviceModes: [],
  where: true,
  availability: true,
  whatsappSeen: false,
  notificationsSeen: false,
  completed: false,
};

function render(
  initialChoice: WhatsappChoice | null,
  extra: Partial<Parameters<typeof WhatsappStep>[0]> = {},
) {
  return renderToStaticMarkup(
    <WhatsappStep
      accountId="acc-1"
      facts={FACTS}
      progress={{ kind: 'step', position: 6, total: 7 }}
      backHref="/onboarding/availability"
      reopened={false}
      appId="app"
      configId="cfg"
      graphVersion="v23.0"
      initialChoice={initialChoice}
      {...extra}
    />,
  );
}

const radios = (html: string) => [
  ...html.matchAll(/<input[^>]*type="radio"[^>]*>/g),
];
const submit = (html: string) =>
  html.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];

describe('WhatsappStep 6a: nothing chosen', () => {
  const html = render(null);

  it('shows the heading, subheading, legend and both rows', () => {
    expect(html).toMatch(/<h1[^>]*>Lidh WhatsApp<\/h1>/);
    for (const s of [
      w.sub,
      w.legend,
      w.choices.have.title,
      w.choices.have.sub,
      w.choices.notYet.title,
      w.choices.notYet.sub,
    ]) {
      expect(html).toContain(s);
    }
  });

  it('has a radiogroup named by the legend with two unchecked radios', () => {
    expect(html).toMatch(
      /id="wa-choice-label"[^>]*>Ke një numër WhatsApp Business\?/,
    );
    expect(html).toMatch(
      /role="radiogroup"[^>]*aria-labelledby="wa-choice-label"/,
    );
    const found = radios(html);
    expect(found).toHaveLength(2);
    for (const r of found) expect(r[0]).not.toContain('checked');
  });

  it('has no main button at all, only the skip link', () => {
    expect(submit(html)).toHaveLength(0);
    expect(html).not.toContain(`>${w.connect}<`);
    expect(html).not.toContain(`>${w.showGuide}<`);
    expect(html).not.toContain(w.metaNote);
    expect(html).toContain(t.onboarding.flow.later);
    expect(html).toContain('role="progressbar"');
  });
});

describe('WhatsappStep 6b: have a number', () => {
  const html = render('have');
  it('checks the first row, shows the connect button and the Meta note', () => {
    const [first, second] = radios(html);
    expect(first[0]).toContain('checked');
    expect(second[0]).not.toContain('checked');
    expect(submit(html)).toHaveLength(1);
    expect(html).toContain(`>${w.connect}<`);
    expect(html).toContain(w.metaNote);
    expect(html).toContain(t.onboarding.flow.later);
  });
});

describe('WhatsappStep 6c: not yet', () => {
  const html = render('notYet');
  it('checks the second row and offers the guide', () => {
    const [first, second] = radios(html);
    expect(first[0]).not.toContain('checked');
    expect(second[0]).toContain('checked');
    expect(submit(html)).toHaveLength(1);
    expect(html).toContain(`>${w.showGuide}<`);
    expect(html).not.toContain(w.metaNote);
  });
});

describe('WhatsappStep: reopened from the dashboard', () => {
  it('has no progress bar but keeps Back', () => {
    const html = render(null, {
      reopened: true,
      progress: null,
      backHref: '/today',
    });
    expect(html).not.toContain('role="progressbar"');
    expect(html).toContain(`aria-label="${t.onboarding.flow.back}"`);
  });
});
