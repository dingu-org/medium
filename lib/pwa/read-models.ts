import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { GRAPH_VERSION } from '@/lib/channels/whatsapp/constants';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messages,
  patients,
  pts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
} from '@/app/(dashboard)/settings/constants';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type WeekDaySnapshot = { key: string; label: string; isToday: boolean };

export type CalendarAppointmentSnapshot = {
  id: string;
  patientName: string;
  patientPhone: string;
  patientWaId: string | null;
  conversationId: string | null;
  startsAt: string;
  endsAt: string;
  serviceType: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'no_show';
  notes: string | null;
  reminder: {
    status: string;
    responseType: string | null;
  } | null;
  dayKey: string;
  startLabel: string;
};

export type CalendarSnapshot = {
  ptId: string;
  timezone: string;
  view: 'week' | 'month';
  anchorKey: string;
  todayKey: string;
  monthLabel: string;
  weekDays: WeekDaySnapshot[];
  appointments: CalendarAppointmentSnapshot[];
};

export type ChatMessageSnapshot = {
  id: string;
  role: 'patient' | 'ai' | 'pt';
  content: string;
  createdAt: string;
};

export type ChatThreadSnapshot = {
  conversationId: string;
  patientName: string;
  initialMessages: ChatMessageSnapshot[];
  aiActive: boolean;
  windowOpen: boolean;
};

export type SettingsSnapshot = {
  practiceName: string;
  timezone: string;
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
  retentionDays: number;
  notificationPrefs: NotificationPrefs;
  whatsappStatus: string | null;
  whatsappPhoneNumberId: string | null;
  metaAppIdConfigured: boolean;
  metaConfigIdConfigured: boolean;
  graphVersion: string;
};

export type ChatListRowSnapshot = {
  id: string;
  ai_active: boolean;
  escalation_state: string;
  patient_name: string;
  last_content: string | null;
  last_role: 'patient' | 'ai' | 'pt' | null;
  last_at: string | null;
};

export async function getCalendarSnapshot(
  ptId: string,
  input: { date?: string; view?: string } = {},
): Promise<CalendarSnapshot> {
  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const timezone = pt?.timezone ?? 'Europe/Berlin';

  const view: 'week' | 'month' = input.view === 'month' ? 'month' : 'week';
  const todayKey = format(new TZDate(new Date(), timezone), 'yyyy-MM-dd');
  const anchorKey =
    input.date && DATE_RE.test(input.date) ? input.date : todayKey;
  const [ay, am, ad] = anchorKey.split('-').map(Number);
  const anchor = new TZDate(ay, am - 1, ad, timezone);

  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(
    endOfMonth(addDays(anchor, 30)),
    { weekStartsOn: 1 },
  );

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      notes: appointments.notes,
      patientName: patients.name,
      patientPhone: patients.phone,
      patientWaId: patients.waId,
      conversationId: conversations.id,
      reminderStatus: reminderJobs.status,
      reminderResponse: reminderJobs.responseType,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.patientId, appointments.patientId),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.ptId, ptId),
        gte(appointments.startsAt, new Date(gridStart.getTime())),
        lte(appointments.startsAt, new Date(gridEnd.getTime())),
        inArray(appointments.status, [
          'pending',
          'confirmed',
          'completed',
          'no_show',
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const items: CalendarAppointmentSnapshot[] = rows.map((r) => {
    const tzStart = new TZDate(r.startsAt, timezone);
    return {
      id: r.id,
      patientName: privacyName(r.patientName),
      patientPhone: r.patientPhone,
      patientWaId: r.patientWaId,
      conversationId: r.conversationId,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      serviceType: r.serviceType,
      status: r.status as CalendarAppointmentSnapshot['status'],
      notes: r.notes,
      reminder: r.reminderStatus
        ? { status: r.reminderStatus, responseType: r.reminderResponse }
        : null,
      dayKey: format(tzStart, 'yyyy-MM-dd'),
      startLabel: format(tzStart, 'HH:mm'),
    };
  });

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekDays: WeekDaySnapshot[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, 'yyyy-MM-dd');
    return { key, label: format(d, 'EEE d'), isToday: key === todayKey };
  });

  return {
    ptId,
    timezone,
    view,
    anchorKey,
    todayKey,
    monthLabel: format(anchor, 'MMMM yyyy'),
    weekDays,
    appointments: items,
  };
}

export async function getChatThreadSnapshot(
  ptId: string,
  conversationId: string,
): Promise<ChatThreadSnapshot | null> {
  const [conversation] = await db
    .select({
      id: conversations.id,
      aiActive: conversations.aiActive,
      lastInboundAt: conversations.lastInboundAt,
      patientName: patients.name,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
    )
    .limit(1);

  if (!conversation) return null;

  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(50);

  return {
    conversationId: conversation.id,
    patientName: privacyName(conversation.patientName),
    initialMessages: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    aiActive: conversation.aiActive,
    windowOpen: conversation.lastInboundAt
      ? Date.now() - conversation.lastInboundAt.getTime() <= WINDOW_MS
      : false,
  };
}

export async function getChatListSnapshot(
  ptId: string,
): Promise<ChatListRowSnapshot[]> {
  return db.execute<ChatListRowSnapshot>(sql`
    SELECT
      c.id,
      c.ai_active,
      c.escalation_state,
      p.name AS patient_name,
      m.content AS last_content,
      m.role AS last_role,
      m.created_at AS last_at
    FROM conversations c
    JOIN patients p ON p.id = c.patient_id
    LEFT JOIN LATERAL (
      SELECT content, role, created_at
      FROM messages
      WHERE messages.conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) m ON true
    WHERE c.pt_id = ${ptId}
    ORDER BY COALESCE(c.last_inbound_at, c.created_at) DESC
    LIMIT 50
  `);
}

export function resolveNotificationPrefs(raw: unknown): NotificationPrefs {
  const value = (raw ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    NOTIFICATION_PREF_KEYS.map((key) => [
      key,
      value[key] === undefined ? true : value[key] === true,
    ]),
  ) as NotificationPrefs;
}

export async function getSettingsSnapshot(
  ptId: string,
): Promise<SettingsSnapshot> {
  const [[pt], [connection]] = await Promise.all([
    db
      .select({
        practiceName: pts.practiceName,
        timezone: pts.timezone,
        aiName: pts.aiName,
        aiGreeting: pts.aiGreeting,
        aiEscalationKeyword: pts.aiEscalationKeyword,
        retentionDays: pts.retentionDays,
        notificationPrefs: pts.notificationPrefs,
      })
      .from(pts)
      .where(eq(pts.id, ptId))
      .limit(1),
    db
      .select({
        status: whatsappConnections.status,
        phoneNumberId: whatsappConnections.phoneNumberId,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
  ]);

  return {
    practiceName: pt?.practiceName ?? '',
    timezone: pt?.timezone ?? 'Europe/Berlin',
    aiName: pt?.aiName ?? '',
    aiGreeting: pt?.aiGreeting ?? '',
    aiEscalationKeyword: pt?.aiEscalationKeyword ?? '',
    retentionDays: pt?.retentionDays ?? 90,
    notificationPrefs: resolveNotificationPrefs(pt?.notificationPrefs),
    whatsappStatus: connection?.status ?? null,
    whatsappPhoneNumberId: connection?.phoneNumberId ?? null,
    metaAppIdConfigured: Boolean(process.env.NEXT_PUBLIC_META_APP_ID),
    metaConfigIdConfigured: Boolean(process.env.NEXT_PUBLIC_META_CONFIG_ID),
    graphVersion: GRAPH_VERSION,
  };
}
