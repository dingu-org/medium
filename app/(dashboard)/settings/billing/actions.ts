'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { instrumentedAction } from '@/lib/actions/instrument';
import {
  applyOrderOutcome,
  createCheckout,
  type ApplyOrderResult,
  type BillingPeriod,
} from '@/lib/billing/payments';
import { createServerClient } from '@/lib/supabase/server';

async function requirePtId(): Promise<string> {
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
 * its id for the (gated) checkout form. The live charge path is deferred to the
 * POK spike — see checkout-form.tsx — but the flow + this action are fully built
 * and tested against the mocked POK client.
 */
async function createCheckoutActionImpl(
  period: BillingPeriod,
): Promise<{ pokOrderId: string }> {
  const value = periodSchema.parse(period);
  const ptId = await requirePtId();
  const { pokOrderId } = await createCheckout(ptId, value);
  return { pokOrderId };
}

export const createCheckoutAction = instrumentedAction(
  'billing.createCheckoutAction',
  createCheckoutActionImpl,
);

/**
 * Settle a checkout after the client reports success. Server truth: this always
 * re-fetches the authoritative order from POK (applyOrderOutcome) — the client
 * callback is only a hint. Idempotent: a double confirm returns already_applied
 * and the plan is extended exactly once. Only an 'applied' result should be
 * celebrated; 'pending' must render gracefully (never claim success).
 */
async function confirmCheckoutActionImpl(
  pokOrderId: string,
): Promise<ApplyOrderResult> {
  const id = z.string().min(1).parse(pokOrderId);
  await requirePtId();
  const result = await applyOrderOutcome(id);
  if (result === 'applied') revalidatePath('/settings/billing');
  return result;
}

export const confirmCheckoutAction = instrumentedAction(
  'billing.confirmCheckoutAction',
  confirmCheckoutActionImpl,
);
