import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import {
  OneStepLeftCardView,
  oneStepLeftSnoozed,
  snoozeOneStepLeft,
} from '../one-step-left-card';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const DAY = 24 * 60 * 60 * 1000;

function stubStorage(impl: Partial<Storage> | null) {
  const store = new Map<string, string>();
  vi.stubGlobal(
    'localStorage',
    impl ?? {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('OneStepLeftCardView', () => {
  const html = renderToStaticMarkup(<OneStepLeftCardView onDismiss={vi.fn()} />);

  it('is one link to the two-path WhatsApp screen', () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="/onboarding/whatsapp"');
    expect(html).toContain(t.onboarding.oneStepLeft.eyebrow);
    expect(html).toContain(t.onboarding.oneStepLeft.title);
  });

  it('has a labelled dismiss button', () => {
    expect(html).toContain(`aria-label="${t.onboarding.oneStepLeft.dismiss}"`);
    expect(html.match(/<button/g)).toHaveLength(1);
  });
});

describe('snooze', () => {
  it('is not snoozed fresh, snoozed after, and expires after 7 days', () => {
    stubStorage(null);
    expect(oneStepLeftSnoozed('a', 1000)).toBe(false);
    snoozeOneStepLeft('a', 1000);
    expect(oneStepLeftSnoozed('a', 1000 + DAY)).toBe(true);
    expect(oneStepLeftSnoozed('a', 1000 + 7 * DAY - 1)).toBe(true);
    expect(oneStepLeftSnoozed('a', 1000 + 7 * DAY + 1)).toBe(false);
    expect(oneStepLeftSnoozed('b', 1000 + DAY)).toBe(false);
  });

  it('survives storage that throws', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    stubStorage({ getItem: boom, setItem: boom });
    expect(oneStepLeftSnoozed('a', 1)).toBe(false);
    expect(() => snoozeOneStepLeft('a', 1)).not.toThrow();
  });
});
