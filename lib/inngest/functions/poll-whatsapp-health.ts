import { and, eq, isNull, lte } from 'drizzle-orm';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { getQualityRating } from '@/lib/channels/whatsapp/client';
import { ConnectionRevokedError } from '@/lib/channels/whatsapp/errors';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { inngest } from '../client';

const WARNING_QUALITY = new Set(['YELLOW', 'RED']);

export async function pollConnectionQuality(args: {
  connectionId: string;
  getQualityRatingFn?: typeof getQualityRating;
}): Promise<
  | {
      kind: 'updated';
      accountId: string;
      qualityRating: string;
      tier: string | null;
      warning: boolean;
    }
  | { kind: 'skipped'; reason: string }
> {
  const [connection] = await db
    .select({
      accountId: whatsappConnections.accountId,
      qualityRating: whatsappConnections.qualityRating,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.id, args.connectionId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .limit(1);
  if (!connection) return { kind: 'skipped', reason: 'connection_inactive' };

  let health: Awaited<ReturnType<typeof getQualityRating>>;
  try {
    health = await (args.getQualityRatingFn ?? getQualityRating)(
      args.connectionId,
    );
  } catch (error) {
    if (error instanceof ConnectionRevokedError) {
      return { kind: 'skipped', reason: 'connection_revoked' };
    }
    throw error;
  }

  const warning =
    connection.qualityRating !== health.qualityRating &&
    WARNING_QUALITY.has(health.qualityRating);

  // The rating write and the PT-facing event share one transaction: the warning
  // is derived from the transition, so once the new rating is stored the next
  // poll sees no change and the signal is gone for good.
  const eventId = await db.transaction(async (tx) => {
    await tx
      .update(whatsappConnections)
      .set({
        qualityRating: health.qualityRating,
        tier: health.tier,
      })
      .where(eq(whatsappConnections.id, args.connectionId));
    if (!warning) return null;
    return appendBackgroundEvent(tx, {
      type: 'wa.quality_warning',
      data: {
        accountId: connection.accountId,
        connectionId: args.connectionId,
        qualityRating: health.qualityRating,
        tier: health.tier,
      },
    });
  });
  if (eventId) await tryPublishOutboxEvent(eventId);

  return {
    kind: 'updated',
    accountId: connection.accountId,
    qualityRating: health.qualityRating,
    tier: health.tier,
    warning,
  };
}

export type TokenExpiryWarning = {
  accountId: string;
  connectionId: string;
  expiresAt: string;
  daysRemaining: number;
};

export async function claimTokenExpiryWarnings(
  now = new Date(),
): Promise<TokenExpiryWarning[]> {
  const candidates = await db
    .select({
      id: whatsappConnections.id,
      accountId: whatsappConnections.accountId,
      expiresAt: whatsappConnections.tokenExpiresAt,
    })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.status, 'active'),
        isNull(whatsappConnections.expiryWarningSentAt),
        lte(whatsappConnections.tokenExpiresAt, addDays(now, 7)),
      ),
    );

  const warnings: TokenExpiryWarning[] = [];
  for (const candidate of candidates) {
    if (!candidate.expiresAt) continue;
    const warning: TokenExpiryWarning = {
      accountId: candidate.accountId,
      connectionId: candidate.id,
      expiresAt: candidate.expiresAt.toISOString(),
      daysRemaining: Math.max(
        0,
        differenceInCalendarDays(candidate.expiresAt, now),
      ),
    };
    // The claim stamp is one-shot — every later run skips a connection whose
    // expiry_warning_sent_at is set — so the durable event must be appended in
    // the same transaction, otherwise a failure here swallows the only
    // pre-expiry heads-up the PT ever gets.
    const eventId = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(whatsappConnections)
        .set({ expiryWarningSentAt: now })
        .where(
          and(
            eq(whatsappConnections.id, candidate.id),
            isNull(whatsappConnections.expiryWarningSentAt),
          ),
        )
        .returning({ id: whatsappConnections.id });
      if (!claimed) return null;
      return appendBackgroundEvent(tx, {
        type: 'wa.connection.expiring',
        data: warning,
      });
    });
    if (!eventId) continue;

    await tryPublishOutboxEvent(eventId);
    warnings.push(warning);
  }
  return warnings;
}

export const pollQualityRating = inngest.createFunction(
  {
    id: 'poll-whatsapp-quality-rating',
    retries: 2,
    concurrency: 1,
  },
  { cron: '0 4 * * *' },
  async ({ step }) => {
    const connections = await step.run('load-active-connections', () =>
      db
        .select({ id: whatsappConnections.id })
        .from(whatsappConnections)
        .where(eq(whatsappConnections.status, 'active')),
    );
    let warnings = 0;
    for (const connection of connections) {
      const result = await step.run(`poll-quality-${connection.id}`, () =>
        pollConnectionQuality({ connectionId: connection.id }),
      );
      // pollConnectionQuality already appended and published the event inside
      // its own transaction; nothing left to emit here.
      if (result.kind === 'updated' && result.warning) warnings++;
    }
    return { checked: connections.length, warnings };
  },
);

export const monitorWaTokenExpiry = inngest.createFunction(
  {
    id: 'monitor-wa-token-expiry',
    retries: 2,
    concurrency: 1,
  },
  { cron: '0 5 * * *' },
  async ({ step }) => {
    // Claiming appends and publishes each warning transactionally, so the run
    // only reports how many were claimed.
    const warnings = await step.run('claim-token-expiry-warnings', () =>
      claimTokenExpiryWarnings(),
    );
    return { warnings: warnings.length };
  },
);
