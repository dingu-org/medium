import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

/**
 * POK payments CSV export for the admin dashboard (Phase 16 C7). Cross-tenant,
 * owner-connection reads gated only by ADMIN_EMAILS in the route handler.
 *
 * The default export is the FISCAL view: rows keyed on `paid_at` with
 * status='paid' — the money-received event, ordered chronologically. `?all=1`
 * dumps every order (any status) keyed on `created_at` for reconciliation.
 *
 * Currency discipline: amounts stay RAW. `amount_minor` is POK minor units and
 * the ALL minor-unit factor is UNCONFIRMED (C5 sandbox spike). The CSV names the
 * column `amount_minor_units` and emits no converted major-unit column — nobody
 * should divide until the spike confirms the factor.
 */
export type PaymentExportRow = {
  paidAt: string | null;
  createdAt: string;
  ptEmail: string;
  ptId: string;
  plan: string;
  period: string;
  amountMinor: number;
  currency: string;
  status: string;
  pokOrderId: string;
  previousExpiresAt: string | null;
  newExpiresAt: string | null;
};

/** Column order + header labels for the exported CSV (RFC-4180). */
export const PAYMENTS_CSV_COLUMNS = [
  'paid_at',
  'created_at',
  'pt_email',
  'pt_id',
  'plan',
  'period',
  'amount_minor_units',
  'currency',
  'status',
  'pok_order_id',
  'previous_expires_at',
  'new_expires_at',
] as const;

type RawRow = {
  paidAt: Date | string | null;
  createdAt: Date | string;
  ptEmail: string;
  ptId: string;
  plan: string;
  period: string;
  amountMinor: number;
  currency: string;
  status: string;
  pokOrderId: string;
  previousExpiresAt: Date | string | null;
  newExpiresAt: Date | string | null;
};

// `db.execute` returns timestamptz columns as Postgres text
// ("2026-04-10 10:00:00+00"), not JS Dates — normalize to ISO 8601.
function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function mapRow(row: RawRow): PaymentExportRow {
  return {
    paidAt: toIso(row.paidAt),
    createdAt: toIso(row.createdAt) ?? '',
    ptEmail: row.ptEmail,
    ptId: row.ptId,
    plan: row.plan,
    period: row.period,
    amountMinor: Number(row.amountMinor),
    currency: row.currency,
    status: row.status,
    pokOrderId: row.pokOrderId,
    previousExpiresAt: toIso(row.previousExpiresAt),
    newExpiresAt: toIso(row.newExpiresAt),
  };
}

/** UTC [start, end) instants for a `YYYY-MM` month key. */
function monthBounds(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/**
 * Payments for a `YYYY-MM` month. Default: paid orders keyed on `paid_at`,
 * ordered by `paid_at`. `options.all`: every order (any status) in the month
 * keyed on `created_at`, ordered by `created_at` — for reconciliation.
 */
export async function loadPaymentsForMonth(
  monthKey: string,
  options: { all?: boolean } = {},
): Promise<PaymentExportRow[]> {
  const { start, end } = monthBounds(monthKey);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const selection = sql`
    SELECT o.paid_at AS "paidAt", o.created_at AS "createdAt",
      p.email AS "ptEmail", o.pt_id AS "ptId",
      o.plan AS "plan", o.period AS "period",
      o.amount_minor AS "amountMinor", o.currency AS "currency",
      o.status AS "status", o.pok_order_id AS "pokOrderId",
      o.previous_expires_at AS "previousExpiresAt",
      o.new_expires_at AS "newExpiresAt"
    FROM billing_orders o
    JOIN pts p ON p.id = o.pt_id
  `;

  const rows = options.all
    ? await db.execute<RawRow>(sql`
        ${selection}
        WHERE o.created_at >= ${startIso}::timestamptz
          AND o.created_at < ${endIso}::timestamptz
        ORDER BY o.created_at ASC
      `)
    : await db.execute<RawRow>(sql`
        ${selection}
        WHERE o.status = 'paid'
          AND o.paid_at >= ${startIso}::timestamptz
          AND o.paid_at < ${endIso}::timestamptz
        ORDER BY o.paid_at ASC
      `);

  return rows.map(mapRow);
}

/** RFC-4180 field: quote when it contains a quote, comma, CR or LF. */
function csvField(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * PURE RFC-4180 serializer. CRLF line breaks; empty input yields the header row
 * alone. No converted major-unit column while the ALL minor-unit factor is
 * UNCONFIRMED — the header says `amount_minor_units` so the raw unit is explicit.
 */
export function buildPaymentsCsv(rows: PaymentExportRow[]): string {
  const lines = [PAYMENTS_CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        csvField(row.paidAt),
        csvField(row.createdAt),
        csvField(row.ptEmail),
        csvField(row.ptId),
        csvField(row.plan),
        csvField(row.period),
        csvField(row.amountMinor),
        csvField(row.currency),
        csvField(row.status),
        csvField(row.pokOrderId),
        csvField(row.previousExpiresAt),
        csvField(row.newExpiresAt),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}
