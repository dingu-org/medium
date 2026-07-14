import { createServerClient } from '@/lib/supabase/server';
import { buildPaymentsCsv, loadPaymentsForMonth } from '@/lib/metrics/payments-export';
import { isAllowedAdminEmail } from '../gate';

export const runtime = 'nodejs';

const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * Admin-only POK payments CSV export (Phase 16 C7). Same gate as the /admin
 * page: an empty/misconfigured ADMIN_EMAILS 404s the route so a bad deploy
 * never leaks cross-tenant payment data. Route handlers can't call notFound(),
 * so the gate failure returns a bare 404 Response.
 *
 * `?month=YYYY-MM` (default: current UTC month). `?all=1` dumps every order for
 * reconciliation; the default view is paid orders keyed on paid_at.
 */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedAdminEmail(user?.email, process.env.ADMIN_EMAILS)) {
    return new Response(null, { status: 404 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month');
  let month = new Date().toISOString().slice(0, 7);
  if (monthParam !== null) {
    if (!MONTH_RE.test(monthParam)) {
      return new Response('Invalid month; expected YYYY-MM', { status: 400 });
    }
    month = monthParam;
  }

  const all = url.searchParams.get('all') === '1';
  const rows = await loadPaymentsForMonth(month, { all });
  const csv = buildPaymentsCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="medium-payments-${month}.csv"`,
    },
  });
}
