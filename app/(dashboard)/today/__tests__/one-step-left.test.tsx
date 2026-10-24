import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TodaySnapshot } from '@/lib/today/queries';
import { TodayClient } from '../today-client';

vi.mock('@/lib/pwa/mutation-client', () => ({
  queueAppointmentMutation: vi.fn(),
}));
vi.mock('@/components/realtime-refresher', () => ({
  RealtimeRefresher: () => null,
}));
vi.mock('@/components/appointments/appointment-sheet', () => ({
  AppointmentSheet: () => null,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const quiet: TodaySnapshot = {
  accountId: 'account-1',
  timezone: 'Europe/Tirane',
  now: '2026-07-30T07:00:00.000Z',
  attention: [],
  next: null,
  later: [],
  week: { messagesReceived: 0, bookings: 0, escalations: 0 },
};

const html = (props: { whatsappStepLeft?: boolean }) =>
  renderToStaticMarkup(
    <TodayClient snapshot={quiet} remindersEnabled={false} {...props} />,
  );

describe('Today one-step-left card', () => {
  it('shows the card and hides the green "nothing needs you" card', () => {
    const out = html({ whatsappStepLeft: true });
    expect(out).toContain('href="/onboarding/whatsapp"');
    expect(out).toContain('Lidh WhatsApp');
    expect(out).not.toContain('Asgjë nuk kërkon vëmendjen tënde');
    expect(out).toContain('Asnjë takim sot');
  });

  it('renders the same markup with the prop absent or false (legacy)', () => {
    expect(html({})).toBe(html({ whatsappStepLeft: false }));
    expect(html({})).not.toContain('/onboarding/whatsapp');
    expect(html({})).toContain('Asgjë nuk kërkon vëmendjen tënde');
  });
});
