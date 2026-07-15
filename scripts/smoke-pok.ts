/**
 * POK staging spike (Phase 16 C5). MANUAL dev tool — never part of the automated
 * test run. Run against POK STAGING only:
 *
 *   pnpm smoke:pok
 *
 * It closes the questions POK's docs leave open before we finalize payments.ts:
 *  1. login works; base URL, `expiresIn` unit, tokenType.
 *  2. createOrder — is the field `currency` or `currencyCode`? are
 *     autoCapture/webhookUrl/redirectUrl accepted or rejected?
 *  3. getOrder — response nesting + the exact fresh-order `status` string; and,
 *     THE KEY OUTPUT, the ALL minor-unit factor: create an order of 250000 and
 *     see whether the POK dashboard shows 2,500 ALL (factor 100) or 250,000 ALL
 *     (factor 1).
 *  4. a summary block to paste into the payments.ts header.
 *
 * This is the ONE sanctioned place outside lib/billing/ that imports pok/.
 * Never print the access token or key secret.
 */
import {
  createPokClient,
  PokAuthError,
  type PokClientConfig,
} from '@/lib/billing/pok/client';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function pokApiBase(): string {
  const override = process.env.POK_API_BASE;
  if (override) return override;
  const env = (process.env.POK_ENV ?? 'staging').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://api.pokpay.io'
    : 'https://api-staging.pokpay.io';
}

async function rawGetOrder(
  apiBase: string,
  token: string,
  id: string,
): Promise<unknown> {
  const res = await fetch(`${apiBase}/sdk-orders/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json().catch(() => ({ _unparseable: true, status: res.status }));
}

async function rawCreateOrder(
  apiBase: string,
  merchantId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${apiBase}/merchants/${merchantId}/sdk-orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ _unparseable: true }));
  return { status: res.status, json };
}

async function main() {
  const apiBase = pokApiBase();
  const merchantId = requireEnv('POK_MERCHANT_ID');
  const keyId = requireEnv('POK_KEY_ID');
  const keySecret = requireEnv('POK_KEY_SECRET');

  console.log('--- POK spike ---');
  console.log('apiBase =', apiBase);
  console.log('POK_ENV =', process.env.POK_ENV);

  // 1. login (with O->0 keyId fallback if a pasted key swapped letter-O for zero)
  const baseConfig: PokClientConfig = { apiBase, merchantId, keyId, keySecret };
  let client = createPokClient(baseConfig);
  let keyIdUsed = keyId;
  let loginData: Awaited<ReturnType<typeof client.login>>;
  try {
    loginData = await client.login();
    console.log('\n[1] login OK with keyId as-is');
  } catch (error) {
    if (error instanceof PokAuthError && keyId.includes('O')) {
      const variant = keyId.replace(/O/g, '0');
      console.log('\n[1] login 401 with keyId as-is; retrying with O->0 variant');
      client = createPokClient({ ...baseConfig, keyId: variant });
      loginData = await client.login();
      keyIdUsed = variant;
      console.log('[1] login OK with O->0 keyId variant');
    } else {
      throw error;
    }
  }
  console.log('    keyId variant used   :', keyIdUsed === keyId ? 'as-is' : 'O->0');
  console.log('    expiresIn (raw)      :', loginData.expiresIn);
  console.log(
    '    expiresIn unit guess :',
    loginData.expiresIn > 86_400 ? 'milliseconds' : 'seconds',
  );
  console.log('    tokenType            :', loginData.tokenType ?? '(absent)');
  const token = loginData.accessToken;

  // 2. createOrder — field name probe (currency vs currencyCode) + extra params.
  console.log('\n[2] createOrder field/param probes (amount = 100 minor)');
  const currencyProbe = await rawCreateOrder(apiBase, merchantId, token, {
    amount: 100,
    currency: 'ALL',
    description: 'C5 spike currency probe',
  });
  console.log('    {currency:"ALL"} ->', currencyProbe.status);
  console.log('      response:', JSON.stringify(currencyProbe.json));
  let currencyField: 'currency' | 'currencyCode' = 'currency';
  if (currencyProbe.status >= 400) {
    const alt = await rawCreateOrder(apiBase, merchantId, token, {
      amount: 100,
      currencyCode: 'ALL',
      description: 'C5 spike currencyCode probe',
    });
    console.log('    {currencyCode:"ALL"} ->', alt.status);
    console.log('      response:', JSON.stringify(alt.json));
    if (alt.status < 400) currencyField = 'currencyCode';
  }

  const extraProbe = await rawCreateOrder(apiBase, merchantId, token, {
    amount: 100,
    [currencyField]: 'ALL',
    autoCapture: true,
    webhookUrl: 'https://example.test/api/webhooks/pok',
    redirectUrl: 'https://example.test/settings/billing',
    description: 'C5 spike extra-param probe',
  });
  console.log(
    '    extra params {autoCapture,webhookUrl,redirectUrl} ->',
    extraProbe.status,
  );
  console.log('      response:', JSON.stringify(extraProbe.json));

  // 3. getOrder nesting + fresh status; then the minor-unit factor read-back.
  console.log('\n[3] createOrder via client + getOrder read-back');
  const created = await client.createOrder({
    amountMinor: 100,
    currency: 'ALL',
    extra: { description: 'C5 spike small order' },
  });
  console.log('    created id:', created.id);
  const order = await client.getOrder(created.id);
  // POK has no string status — boolean flags (isCaptured/isCanceled/...).
  console.log(
    '    fresh order flags:',
    JSON.stringify({
      isCaptured: order.isCaptured,
      isCanceled: order.isCanceled,
      isCompleted: order.isCompleted,
    }),
  );
  console.log('    getOrder(parsed order):', JSON.stringify(order, null, 2));
  const rawOrder = await rawGetOrder(apiBase, token, created.id);
  console.log('    getOrder(raw envelope):', JSON.stringify(rawOrder, null, 2));

  console.log('\n[3b] MINOR-UNIT FACTOR (CONFIRMED = 1, 2026-07-14)');
  const factorOrder = await client.createOrder({
    amountMinor: 250_000,
    currency: 'ALL',
    extra: { description: 'C5 spike factor probe' },
  });
  const factorRead = await client.getOrder(factorOrder.id);
  console.log('    id:', factorOrder.id);
  console.log('    amount read back:', factorRead.amount);
  console.log(
    "    POK's hosted payment page renders amount 250000 as \"250,000.00 ALL\",",
  );
  console.log(
    '    i.e. the amount is WHOLE ALL => ALL_MINOR_FACTOR = 1 (already set).',
  );

  // 4. Summary block.
  console.log('\n--- SUMMARY (paste resolved values into payments.ts) ---');
  console.log(
    JSON.stringify(
      {
        apiBase,
        expiresInUnit: loginData.expiresIn > 86_400 ? 'ms' : 'seconds',
        tokenType: loginData.tokenType ?? null,
        currencyField,
        currencyProbeStatus: currencyProbe.status,
        extraParamsStatus: extraProbe.status,
        freshOrderFlags: {
          isCaptured: order.isCaptured,
          isCanceled: order.isCanceled,
          isCompleted: order.isCompleted,
        },
        factorProbeOrderId: factorOrder.id,
        factorProbeAmountReadBack: factorRead.amount,
        NOTE:
          'Confirm ALL_MINOR_FACTOR from the dashboard display of the 250000 order.',
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
