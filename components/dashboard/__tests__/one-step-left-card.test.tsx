import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { OneStepLeftCard } from '../one-step-left-card';

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

describe('OneStepLeftCard', () => {
  const html = renderToStaticMarkup(<OneStepLeftCard />);

  it('is one link to the two-path WhatsApp screen', () => {
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html.match(/href="\/onboarding\/whatsapp"/g)).toHaveLength(1);
    expect(html).toContain(t.onboarding.oneStepLeft.eyebrow);
    expect(html).toContain(t.onboarding.oneStepLeft.title);
  });

  it('cannot be dismissed', () => {
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Fshih këtë kartë');
  });
});
