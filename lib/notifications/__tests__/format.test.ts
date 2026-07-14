import { describe, expect, it } from 'vitest';
import { formatNotification } from '../format';

const TZ = 'Europe/Tirane';
const base = { id: 'evt-1', occurredAt: '2026-07-14T10:00:00.000Z' };
const view = (type: string, payload: Record<string, unknown>) =>
  formatNotification({ ...base, type, payload }, { timezone: TZ });

describe('formatNotification — billing lifecycle (bell)', () => {
  it('routes every billing event to /settings/billing', () => {
    const events: [string, Record<string, unknown>][] = [
      ['billing.renewal_due', { expiresAt: '2026-08-01', daysLeft: 5 }],
      ['billing.grace_started', { expiresAt: '2026-08-01' }],
      ['billing.downgraded', { from: 'solo', to: 'free' }],
      ['billing.payment_received', { newExpiresAt: '2026-09-01' }],
    ];
    for (const [type, payload] of events) {
      expect(view(type, payload).href).toBe('/settings/billing');
    }
  });

  it('distinguishes the day-0 renewal reminder from an earlier one', () => {
    const soon = view('billing.renewal_due', { daysLeft: 5 });
    const today = view('billing.renewal_due', { daysLeft: 0 });
    expect(soon.title).not.toBe(today.title);
    expect(soon.icon).toBe('alert');
  });

  it('marks lifecycle warnings with the alert icon', () => {
    expect(view('billing.grace_started', {}).icon).toBe('alert');
    expect(view('billing.downgraded', {}).icon).toBe('alert');
  });

  it('marks a successful payment with the check icon', () => {
    expect(view('billing.payment_received', {}).icon).toBe('check');
  });
});
