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
export const loginResponseSchema = z
  .object({
    data: z
      .object({
        accessToken: z.string().min(1),
        expiresIn: z.number(),
        tokenType: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// POST /merchants/{merchantId}/sdk-orders → { data: { id } }.
export const createOrderResponseSchema = z
  .object({
    data: z
      .object({
        id: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

// A single order as returned by GET /sdk-orders/{id} (nested under `data`).
// `status` is a bare string — the documented enum is incomplete, so payments.ts
// classifies it through an explicit allowlist and treats anything unrecognized
// as pending (never credits on an unknown status).
export const orderSchema = z
  .object({
    id: z.string().min(1),
    status: z.string(),
    amount: z.number().optional(),
    currency: z.string().optional(),
  })
  .passthrough();

export const getOrderResponseSchema = z
  .object({
    data: orderSchema,
  })
  .passthrough();

export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;
export type PokOrder = z.infer<typeof orderSchema>;
export type GetOrderResponse = z.infer<typeof getOrderResponseSchema>;
