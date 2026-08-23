'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createCheckout, type BillingPeriod } from '@/lib/billing/payments';
import { createServerClient } from '@/lib/supabase/server';

async function requireAccountId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

const periodSchema = z.enum(['monthly', 'yearly']);

/**
 * Start a checkout: create a one-off POK order for the chosen period and return
 * the hosted-payment-page URL. The client redirects the customer there; POK then
 * redirects back to /settings/billing?orderId=… where the order is settled
 * server-side (idempotent). The return URL comes from NEXT_PUBLIC_APP_URL so POK
 * lands the customer back on the right deployment.
 */
async function createCheckoutActionImpl(
  period: BillingPeriod,
): Promise<{ confirmUrl: string }> {
  const value = periodSchema.parse(period);
  const accountId = await requireAccountId();
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('NEXT_PUBLIC_APP_URL is required for checkout');
  const { confirmUrl } = await createCheckout(
    accountId,
    value,
    `${base}/settings/billing`,
  );
  if (!confirmUrl) throw new Error('POK did not return a checkout URL');
  return { confirmUrl };
}

export const createCheckoutAction = instrumentedAction(
  'billing.createCheckoutAction',
  createCheckoutActionImpl,
);
