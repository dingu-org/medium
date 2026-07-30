import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pwaMutations } from '@/lib/db/schema';

type StoredMutation = {
  id: string;
  status: string;
  result: unknown;
  error: string | null;
  updatedAt: Date;
};

const STALE_PROCESSING_MS = 2 * 60 * 1000;
/**
 * How many times a 'processing' row may be reclaimed as abandoned. Reclaiming
 * re-runs the side-effect, so exactly one retry is allowed: a second reclaim
 * would mean two attempts already died mid-flight and re-sending a third time
 * risks a duplicate WhatsApp message (the 'sent' stamp lands only after Graph
 * returns). The count lives in `result`, which is unused while 'processing'.
 */
const MAX_RECLAIMS = 1;
const ABANDONED_ERROR = 'Ndryshimi nuk përfundoi. Kontrollo dhe provo sërish.';

export type MutationStart =
  | { kind: 'new'; id: string }
  | { kind: 'recover'; id: string; externalMessageId: string | null }
  | { kind: 'success'; result: unknown }
  | { kind: 'failed'; error: string }
  | { kind: 'processing' };

export async function beginPwaMutation(input: {
  ptId: string;
  clientMutationId: string;
  type: string;
}): Promise<MutationStart> {
  const [inserted] = await db
    .insert(pwaMutations)
    .values({
      ptId: input.ptId,
      clientMutationId: input.clientMutationId,
      type: input.type,
      status: 'processing',
    })
    .onConflictDoNothing()
    .returning({ id: pwaMutations.id });

  if (inserted) return { kind: 'new', id: inserted.id };

  const [existing] = await db
    .select({
      id: pwaMutations.id,
      status: pwaMutations.status,
      result: pwaMutations.result,
      error: pwaMutations.error,
      updatedAt: pwaMutations.updatedAt,
    })
    .from(pwaMutations)
    .where(
      and(
        eq(pwaMutations.ptId, input.ptId),
        eq(pwaMutations.clientMutationId, input.clientMutationId),
      ),
    )
    .limit(1);

  if (isStaleProcessing(existing)) {
    if (readReclaims(existing.result) >= MAX_RECLAIMS) {
      // Already retried once and died again: dead-end visibly rather than run
      // the side-effect a third time.
      await failPwaMutation({
        ptId: input.ptId,
        clientMutationId: input.clientMutationId,
        error: ABANDONED_ERROR,
      });
      return { kind: 'failed', error: ABANDONED_ERROR };
    }
    // Claim the row in ONE guarded statement: two replays of the same id can
    // overlap (two tabs, or a tab plus a Background Sync relay) and a
    // read-then-write would let both win and run the side-effect twice. The
    // staleness and reclaim-count guards are re-checked under the row lock, so
    // exactly one caller gets a row back — the loser is told 'processing'.
    const [reclaimed] = await db
      .update(pwaMutations)
      .set({
        updatedAt: new Date(),
        result: sql`jsonb_build_object('reclaims', coalesce((${pwaMutations.result}->>'reclaims')::int, 0) + 1)`,
        error: null,
      })
      .where(
        and(
          eq(pwaMutations.ptId, input.ptId),
          eq(pwaMutations.clientMutationId, input.clientMutationId),
          eq(pwaMutations.status, 'processing'),
          lt(pwaMutations.updatedAt, staleBefore()),
          sql`coalesce((${pwaMutations.result}->>'reclaims')::int, 0) < ${MAX_RECLAIMS}`,
        ),
      )
      .returning({ id: pwaMutations.id });

    if (!reclaimed) return { kind: 'processing' };
    return { kind: 'new', id: reclaimed.id };
  }

  return existingState(existing);
}

function readGraphMessageId(result: unknown): string | null {
  if (result && typeof result === 'object' && 'graphMessageId' in result) {
    const value = (result as { graphMessageId: unknown }).graphMessageId;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function readReclaims(result: unknown): number {
  if (result && typeof result === 'object' && 'reclaims' in result) {
    const value = (result as { reclaims: unknown }).reclaims;
    return typeof value === 'number' ? value : 0;
  }
  return 0;
}

function existingState(existing: StoredMutation | undefined): MutationStart {
  if (!existing) return { kind: 'processing' };
  if (existing.status === 'success') {
    return { kind: 'success', result: existing.result };
  }
  // A confirmed Graph send whose local persistence did not complete: recover by
  // finishing the DB write; the caller must NOT re-invoke the side-effect.
  if (existing.status === 'sent') {
    return {
      kind: 'recover',
      id: existing.id,
      externalMessageId: readGraphMessageId(existing.result),
    };
  }
  if (existing.status === 'failed') {
    return { kind: 'failed', error: existing.error ?? 'Mutation failed.' };
  }
  return { kind: 'processing' };
}

/** Rows touched before this instant count as abandoned. */
function staleBefore(): Date {
  return new Date(Date.now() - STALE_PROCESSING_MS);
}

function isStaleProcessing(existing: StoredMutation | undefined): existing is StoredMutation {
  return (
    existing?.status === 'processing' && existing.updatedAt < staleBefore()
  );
}

export async function completePwaMutation(input: {
  ptId: string;
  clientMutationId: string;
  result: unknown;
}): Promise<void> {
  await db
    .update(pwaMutations)
    .set({
      status: 'success',
      result: input.result,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pwaMutations.ptId, input.ptId),
        eq(pwaMutations.clientMutationId, input.clientMutationId),
      ),
    );
}

export async function failPwaMutation(input: {
  ptId: string;
  clientMutationId: string;
  error: string;
}): Promise<void> {
  await db
    .update(pwaMutations)
    .set({
      status: 'failed',
      result: null,
      error: input.error,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pwaMutations.ptId, input.ptId),
        eq(pwaMutations.clientMutationId, input.clientMutationId),
      ),
    );
}

/**
 * Record that the external side-effect (WhatsApp Graph send) succeeded, BEFORE
 * the local rows are written. Status → 'sent' so that if persistence fails or
 * the process crashes, a same-id retry recovers via begin()'s 'recover' path
 * instead of re-sending. Guarded on 'processing' so it can never downgrade a
 * row that already advanced to success/failed.
 */
export async function markPwaMutationSent(input: {
  ptId: string;
  clientMutationId: string;
  externalMessageId: string | null;
}): Promise<void> {
  await db
    .update(pwaMutations)
    .set({
      status: 'sent',
      result: { graphMessageId: input.externalMessageId },
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pwaMutations.ptId, input.ptId),
        eq(pwaMutations.clientMutationId, input.clientMutationId),
        eq(pwaMutations.status, 'processing'),
      ),
    );
}

/**
 * Delete the ledger row for a mutation whose side-effect DID NOT happen (pre-send
 * refusal / rejection). A same-id retry then starts as a clean 'new' attempt
 * rather than dead-ending on a stored 'failed'. Guarded on 'processing' so a
 * confirmed send ('sent'/'success') can never be discarded.
 */
export async function discardPwaMutation(input: {
  ptId: string;
  clientMutationId: string;
}): Promise<void> {
  await db
    .delete(pwaMutations)
    .where(
      and(
        eq(pwaMutations.ptId, input.ptId),
        eq(pwaMutations.clientMutationId, input.clientMutationId),
        eq(pwaMutations.status, 'processing'),
      ),
    );
}
