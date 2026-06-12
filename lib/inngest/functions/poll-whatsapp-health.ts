import { and, eq, isNull, lte } from 'drizzle-orm';
import { addDays, differenceInCalendarDays } from 'date-fns';
import { db } from '@/lib/db';
import { whatsappConnections } from '@/lib/db/schema';
import { getQualityRating } from '@/lib/channels/whatsapp/client';
import { ConnectionRevokedError } from '@/lib/channels/whatsapp/errors';
import { inngest } from '../client';

const WARNING_QUALITY = new Set(['YELLOW', 'RED']);

export async function pollConnectionQuality(args: {
  connectionId: string;
  getQualityRatingFn?: typeof getQualityRating;
}): Promise<
  | {
      kind: 'updated';
      ptId: string;
      qualityRating: string;
      tier: string | null;
      warning: boolean;
    }
  | { kind: 'skipped'; reason: string }
> {
  const [connection] = await db
    .select({
      ptId: whatsappConnections.ptId,
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

  await db
    .update(whatsappConnections)
    .set({
      qualityRating: health.qualityRating,
      tier: health.tier,
    })
    .where(eq(whatsappConnections.id, args.connectionId));

  return {
    kind: 'updated',
    ptId: connection.ptId,
    qualityRating: health.qualityRating,
    tier: health.tier,
    warning:
      connection.qualityRating !== health.qualityRating &&
      WARNING_QUALITY.has(health.qualityRating),
  };
}

export type TokenExpiryWarning = {
  ptId: string;
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
      ptId: whatsappConnections.ptId,
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
    const [claimed] = await db
      .update(whatsappConnections)
      .set({ expiryWarningSentAt: now })
      .where(
        and(
          eq(whatsappConnections.id, candidate.id),
          isNull(whatsappConnections.expiryWarningSentAt),
        ),
      )
      .returning({ id: whatsappConnections.id });
    if (!claimed) continue;

    warnings.push({
      ptId: candidate.ptId,
      connectionId: candidate.id,
      expiresAt: candidate.expiresAt.toISOString(),
      daysRemaining: Math.max(
        0,
        differenceInCalendarDays(candidate.expiresAt, now),
      ),
    });
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
      if (result.kind === 'updated' && result.warning) {
        warnings++;
        await step.sendEvent(`emit-quality-warning-${connection.id}`, {
          name: 'wa.quality_warning',
          data: {
            ptId: result.ptId,
            connectionId: connection.id,
            qualityRating: result.qualityRating,
            tier: result.tier,
          },
        });
      }
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
    const warnings = await step.run('claim-token-expiry-warnings', () =>
      claimTokenExpiryWarnings(),
    );
    for (const warning of warnings) {
      await step.sendEvent(
        `emit-token-expiry-warning-${warning.connectionId}`,
        {
          name: 'wa.connection.expiring',
          data: warning,
        },
      );
    }
    return { warnings: warnings.length };
  },
);
