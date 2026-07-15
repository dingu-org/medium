/**
 * Tolerant zod schemas for the POK SDK API (Phase 16 C5). POK's public contract
 * is under-documented (see docs.pokpay.io/llms-full.txt): fields beyond the ones
 * we consume appear and disappear between environments, so every object schema is
 * `.passthrough()` — an unknown key must never make a real order fail to parse.
 * We validate only the handful of fields the payments boundary actually reads.
 *
 * Nothing outside lib/billing/ may import this module — payments.ts is the only
 * boundary (scripts/smoke-pok.ts is the one sanctioned dev-tool exception).
 */
import { z } from 'zod';

// POST /auth/sdk/login → { data: { accessToken, expiresIn, tokenType? } }.
// `expiresIn` is documented in seconds; the client is tolerant of s/ms anyway.
// POK staging returns it as a STRING ("3600"), so coerce — the client does
// numeric comparisons on it.
export const loginResponseSchema = z
  .object({
    data: z
      .object({
        accessToken: z.string().min(1),
        expiresIn: z.coerce.number(),
        tokenType: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// POST /merchants/{merchantId}/sdk-orders → { data: { sdkOrder: { id, ... } } }.
// (Spike-confirmed: the order id is nested under data.sdkOrder, not data.)
// `_self.confirmUrl` is POK's hosted payment page — where we send the customer.
export const createOrderResponseSchema = z
  .object({
    data: z
      .object({
        sdkOrder: z
          .object({
            id: z.string().min(1),
            _self: z
              .object({ confirmUrl: z.string().optional() })
              .passthrough()
              .optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

// A single order as returned under data.sdkOrder (create + GET share the shape).
// POK has NO string `status` field — it exposes BOOLEAN flags. payments.ts reads
// isCaptured (money taken) as paid, isCanceled/isRefunded as failed, and treats
// anything else as pending — never crediting on an ambiguous state.
export const orderSchema = z
  .object({
    id: z.string().min(1),
    isCaptured: z.boolean().optional(),
    isCompleted: z.boolean().optional(),
    isCanceled: z.boolean().optional(),
    isRefunded: z.boolean().optional(),
    canBeCaptured: z.boolean().optional(),
    // POK stringifies numbers; coerce. Used only for the ledger snapshot.
    amount: z.coerce.number().optional(),
    currencyCode: z.string().optional(),
  })
  .passthrough();

export const getOrderResponseSchema = z
  .object({
    data: z.object({ sdkOrder: orderSchema }).passthrough(),
  })
  .passthrough();

export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type PokOrder = z.infer<typeof orderSchema>;
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;
