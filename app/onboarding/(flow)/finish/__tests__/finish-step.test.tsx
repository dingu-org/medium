import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { FinishStepView, makeFinishHandlers } from '../finish-step';

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
vi.mock('@/lib/hooks/realtime', () => ({ useRealtime: vi.fn() }));
vi.mock('../../actions', () => ({ goToDashboard: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fin = t.onboarding.finish;
const n = t.onboarding.notifications;
const f = t.onboarding.flow;
const esc = (s: string) => s.replace(/'/g, '&#x27;');

function render(whatsappConnected: boolean, promptOffered: boolean) {
  return renderToStaticMarkup(
    <FinishStepView
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
        completed: true,
      }}
      progress={{ kind: 'complete', total: 7 }}
      backHref={null}
      whatsappConnected={whatsappConnected}
      promptOffered={promptOffered}
      onEnable={vi.fn()}
      onNotNow={vi.fn()}
    />,
  );
}

const variants = [
  ['8a', true, false],
  ['8b', false, false],
  ['8c', true, true],
  ['8d', false, true],
] as const;

describe.each(variants)('Finish %s', (_name, connected, offered) => {
  const html = render(connected, offered);

  it('has the headline, sub and the check disc', () => {
    const title = connected ? fin.readyTitle : fin.oneLeftTitle;
    const sub = connected ? fin.readySub : fin.oneLeftSub;
    expect(html).toMatch(new RegExp(`<h1[^>]*>${esc(title)}</h1>`));
    expect(html).toContain(esc(sub));
    expect(html).toContain('size-[72px]');
  });

  it('has no Back, no disabled submit and no upsell', () => {
    expect(html).not.toMatch(/\sdisabled[=\s>]/);
    expect(html).not.toContain(f.back);
    expect(html).not.toMatch(/plan|lekë|€/i);
  });

  it('has exactly one submit button', () => {
    expect(html.match(/<button[^>]*type="submit"/g)).toHaveLength(1);
  });

  it('shows the WhatsApp card only when not connected', () => {
    expect(html.includes(esc(fin.whatsappCardBody))).toBe(!connected);
    expect(html).not.toContain('<a ');
  });

  it('shows the notifications card and prompt buttons only when offered', () => {
    expect(html.includes(`>${n.finishCardTitle}<`)).toBe(offered);
    expect(html.includes(`>${n.enable}<`)).toBe(offered);
    expect(html.includes(`>${f.notNow}<`)).toBe(offered);
    expect(html.includes(`>${f.goToApp}<`)).toBe(!offered);
  });
});

it('puts the WhatsApp card before the notifications card on 8d', () => {
  const html = render(false, true);
  expect(html.indexOf(esc(fin.whatsappCardBody))).toBeLessThan(
    html.indexOf(esc(n.finishCardBody)),
  );
});

describe('makeFinishHandlers', () => {
  const setup = (state: 'granted' | 'denied' | 'unsupported' | 'default') => {
    const order: string[] = [];
    const enable = vi.fn(() => {
      order.push('enable');
      return Promise.resolve(state);
    });
    const dismiss = vi.fn();
    const setAnswered = vi.fn(() => order.push('answered'));
    const onGranted = vi.fn();
    const h = makeFinishHandlers({ enable, dismiss, setAnswered, onGranted });
    return { enable, dismiss, setAnswered, onGranted, order, ...h };
  };
  const STAY = { ok: true, next: '/onboarding/finish' };

  it('calls enable synchronously, before anything else', async () => {
    const s = setup('granted');
    const promise = s.onEnable();
    expect(s.enable).toHaveBeenCalledTimes(1);
    expect(s.order).toEqual(['enable']);
    await expect(promise).resolves.toEqual(STAY);
  });

  it.each(['granted', 'denied', 'unsupported'] as const)(
    'marks the prompt answered on %s',
    async (state) => {
      const s = setup(state);
      await s.onEnable();
      expect(s.setAnswered).toHaveBeenCalledWith(true);
      expect(s.onGranted).toHaveBeenCalledTimes(state === 'granted' ? 1 : 0);
    },
  );

  it('keeps the card when the system prompt was dismissed unanswered', async () => {
    const s = setup('default');
    await expect(s.onEnable()).resolves.toEqual(STAY);
    expect(s.setAnswered).not.toHaveBeenCalled();
  });

  it('Jo tani dismisses, answers and stays', async () => {
    const s = setup('granted');
    await expect(s.onNotNow()).resolves.toEqual(STAY);
    expect(s.dismiss).toHaveBeenCalledTimes(1);
    expect(s.setAnswered).toHaveBeenCalledWith(true);
    expect(s.enable).not.toHaveBeenCalled();
  });
});
