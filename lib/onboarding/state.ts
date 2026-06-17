import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  availabilityRules,
  messages,
  pts,
  whatsappConnections,
} from '@/lib/db/schema';

export type OnboardingState = {
  profile: boolean;
  whatsapp: boolean;
  availability: boolean;
  testMessage: boolean;
  completedCount: number;
  total: number;
  complete: boolean;
};

/**
 * Onboarding progress derived purely from data state — no stored flag. A step
 * is done when the corresponding rows exist.
 */
export async function getOnboardingState(
  ptId: string,
): Promise<OnboardingState> {
  const [profileRows, whatsappRows, availabilityRows, messageRows] =
    await Promise.all([
      db
        .select({ practiceName: pts.practiceName })
        .from(pts)
        .where(eq(pts.id, ptId))
        .limit(1),
      db
        .select({ id: whatsappConnections.id })
        .from(whatsappConnections)
        .where(
          and(
            eq(whatsappConnections.ptId, ptId),
            eq(whatsappConnections.status, 'active'),
          ),
        )
        .limit(1),
      db
        .select({ id: availabilityRules.id })
        .from(availabilityRules)
        .where(eq(availabilityRules.ptId, ptId))
        .limit(1),
      db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.ptId, ptId))
        .limit(1),
    ]);

  const profile = Boolean(profileRows[0]?.practiceName?.trim());
  const whatsapp = whatsappRows.length > 0;
  const availability = availabilityRows.length > 0;
  const testMessage = messageRows.length > 0;

  const steps = [profile, whatsapp, availability, testMessage];
  const completedCount = steps.filter(Boolean).length;

  return {
    profile,
    whatsapp,
    availability,
    testMessage,
    completedCount,
    total: steps.length,
    complete: completedCount === steps.length,
  };
}
