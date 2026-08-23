import { describe, expect, it } from 'vitest';
import {
  buildPaymentsCsv,
  PAYMENTS_CSV_COLUMNS,
  type PaymentExportRow,
} from '@/lib/metrics/payments-export';

const HEADER =
  'paid_at,created_at,pt_email,account_id,plan,period,amount_minor_units,currency,status,pok_order_id,previous_expires_at,new_expires_at';

function row(overrides: Partial<PaymentExportRow> = {}): PaymentExportRow {
  return {
    paidAt: '2026-07-02T09:30:00.000Z',
    createdAt: '2026-07-02T09:00:00.000Z',
    accountEmail: 'account@example.com',
    accountId: '11111111-1111-1111-1111-111111111111',
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250000,
    currency: 'ALL',
    status: 'paid',
    pokOrderId: 'pok_abc123',
    previousExpiresAt: null,
    newExpiresAt: '2026-08-02T09:30:00.000Z',
    ...overrides,
  };
}

describe('buildPaymentsCsv', () => {
  it('emits the exact header in the documented column order', () => {
    expect(PAYMENTS_CSV_COLUMNS.join(',')).toBe(HEADER);
    expect(buildPaymentsCsv([])).toBe(HEADER);
  });

  it('empty input yields the header row alone (no trailing newline)', () => {
    const csv = buildPaymentsCsv([]);
    expect(csv).toBe(HEADER);
    expect(csv.split('\r\n')).toHaveLength(1);
  });

  it('serializes a row with raw minor-unit amount and ISO dates, CRLF-joined', () => {
    const csv = buildPaymentsCsv([row()]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe(
      '2026-07-02T09:30:00.000Z,2026-07-02T09:00:00.000Z,account@example.com,' +
        '11111111-1111-1111-1111-111111111111,solo,monthly,250000,ALL,paid,' +
        'pok_abc123,,2026-08-02T09:30:00.000Z',
    );
  });

  it('renders null date/optional fields as empty fields', () => {
    const csv = buildPaymentsCsv([
      row({ paidAt: null, previousExpiresAt: null, newExpiresAt: null }),
    ]);
    const cells = csv.split('\r\n')[1].split(',');
    // paid_at (index 0), previous_expires_at (10), new_expires_at (11) blank.
    expect(cells[0]).toBe('');
    expect(cells[10]).toBe('');
    expect(cells[11]).toBe('');
  });

  it('RFC-4180 quotes fields containing comma, quote, CR or LF', () => {
    const csv = buildPaymentsCsv([
      row({
        accountEmail: 'a,b@example.com',
        pokOrderId: 'has "quote"',
        plan: 'line1\nline2',
        period: 'cr\rlf',
      }),
    ]);
    const dataLine = csv.slice(csv.indexOf('\r\n') + 2);
    expect(dataLine).toContain('"a,b@example.com"');
    expect(dataLine).toContain('"has ""quote"""');
    expect(dataLine).toContain('"line1\nline2"');
    expect(dataLine).toContain('"cr\rlf"');
  });

  it('does not quote a plain numeric amount', () => {
    const csv = buildPaymentsCsv([row({ amountMinor: 25000 })]);
    expect(csv.split('\r\n')[1]).toContain(',25000,');
  });
});
