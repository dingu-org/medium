import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import type { TodayAppointment, TodaySnapshot } from '@/lib/today/queries';
import { CancelAppointmentDialog, TodayClient } from '../today-client';

const { queueMock, sheetRenders } = vi.hoisted(() => ({
  queueMock: vi.fn(async () => ({
    status: 'sent' as const,
    response: null,
    clientMutationId: 'cm-1',
  })),
  sheetRenders: [] as { remindersEnabled?: boolean }[],
}));

vi.mock('@/lib/pwa/mutation-client', () => ({
  queueAppointmentMutation: queueMock,
}));
// Renders the subscribed table so a test can see which channels are opened.
vi.mock('@/components/realtime-refresher', () => ({
  RealtimeRefresher: ({ table }: { table: string }) => (
    <span data-realtime-table={table} />
  ),
}));
vi.mock('@/components/appointments/appointment-sheet', () => ({
  AppointmentSheet: (props: { remindersEnabled?: boolean }) => {
    sheetRenders.push(props);
    return null;
  },
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const appointment: TodayAppointment = {
  id: 'appt-1',
  customerName: 'Ana Krasniqi',
  customerPhone: '+355691234567',
  customerWaId: '355691234567',
  conversationId: 'conv-1',
  startsAt: '2026-07-30T08:00:00.000Z',
  endsAt: '2026-07-30T08:45:00.000Z',
  serviceType: 'Fizioterapi',
  status: 'confirmed',
  notes: null,
  reminder: { status: 'sent', responseType: null },
  startLabel: 'Nesër 10:00',
  durationMinutes: 45,
};

function snapshotWith(attention: TodaySnapshot['attention']): TodaySnapshot {
  return {
    accountId: 'account-1',
    timezone: 'Europe/Tirane',
    now: '2026-07-30T07:00:00.000Z',
    attention,
    next: null,
    later: [],
    week: { messagesReceived: 3, bookings: 1, escalations: 0 },
  };
}

describe('TodayClient attention card', () => {
  it('renders "Anulo" without cancelling or exposing the confirmation up front', () => {
    const markup = renderToStaticMarkup(
      <TodayClient
        snapshot={snapshotWith([
          {
            kind: 'reminder',
            customerId: 'customer-1',
            customerName: appointment.customerName,
            conversationId: 'conv-1',
            appointment,
          },
        ])}
        remindersEnabled={false}
      />,
    );

    expect(markup).toContain('Anulo');
    // One tap must not cancel: the confirmation step is still closed.
    expect(markup).not.toContain(t.appointment.cancelTitle);
    expect(markup).not.toContain(t.appointment.cancelReasonPlaceholder);
    expect(queueMock).not.toHaveBeenCalled();
  });

  it('renders no cancel affordance for an escalation with no appointment', () => {
    const markup = renderToStaticMarkup(
      <TodayClient
        snapshot={snapshotWith([
          {
            kind: 'escalation',
            customerId: 'customer-1',
            customerName: appointment.customerName,
            conversationId: 'conv-1',
            appointment: null,
          },
        ])}
        remindersEnabled={false}
      />,
    );

    expect(markup).not.toContain('Anulo');
    expect(queueMock).not.toHaveBeenCalled();
  });
});

describe('CancelAppointmentDialog', () => {
  function render(overrides: { reason?: string } = {}) {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const onReasonChange = vi.fn();
    const tree = CancelAppointmentDialog({
      appointment,
      reason: overrides.reason ?? '',
      onReasonChange,
      onConfirm,
      onClose,
      pending: false,
    });
    return { tree, onConfirm, onClose, onReasonChange };
  }

  it('confirms through the destructive button and names the appointment', () => {
    const { tree, onConfirm, onClose } = render({ reason: 'Sëmurë' });

    const confirm = findByProps(tree, { variant: 'destructive' });
    expect(confirm?.props.children).toBe(t.appointment.cancelConfirm);
    clickOf(confirm)();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    const textarea = findByProps(tree, {
      placeholder: t.appointment.cancelReasonPlaceholder,
    });
    expect(textarea?.props.value).toBe('Sëmurë');
  });

  it('backs out through the ghost button without confirming', () => {
    const { tree, onConfirm, onClose } = render();

    clickOf(findByProps(tree, { variant: 'ghost' }))();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

/** First element in the tree whose props include every given entry. */
function findByProps(
  node: ReactNode,
  match: Record<string, unknown>,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByProps(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;

  const props = node.props as Record<string, unknown>;
  if (Object.entries(match).every(([key, value]) => props[key] === value)) {
    return node as ReactElement<Record<string, unknown>>;
  }
  return findByProps(props.children as ReactNode, match);
}

/** The element's onClick, asserting it exists (a missing gate must fail loudly). */
function clickOf(
  element: ReactElement<Record<string, unknown>> | null,
): () => void {
  const onClick = element?.props.onClick;
  expect(typeof onClick).toBe('function');
  return onClick as () => void;
}

describe('TodayClient reminder gating', () => {
  it('opens no reminder_jobs channel while reminders are parked', () => {
    const markup = renderToStaticMarkup(
      <TodayClient snapshot={snapshotWith([])} remindersEnabled={false} />,
    );

    // The appointments channel is unconditional; reminder_jobs is not written
    // to at all while the feature is off, so holding a socket on it is waste.
    expect(markup).toContain('data-realtime-table="appointments"');
    expect(markup).not.toContain('reminder_jobs');
  });

  it('opens the reminder_jobs channel again once reminders are on', () => {
    const markup = renderToStaticMarkup(
      <TodayClient snapshot={snapshotWith([])} remindersEnabled />,
    );

    expect(markup).toContain('data-realtime-table="reminder_jobs"');
  });

  it('hands the flag down to the appointment sheet', () => {
    sheetRenders.length = 0;
    renderToStaticMarkup(
      <TodayClient snapshot={snapshotWith([])} remindersEnabled />,
    );

    expect(sheetRenders.at(-1)?.remindersEnabled).toBe(true);
  });
});
