import { and, eq } from 'drizzle-orm';
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
    await db
      .update(pwaMutations)
      .set({ updatedAt: new Date(), result: null, error: null })
      .where(
        and(
          eq(pwaMutations.ptId, input.ptId),
          eq(pwaMutations.clientMutationId, input.clientMutationId),
          eq(pwaMutations.status, 'processing'),
        ),
      );
    return { kind: 'new', id: existing.id };
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

function isStaleProcessing(existing: StoredMutation | undefined): existing is StoredMutation {
  return (
    existing?.status === 'processing' &&
    Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS
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
