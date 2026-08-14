import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messageTemplates,
  messages,
  patients,
  pts,
  reminderDeliveries,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { formatAppointmentTime } from '@/lib/format/appointment-time';
import { createServiceClient } from '@/lib/supabase/service';
import { getReminderUsage } from '@/lib/billing/usage';
import { getUnreadChatCount } from '@/lib/chat/queries';
import { getChatListSnapshot } from '@/lib/pwa/read-models';
import { REMINDER_TEMPLATE } from '@/lib/inngest/functions/bootstrap-wa-connection';
import { loadReminderAttempt } from '@/lib/inngest/functions/send-reminder';
import { DAY, MINUTE, freezeClockForFile } from '@/tests/support/clock';
import {
  markConversationRead,
  sendUpcomingReminderTemplate,
  setConversationClosed,
} from '../actions';

// `sendUpcomingReminderTemplate` only ever names the NEXT appointment, so every
// fixture here hangs off a frozen instant instead of a written-down date. The
// literals this replaces (2026-08-01/02) went into the past on 2026-08-01 and
// left the whole manual-reminder path red — and unverified — for twelve days.
const now = freezeClockForFile();

const authState = vi.hoisted(() => ({ userId: '' as string | null }));
const { errorSpy, redirectMock, sendTemplateMock } = vi.hoisted(() => ({
  errorSpy: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    const err = new Error(`REDIRECT:${path}`);
    (err as Error & { __isRedirect?: true }).__isRedirect = true;
    throw err;
  }),
  sendTemplateMock: vi.fn(),
}));

vi.mock('@/lib/channels/whatsapp/client', () => ({
  sendTemplate: sendTemplateMock,
  sendFreeForm: vi.fn(),
  getTemplateStatus: vi.fn(),
  submitTemplate: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  // Mirrors the real unstable_rethrow contract: rethrow redirect/notFound
  // control-flow errors, no-op (return) for anything else.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && (error as { __isRedirect?: true }).__isRedirect) {
      throw error;
    }
  },
}));
vi.mock('@/lib/log', () => ({
  logger: {
    error: errorSpy,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
  newTraceId: () => 'test-trace-id',
  serializeError: (err: unknown) => ({
    errorName: err instanceof Error ? err.name : typeof err,
    errorMessage: err instanceof Error ? err.message : String(err),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.userId ? { id: authState.userId } : null },
      }),
    },
  }),
}));

let ptId = '';
let patientId = '';
let conversationId = '';
let olderId = '';
let newerId = '';
// Comfortably behind the frozen clock AND behind Postgres' own `now()`: one
// test inserts a message on the column default, and these two have to stay
// older than it for the unread watermark assertions to mean anything.
const older = new Date(now.getTime() - 8 * DAY);
const newer = new Date(now.getTime() - 7 * DAY);
// The manual reminder targets the next upcoming appointment, so it must sit in
// the future of the frozen clock; the second one belongs to a second patient in
// the cross-conversation quota race.
const appointmentAt = new Date(now.getTime() + 2 * DAY);
const otherAppointmentAt = new Date(now.getTime() + 3 * DAY);

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    // Frozen `Date.now()` is a constant, so uniqueness has to come from
    // randomness, not from the clock.
    email: `chat-read-${randomUUID()}@example.com`,
    password: 'chat-read-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
  authState.userId = ptId;
});

beforeEach(async () => {
  // Outlives its appointment by design (ON DELETE SET NULL), so the cascade
  // below leaves it behind — it needs its own cleanup.
  await db.delete(reminderDeliveries).where(eq(reminderDeliveries.ptId, ptId));
  // Cascades conversations + messages.
  await db.delete(patients).where(eq(patients.ptId, ptId));
  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: '447700900700',
      waId: '447700900700',
    })
    .returning({ id: patients.id });
  patientId = patient.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const inserted = await db
    .insert(messages)
    .values([
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'older',
        createdAt: older,
      },
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'newer',
        createdAt: newer,
      },
    ])
    .returning({ id: messages.id, createdAt: messages.createdAt });
  olderId = inserted.find((m) => m.createdAt.getTime() === older.getTime())!.id;
  newerId = inserted.find((m) => m.createdAt.getTime() === newer.getTime())!.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('markConversationRead', () => {
  it('advances last_read_at to the through-message time (regression: Date must be serialized for the sql`` fragment)', async () => {
    const result = await markConversationRead(conversationId, newerId);
    expect(result).toEqual({ ok: true });

    const [conv] = await db
      .select({ lastReadAt: conversations.lastReadAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.lastReadAt?.getTime()).toBe(newer.getTime());
  });

  it('never moves the watermark backwards (GREATEST)', async () => {
    await markConversationRead(conversationId, newerId);
    const result = await markConversationRead(conversationId, olderId);
    expect(result).toEqual({ ok: true });

    const [conv] = await db
      .select({ lastReadAt: conversations.lastReadAt })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.lastReadAt?.getTime()).toBe(newer.getTime());
  });

  it('returns ok:false for a message outside the conversation', async () => {
    const result = await markConversationRead(conversationId, randomUUID());
    expect(result).toEqual({ ok: false });
  });

  it('clears unread when the through-message uses the DB-default now() timestamp (regression: unread-microseconds)', async () => {
    // Insert WITHOUT an explicit createdAt so the column default now() applies:
    // that value carries microsecond precision, which the old JS-Date round-trip
    // truncated to milliseconds — leaving the through-message counted as unread.
    // Every other test passes explicit ms-precision Dates, which is exactly why
    // this bug went uncaught.
    const [fresh] = await db
      .insert(messages)
      .values({
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'micros',
      })
      .returning({ id: messages.id });

    const result = await markConversationRead(conversationId, fresh.id);
    expect(result).toEqual({ ok: true });

    const rows = await getChatListSnapshot(ptId);
    expect(rows.find((r) => r.id === conversationId)?.unread_count).toBe(0);
    await expect(getUnreadChatCount(ptId)).resolves.toBe(0);
  });
});

describe('instrumentedAction wrapper (via markConversationRead)', () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it('logs action.error once and rethrows a genuine failure', async () => {
    // Not a valid UUID: the underlying query throws a real Postgres error
    // (invalid input syntax for uuid), giving instrumentedAction something
    // real to catch, log, and rethrow.
    await expect(
      markConversationRead(conversationId, 'not-a-uuid'),
    ).rejects.toThrow();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [eventName, message, attrs] = errorSpy.mock.calls[0];
    expect(eventName).toBe('action.error');
    expect(message).toBe('chat.markConversationRead');
    expect(attrs).toMatchObject({ action: 'chat.markConversationRead' });
  });

  it('passes a redirect through unchanged, without logging', async () => {
    const previous = authState.userId;
    authState.userId = null;
    try {
      await expect(
        markConversationRead(conversationId, newerId),
      ).rejects.toThrow('REDIRECT:/sign-in');
    } finally {
      authState.userId = previous;
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('setConversationClosed', () => {
  it('clears an echo pause when reopening, so the AI is really back on', async () => {
    // A closed thread can still pick up a WhatsApp-echo pause (the webhook's echo
    // branch never looks at closed_at), and a pause left behind on reopen makes
    // handle-inbound-message skip the AI turn with the UI reporting it as active.
    await db
      .update(conversations)
      .set({
        closedAt: new Date(),
        aiActive: false,
        aiPausedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
        aiPauseReason: 'whatsapp_business_app_echo',
      })
      .where(eq(conversations.id, conversationId));

    const result = await setConversationClosed(conversationId, false);
    expect(result).toEqual({ ok: true });

    const [conv] = await db
      .select({
        closedAt: conversations.closedAt,
        aiActive: conversations.aiActive,
        aiPausedUntil: conversations.aiPausedUntil,
        aiPauseReason: conversations.aiPauseReason,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.closedAt).toBeNull();
    expect(conv.aiActive).toBe(true);
    expect(conv.aiPausedUntil).toBeNull();
    expect(conv.aiPauseReason).toBeNull();
  });

  it('clears the pause when closing too', async () => {
    await db
      .update(conversations)
      .set({
        aiPausedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
        aiPauseReason: 'whatsapp_business_app_echo',
      })
      .where(eq(conversations.id, conversationId));

    await setConversationClosed(conversationId, true);

    const [conv] = await db
      .select({
        closedAt: conversations.closedAt,
        aiActive: conversations.aiActive,
        aiPausedUntil: conversations.aiPausedUntil,
        aiPauseReason: conversations.aiPauseReason,
      })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.closedAt).not.toBeNull();
    expect(conv.aiActive).toBe(false);
    expect(conv.aiPausedUntil).toBeNull();
    expect(conv.aiPauseReason).toBeNull();
  });
});

describe('sendUpcomingReminderTemplate', () => {
  let templateId = '';
  let appointmentId = '';

  beforeEach(async () => {
    errorSpy.mockClear();
    sendTemplateMock.mockReset();
    sendTemplateMock.mockResolvedValue({ messageId: 'wamid.tpl' });

    // The outer beforeEach recreated the patient + whatsapp conversation (and
    // cascade-cleared appointments/messages). Connections and templates key on
    // ptId, so clear + reseed them here for a deterministic reminder path.
    await db
      .delete(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId));
    await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));

    await db.insert(whatsappConnections).values({
      ptId,
      phoneNumberId: `PNI_${randomUUID()}`,
      wabaId: `WABA_${randomUUID()}`,
      status: 'active',
    });
    const [appointment] = await db
      .insert(appointments)
      .values({
        ptId,
        patientId,
        startsAt: appointmentAt,
        endsAt: new Date(appointmentAt.getTime() + 60 * MINUTE),
        status: 'confirmed',
      })
      .returning({ id: appointments.id });
    appointmentId = appointment.id;
    const [template] = await db
      .insert(messageTemplates)
      .values({
        ptId,
        name: REMINDER_TEMPLATE.name,
        language: REMINDER_TEMPLATE.language,
        status: 'approved',
        body: 'Kujtesë: {{1}} te {{2}} më {{3}}.',
      })
      .returning({ id: messageTemplates.id });
    templateId = template.id;
  });

  /**
   * Delivered reminders in the current month, one per throwaway appointment.
   * Seeds both writes the statuses webhook makes: the job's latest-cycle stamp
   * and the `reminder_deliveries` row the month is counted from.
   */
  async function seedDeliveredReminders(count: number): Promise<void> {
    const now = new Date();
    for (let index = 0; index < count; index++) {
      const [past] = await db
        .insert(appointments)
        .values({
          ptId,
          patientId,
          startsAt: new Date(now.getTime() - (index + 1) * DAY),
          endsAt: new Date(now.getTime() - (index + 1) * DAY + 60 * MINUTE),
          status: 'completed',
        })
        .returning({ id: appointments.id });
      await db.insert(reminderJobs).values({
        ptId,
        appointmentId: past.id,
        scheduledFor: now,
        status: 'sent',
        sentAt: now,
        deliveredAt: now,
      });
      await db.insert(reminderDeliveries).values({
        ptId,
        appointmentId: past.id,
        externalId: `wamid.seeded-${index}-${randomUUID()}`,
        deliveredAt: now,
      });
    }
  }

  it('persists the reminder and pauses the AI on a successful send', async () => {
    const result = await sendUpcomingReminderTemplate(conversationId);
    expect(result).toEqual({ ok: true });
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);

    const stored = await db
      .select({
        externalId: messages.externalId,
        templateId: messages.templateId,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    expect(stored).toHaveLength(1);
    expect(stored[0].externalId).toBe('wamid.tpl');

    const [conv] = await db
      .select({ aiActive: conversations.aiActive })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(conv.aiActive).toBe(false);
  });

  /**
   * The manual send fills the same variable slot of the same approved template
   * that send-reminder.ts fills automatically, so both paths have to name the
   * booking identically — a patient comparing the two messages is looking at one
   * appointment. This path once built its own Intl.DateTimeFormat (no year, a
   * different separator) while the job used lib/format/appointment-time, so the
   * same booking arrived as two different times depending on who sent it.
   */
  it('names the appointment with the shared formatter, as the automated job does', async () => {
    const [pt] = await db
      .select({ timezone: pts.timezone })
      .from(pts)
      .where(eq(pts.id, ptId));

    await sendUpcomingReminderTemplate(conversationId);

    const variables = sendTemplateMock.mock.calls[0][4] as string[];
    const expected = formatAppointmentTime(appointmentAt, pt.timezone);
    // Guard the guard: a formatter that returned '' would make this tautological.
    expect(expected).toMatch(/\d/);
    expect(variables.at(-1)).toBe(expected);
  });

  it('reports "sent but not saved" (not "not sent") and logs the wamid when persistence fails', async () => {
    const txSpy = vi
      .spyOn(db, 'transaction')
      .mockRejectedValueOnce(new Error('boom'));

    const result = await sendUpcomingReminderTemplate(conversationId);
    txSpy.mockRestore();

    expect(result).toEqual({
      ok: false,
      error: 'Kujtesa u dërgua, por nuk u ruajt. Rifresko bisedën.',
    });
    // The paid template must NOT be re-sent, and no reminder row was persisted.
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);
    const stored = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    expect(stored).toHaveLength(0);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [eventName, , attrs] = errorSpy.mock.calls[0];
    expect(eventName).toBe('chat.reminder_persist_failed');
    expect(attrs).toMatchObject({ externalId: 'wamid.tpl' });
  });

  it('records a sent reminder_jobs row so the send is metered and the reply correlates', async () => {
    await sendUpcomingReminderTemplate(conversationId);

    const [message] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.status).toBe('sent');
    expect(job.sentAt).not.toBeNull();
    expect(job.messageId).toBe(message.id);
    expect(job.deliveredAt).toBeNull();

    // In-flight counts against the plan cap, so the meter now sees the manual send.
    await expect(getReminderUsage(ptId)).resolves.toMatchObject({
      inFlight: 1,
      used: 1,
      limit: 10,
    });
  });

  it('refuses the manual send to a patient who opted out of reminders', async () => {
    await db
      .update(patients)
      .set({ reminderOptedOutAt: new Date() })
      .where(eq(patients.id, patientId));

    await expect(sendUpcomingReminderTemplate(conversationId)).resolves.toEqual(
      { ok: false, error: 'Klienti ka çaktivizuar kujtesat.' },
    );
    expect(sendTemplateMock).not.toHaveBeenCalled();
    const jobs = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(jobs).toHaveLength(0);
  });

  it('stamps the manual send onto a still-scheduled automated job without making the pending run stale', async () => {
    // Where the automated job would have been armed: 24h before the booking.
    const scheduledFor = new Date(appointmentAt.getTime() - DAY);
    await db.insert(reminderJobs).values({
      ptId,
      appointmentId,
      scheduledFor,
      inngestRunId: 'run-1',
      status: 'scheduled',
    });

    const result = await sendUpcomingReminderTemplate(conversationId);
    expect(result).toEqual({ ok: true });

    const jobs = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('sent');
    expect(jobs[0].messageId).not.toBeNull();
    // The pending run must stay armed and matching. Clearing it made
    // loadReminderAttempt answer `stale_run`, and that branch rewrites this row
    // to status 'skipped' when the run wakes — after which the patient's
    // KONFIRMO/ANULO matches no candidate and the badge claims nothing was sent.
    expect(jobs[0].inngestRunId).toBe('run-1');
    expect(jobs[0].scheduledFor.getTime()).toBe(scheduledFor.getTime());
    await expect(
      loadReminderAttempt({
        ptId,
        appointmentId,
        runId: 'run-1',
        scheduledFor,
      }),
    ).resolves.not.toEqual({ kind: 'skipped', reason: 'stale_run' });
  });

  it('clears the previous cycle answer on a second manual nudge', async () => {
    await sendUpcomingReminderTemplate(conversationId);
    const [first] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );

    // The patient answered the first reminder and Meta confirmed its delivery.
    const respondedAt = new Date();
    await db
      .update(reminderJobs)
      .set({
        deliveredAt: respondedAt,
        responseType: 'confirm',
        respondedAt,
        responseMessageId: newerId,
      })
      .where(eq(reminderJobs.appointmentId, appointmentId));
    await db.insert(reminderDeliveries).values({
      ptId,
      appointmentId,
      externalId: 'wamid.tpl',
      deliveredAt: respondedAt,
    });
    // Age the first template past the 60s double-tap dedupe so the second
    // nudge is a genuine second send rather than a no-op.
    await db
      .update(messages)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(messages.id, first.id));
    sendTemplateMock.mockResolvedValue({ messageId: 'wamid.tpl2' });

    const result = await sendUpcomingReminderTemplate(conversationId);
    expect(result).toEqual({ ok: true });

    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.status).toBe('sent');
    // The answer belongs to the cycle it answered: with a stale 'confirm' on the
    // row chooseCandidate filters it out, so the patient's ANULO after this
    // second reminder would cancel nothing.
    expect(job.responseType).toBeNull();
    expect(job.respondedAt).toBeNull();
    expect(job.responseMessageId).toBeNull();
    // delivered_at survives: it is a Meta-billed fact and the only source of
    // monthly usage, so clearing it would refund quota the PT already spent.
    expect(job.deliveredAt).toEqual(respondedAt);
    // And the second template Meta just charged for is outstanding on top of
    // it: the quota read resolves delivery per-wamid, so a re-armed cycle is no
    // longer invisible just because the row still carries cycle 1's stamp.
    await expect(getReminderUsage(ptId)).resolves.toMatchObject({
      delivered: 1,
      inFlight: 1,
      used: 2,
    });
  });

  it('refuses the send once the monthly reminder quota is exhausted', async () => {
    await seedDeliveredReminders(10);

    const result = await sendUpcomingReminderTemplate(conversationId);
    expect(result).toEqual({
      ok: false,
      error: 'Kufiri i kujtesave u arrit për këtë muaj.',
    });
    // No paid template, no message, no job row.
    expect(sendTemplateMock).not.toHaveBeenCalled();
    const stored = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.templateId, templateId),
        ),
      );
    expect(stored).toHaveLength(0);
    const jobs = await db
      .select({ id: reminderJobs.id })
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(jobs).toHaveLength(0);
  });

  // W4 regression: the conversation-scoped lock only serializes retries of the
  // SAME thread. With exactly one quota slot left, two manual sends fired at
  // once from two different conversations for the same pt must not both read
  // "quota available" — only one may go through.
  it('serializes quota consumption across two conversations for the same pt', async () => {
    await seedDeliveredReminders(9); // 9 of 10 used, one slot left this month.

    const [otherPatient] = await db
      .insert(patients)
      .values({
        ptId,
        name: 'Beta Patient',
        phone: '447700900800',
        waId: '447700900800',
      })
      .returning({ id: patients.id });
    const [otherConversation] = await db
      .insert(conversations)
      .values({ ptId, patientId: otherPatient.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    await db.insert(appointments).values({
      ptId,
      patientId: otherPatient.id,
      startsAt: otherAppointmentAt,
      endsAt: new Date(otherAppointmentAt.getTime() + 60 * MINUTE),
      status: 'confirmed',
    });

    const results = await Promise.all([
      sendUpcomingReminderTemplate(conversationId),
      sendUpcomingReminderTemplate(otherConversation.id),
    ]);

    const succeeded = results.filter((r) => r.ok);
    const quotaRefused = results.filter(
      (r) => !r.ok && r.error === 'Kufiri i kujtesave u arrit për këtë muaj.',
    );
    expect(succeeded).toHaveLength(1);
    expect(quotaRefused).toHaveLength(1);
    expect(sendTemplateMock).toHaveBeenCalledTimes(1);

    await expect(getReminderUsage(ptId)).resolves.toMatchObject({
      inFlight: 1,
      used: 10,
      limit: 10,
    });
  });
});
