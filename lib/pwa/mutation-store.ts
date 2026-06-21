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

function existingState(existing: StoredMutation | undefined): MutationStart {
  if (!existing) return { kind: 'processing' };
  if (existing.status === 'success') {
    return { kind: 'success', result: existing.result };
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
