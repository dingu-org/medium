import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { AppointmentSheet } from '../appointment-sheet';
import type { AppointmentView } from '../types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(dashboard)/calendar/actions', () => ({
  getUpcomingSlots: vi.fn(),
}));
vi.mock('@/lib/pwa/mutation-client', () => ({
  queueAppointmentMutation: vi.fn(),
}));
vi.mock('@/lib/pwa/client-store', () => ({
  listPendingMutations: vi.fn(async () => []),
  subscribeToQueueChanges: vi.fn(() => () => undefined),
}));
vi.mock('@/lib/hooks/realtime', () => ({ useOnlineStatus: () => true }));
// The Radix sheet renders into a portal; inline it so the detail card is visible.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const base: AppointmentView = {
  id: 'appt-1',
  customerName: 'Ana Krasniqi',
  customerPhone: '+355691234567',
  customerWaId: '355691234567',
  conversationId: 'conv-1',
  startsAt: '2026-07-30T08:00:00.000Z',
  endsAt: '2026-07-30T08:45:00.000Z',
  serviceType: 'Vizitë në shtëpi',
  status: 'confirmed',
  notes: null,
  clientAddress: null,
  reminder: { status: 'sent', responseType: null },
};

function render(appointment: AppointmentView) {
  return renderToStaticMarkup(
    <AppointmentSheet
      appointment={appointment}
      open
      onOpenChange={() => undefined}
      timezone="Europe/Tirane"
    />,
  );
}

describe('AppointmentSheet client address', () => {
  it('shows the address the client gave, with an accessible label', () => {
    const markup = render({
      ...base,
      clientAddress: 'Rruga e Kavajës 5, Tiranë',
    });
    expect(markup).toContain('Rruga e Kavajës 5, Tiranë');
    expect(markup).toContain(t.appointment.clientAddress);
  });

  it('shows nothing when the appointment has no client address', () => {
    const markup = render(base);
    expect(markup).not.toContain(t.appointment.clientAddress);
  });
});
