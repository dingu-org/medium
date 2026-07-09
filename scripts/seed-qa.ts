/**
 * Seed a local QA practitioner with fixture data mirroring the medium4 design
 * canvases (chat handling states, send states, today/calendar, clients), so
 * signed-in visual QA can compare app screens against the artboards.
 *
 * Run: pnpm seed:qa   (tsx --env-file=.env.test — LOCAL Supabase only)
 * Sign in with qa@medium.local / qa-medium-1234.
 */
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
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

const EMAIL = 'qa@medium.local';
const PASSWORD = 'qa-medium-1234';

const dbUrl = process.env.DATABASE_URL ?? '';
if (!dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost')) {
  throw new Error(`Refusing to seed non-local DATABASE_URL: ${dbUrl}`);
}

function at(daysFromToday: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minsAgo(mins: number) {
  return new Date(Date.now() - mins * 60_000);
}

async function main() {
  const supabase = createServiceClient();

  // Recreate the QA user from scratch so reruns stay deterministic.
  const { data: list } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  const existing = list?.users.find((u) => u.email === EMAIL);
  if (existing) await supabase.auth.admin.deleteUser(existing.id);

  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  const ptId = data.user.id;

  await db
    .update(pts)
    .set({
      practiceName: 'Fizio Tirana',
      timezone: 'Europe/Tirane',
      aiName: 'Medium',
      servicesConfiguredAt: new Date(),
    })
    .where(eq(pts.id, ptId));

  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: 'qa-phone-number',
    wabaId: 'qa-waba',
    status: 'active',
    connectedAt: minsAgo(60 * 24 * 30),
  });

  // A signup trigger may pre-create preset services — keep this idempotent.
  await db
    .insert(services)
    .values([
      { ptId, name: 'Vlerësim i parë', durationMin: 60 },
      { ptId, name: 'Seancë vijuese', durationMin: 45 },
    ])
    .onConflictDoNothing();

  await db.insert(availabilityRules).values(
    [1, 2, 3, 4, 5].map((weekday) => ({
      ptId,
      weekday,
      startTime: '09:00',
      endTime: '18:00',
    })),
  );

  async function addPatient(name: string, phone: string, waId?: string) {
    const [p] = await db
      .insert(patients)
      .values({ ptId, name, phone, waId: waId ?? phone.replace('+', '') })
      .returning({ id: patients.id });
    return p.id;
  }

  type Msg = {
    role: 'patient' | 'ai' | 'pt';
    content: string;
    minsAgo: number;
  };

  async function addConversation(
    patientId: string,
    opts: {
      aiActive?: boolean;
      escalationState?: string;
      aiPausedUntil?: Date;
      aiPauseReason?: string;
      closedAt?: Date;
      unread?: boolean;
      msgs: Msg[];
    },
  ) {
    const lastInbound = opts.msgs
      .filter((m) => m.role === 'patient')
      .reduce((min, m) => Math.min(min, m.minsAgo), Infinity);
    const newest = opts.msgs.reduce(
      (min, m) => Math.min(min, m.minsAgo),
      Infinity,
    );
    const [c] = await db
      .insert(conversations)
      .values({
        ptId,
        patientId,
        channel: 'whatsapp',
        aiActive: opts.aiActive ?? true,
        escalationState: opts.escalationState ?? 'idle',
        aiPausedUntil: opts.aiPausedUntil,
        aiPauseReason: opts.aiPauseReason,
        closedAt: opts.closedAt,
        lastInboundAt: Number.isFinite(lastInbound)
          ? minsAgo(lastInbound)
          : undefined,
        lastReadAt: opts.unread ? minsAgo(newest + 30) : minsAgo(0),
      })
      .returning({ id: conversations.id });
    for (const m of opts.msgs) {
      await db.insert(messages).values({
        ptId,
        conversationId: c.id,
        role: m.role,
        channel: 'whatsapp',
        content: m.content,
        createdAt: minsAgo(m.minsAgo),
      });
    }
    return c.id;
  }

  // 1 · Escalated — needs you (canvas ThreadEscalated).
  const dritan = await addPatient('Dritan Sopa', '+355692000001');
  await addConversation(dritan, {
    aiActive: false,
    escalationState: 'requested',
    unread: true,
    msgs: [
      { role: 'patient', content: 'Më duhet diçka urgjente, kam dhimbje të forta.', minsAgo: 9 },
      { role: 'ai', content: "Më vjen keq që keni dhimbje. Dua t'ju lidh drejtpërdrejt me fizioterapistin — ai është njoftuar dhe do t'ju përgjigjet shpejt.", minsAgo: 8 },
      { role: 'patient', content: 'Dua të flas me dikë, jo me robot.', minsAgo: 3 },
    ],
  });

  // 2 · Manual takeover (canvas ThreadTakeover).
  const endi = await addPatient('Endi Kola', '+355692000002');
  await addConversation(endi, {
    aiActive: false,
    msgs: [
      { role: 'patient', content: 'Mirëdita, dua të ricaktoj takimin e së enjtes.', minsAgo: 26 },
      { role: 'ai', content: 'Sigurisht. Cila ditë ju shkon — e premte ose e hënë tjetër?', minsAgo: 25 },
      { role: 'pt', content: 'Endi, e premtja në 16:30 është e lirë. Të shkon?', minsAgo: 12 },
      { role: 'patient', content: 'Po, përshtatet. Faleminderit.', minsAgo: 8 },
    ],
  });

  // 3 · AI handling a booking (canvas ThreadAI).
  const anila = await addPatient('Anila Hoxha', '+355692000003');
  await addConversation(anila, {
    msgs: [
      { role: 'patient', content: 'Përshëndetje, dua një takim këtë javë.', minsAgo: 20 },
      { role: 'ai', content: 'Sigurisht. Cili shërbim ju duhet — vlerësim i parë apo seancë vijuese?', minsAgo: 19 },
      { role: 'patient', content: 'Vijuese.', minsAgo: 17 },
      { role: 'ai', content: 'Kam të lirë të mërkurën në 10:00 ose të enjten në 14:30. Cila ju shkon?', minsAgo: 16 },
      { role: 'patient', content: 'E mërkura në 10:00.', minsAgo: 13 },
      { role: 'ai', content: 'Mirë, ju kam rezervuar të mërkurën në orën 10:00. A doni një kujtesë një ditë para?', minsAgo: 12 },
    ],
  });

  // 4 · AI paused after a Business-app echo (canvas ThreadPaused).
  const genti = await addPatient('Genti Marku', '+355692000004');
  await addConversation(genti, {
    aiPausedUntil: new Date(Date.now() + 90 * 60_000),
    aiPauseReason: 'business_app_echo',
    msgs: [
      { role: 'patient', content: 'A jeni në klinikë sot?', minsAgo: 65 },
      { role: 'pt', content: 'Po Genti, jam deri në 18:00. Eja kur të duash.', minsAgo: 62 },
      { role: 'patient', content: 'Faleminderit, vij nga ora 17:00.', minsAgo: 58 },
    ],
  });

  // 5 · 24h window closed (canvas SendWindowClosed).
  const vera = await addPatient('Vera Lleshi', '+355692000005');
  await addConversation(vera, {
    aiActive: false,
    msgs: [
      { role: 'patient', content: 'Faleminderit, shihemi të premten.', minsAgo: 60 * 26 },
    ],
  });

  // 6 · Debounced rapid messages (canvas ThreadDebounce).
  const mira = await addPatient('Mira Beqiri', '+355692000006');
  await addConversation(mira, {
    unread: true,
    msgs: [
      { role: 'patient', content: 'Përshëndetje', minsAgo: 240 },
      { role: 'patient', content: 'Doja të lija një takim', minsAgo: 239 },
      { role: 'patient', content: 'A keni kohë sot?', minsAgo: 239 },
      { role: 'ai', content: 'Përshëndetje. Sot kam të lirë në 16:00 ose 17:30 — cila ju shkon?', minsAgo: 238 },
    ],
  });

  // 7/8 · Closed threads (canvas ChatListClosed).
  const liridon = await addPatient('Liridon Krasniqi', '+355692000007');
  await addConversation(liridon, {
    closedAt: minsAgo(60 * 24),
    msgs: [
      { role: 'patient', content: 'Takimi u krye. Faleminderit.', minsAgo: 60 * 25 },
    ],
  });
  const fatjona = await addPatient('Fatjona Bega', '+355692000008');
  await addConversation(fatjona, {
    closedAt: minsAgo(60 * 48),
    msgs: [
      { role: 'patient', content: 'Anuloi takimin e premtes.', minsAgo: 60 * 49 },
    ],
  });

  await db.insert(appointments).values([
    { ptId, patientId: anila, startsAt: at(0, 10), endsAt: at(0, 11), serviceType: 'Vlerësim i parë', status: 'confirmed' },
    { ptId, patientId: endi, startsAt: at(0, 14, 30), endsAt: at(0, 15, 15), serviceType: 'Seancë vijuese', status: 'pending' },
    // Tomorrow, so the window-closed composer shows the template CTA.
    { ptId, patientId: vera, startsAt: at(1, 17), endsAt: at(1, 18), serviceType: 'Seancë vijuese', status: 'confirmed' },
    { ptId, patientId: genti, startsAt: at(2, 11), endsAt: at(2, 12), serviceType: 'Vlerësim i parë', status: 'confirmed' },
    { ptId, patientId: mira, startsAt: at(3, 16), endsAt: at(3, 17), serviceType: 'Seancë vijuese', status: 'pending' },
    { ptId, patientId: liridon, startsAt: at(-2, 10), endsAt: at(-2, 11), serviceType: 'Seancë vijuese', status: 'completed' },
  ]);

  console.log(`Seeded QA practitioner ${EMAIL} (${ptId})`);
  console.log(`Sign in with ${EMAIL} / ${PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
