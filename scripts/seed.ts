/**
 * Seed a single fixed test PT for the local dev loop (Phase 12): filled-in
 * profile, one E.164 patient, Mon–Fri 09:00–17:00 availability, one past +
 * one upcoming appointment, and one open conversation with its last 5
 * messages. Unlike `seed-qa.ts` (multi-patient design-QA fixture), this is
 * the minimal single-tenant fixture the Phase 12 spec calls for.
 *
 * Run: pnpm seed        (local stack via .env)
 * Sign in with seed@medium.local / seed-medium-1234.
 */
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  conversations,
  messages,
  patients,
  pts,
  services,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { deleteAuthUserByEmail } from './lib/delete-auth-user';
import { assertSeedTarget } from './lib/seed-target';

export const SEED_EMAIL = 'seed@medium.local';
export const SEED_PASSWORD = 'seed-medium-1234';

assertSeedTarget();

function at(daysFromToday: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minsAgo(mins: number) {
  return new Date(Date.now() - mins * 60_000);
}

/** Next date at least `minDaysAhead` from today that falls on a weekday (Mon–Fri). */
function nextWeekdayAt(minDaysAhead: number, hour: number): Date {
  const d = at(minDaysAhead, hour);
  while (d.getDay() < 1 || d.getDay() > 5) {
    d.setDate(d.getDate() + 1);
  }
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Weekday at least `minDaysAgo` in the past (for the completed appointment). */
function prevWeekdayAt(minDaysAgo: number, hour: number): Date {
  const d = at(-minDaysAgo, hour);
  while (d.getDay() < 1 || d.getDay() > 5) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Deletes the seed PT (and, via FK cascade, everything scoped to it). No-op if absent. */
export async function deleteSeedPt(
  supabase: ReturnType<typeof createServiceClient> = createServiceClient(),
): Promise<void> {
  await deleteAuthUserByEmail(SEED_EMAIL, supabase);
}

export type SeedResult = {
  ptId: string;
  patientId: string;
  conversationId: string;
  pastAppointmentId: string;
  upcomingAppointmentId: string;
};

export async function seedCore(
  deps: {
    db?: typeof db;
    supabase?: ReturnType<typeof createServiceClient>;
  } = {},
): Promise<SeedResult> {
  const supabase = deps.supabase ?? createServiceClient();
  const database = deps.db ?? db;

  // Recreate the seed user from scratch so reruns stay deterministic and
  // idempotent (createUser errors on a duplicate email otherwise).
  await deleteSeedPt(supabase);

  const { data, error } = await supabase.auth.admin.createUser({
    email: SEED_EMAIL,
    password: SEED_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  const ptId = data.user.id;

  await database
    .update(pts)
    .set({
      practiceName: 'Fizio Vita',
      timezone: 'Europe/Tirane',
      aiName: 'Medium',
      servicesConfiguredAt: new Date(),
    })
    .where(eq(pts.id, ptId));

  // A signup trigger may pre-create preset services — keep this idempotent.
  await database
    .insert(services)
    .values({ ptId, name: 'Seancë fizioterapie', durationMin: 45 })
    .onConflictDoNothing();

  await database.insert(availabilityRules).values(
    [1, 2, 3, 4, 5].map((weekday) => ({
      ptId,
      weekday,
      startTime: '09:00',
      endTime: '17:00',
    })),
  );

  const [patient] = await database
    .insert(patients)
    .values({
      ptId,
      name: 'Elira Hoxha',
      phone: '+355691234567',
      waId: '355691234567',
    })
    .returning({ id: patients.id });

  // Compute each appointment's base date once, then derive `endsAt` by
  // cloning + adjusting the hour — never call nextWeekdayAt/prevWeekdayAt
  // twice with different hours, or start/end could disagree across the
  // weekday-advance edge.
  const pastStart = prevWeekdayAt(3, 10);
  const pastEnd = new Date(pastStart);
  pastEnd.setHours(pastStart.getHours() + 1);

  const upcomingStart = nextWeekdayAt(1, 15);
  const upcomingEnd = new Date(upcomingStart);
  upcomingEnd.setHours(upcomingStart.getHours() + 1);

  const [pastAppointment, upcomingAppointment] = await database
    .insert(appointments)
    .values([
      {
        ptId,
        patientId: patient.id,
        startsAt: pastStart,
        endsAt: pastEnd,
        serviceType: 'Seancë fizioterapie',
        status: 'completed',
      },
      {
        ptId,
        patientId: patient.id,
        startsAt: upcomingStart,
        endsAt: upcomingEnd,
        serviceType: 'Seancë fizioterapie',
        status: 'confirmed',
      },
    ])
    .returning({ id: appointments.id });

  const [conversation] = await database
    .insert(conversations)
    .values({
      ptId,
      patientId: patient.id,
      channel: 'whatsapp',
      aiActive: true,
      escalationState: 'idle',
      lastInboundAt: minsAgo(15),
      lastReadAt: minsAgo(0),
      closedAt: null,
    })
    .returning({ id: conversations.id });

  const scriptedMessages: Array<{
    role: 'patient' | 'ai';
    content: string;
    minsAgo: number;
  }> = [
    {
      role: 'patient',
      content: 'Përshëndetje, dua të lë një takim këtë javë.',
      minsAgo: 22,
    },
    {
      role: 'ai',
      content:
        'Përshëndetje. Sigurisht — për cilën ditë ju përshtatet më mirë?',
      minsAgo: 21,
    },
    { role: 'patient', content: 'Të enjten pasdite po munda.', minsAgo: 19 },
    {
      role: 'ai',
      content: 'Kam të lirë të enjten në 15:00 ose 16:00. Cila ju shkon?',
      minsAgo: 18,
    },
    {
      role: 'patient',
      content: '15:00 është mirë, faleminderit.',
      minsAgo: 15,
    },
  ];

  for (const m of scriptedMessages) {
    await database.insert(messages).values({
      ptId,
      conversationId: conversation.id,
      role: m.role,
      channel: 'whatsapp',
      content: m.content,
      createdAt: minsAgo(m.minsAgo),
    });
  }

  return {
    ptId,
    patientId: patient.id,
    conversationId: conversation.id,
    pastAppointmentId: pastAppointment.id,
    upcomingAppointmentId: upcomingAppointment.id,
  };
}

async function main(): Promise<void> {
  const result = await seedCore();
  console.log(`Seeded test PT ${SEED_EMAIL} (${result.ptId})`);
  console.log(`Sign in with ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
