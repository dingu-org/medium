import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfMonth,
  endOfDay,
  endOfWeek,
  format,
  startOfDay,
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
  messageTemplates,
  patients,
  pts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { getConversationUsage } from '@/lib/billing/usage';
import { resolveEffectivePlan } from '@/lib/billing/entitlements';
import { getPlan, type PlanId } from '@/lib/billing/plans';
import { privacyName } from '@/lib/format/name';
import { REMINDER_TEMPLATE_PRIORITY } from '@/lib/inngest/functions/bootstrap-wa-connection';
import { formatMonthYear, formatWeekdayShort } from '@/lib/i18n';
import { getServices, type ServiceRecord } from '@/lib/services/queries';
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
  status:
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'completed'
    | 'no_show'
    | 'rescheduled';
  notes: string | null;
  reminder: {
    status: string;
    responseType: string | null;
    skippedReason?: string | null;
  } | null;
  dayKey: string;
  startLabel: string;
};

export type CalendarSnapshot = {
  ptId: string;
  timezone: string;
  view: 'day' | 'week' | 'month';
  anchorKey: string;
  todayKey: string;
  monthLabel: string;
  weekDays: WeekDaySnapshot[];
  appointments: CalendarAppointmentSnapshot[];
  activeServices: ServiceRecord[];
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
  patientPhone: string;
  initialMessages: ChatMessageSnapshot[];
  aiActive: boolean;
  windowOpen: boolean;
  closed: boolean;
  escalationState: string;
  aiPausedUntil: string | null;
  aiPauseReason: string | null;
  connectionStatus: string | null;
  upcomingAppointment: { startsAt: string; serviceType: string | null } | null;
  /** Monthly conversation cap state (Phase 16 C2) — drives the chat banner. */
  conversationCap: { atCap: boolean; used: number; limit: number };
};

export type SettingsSnapshot = {
  practiceName: string;
  fullName: string;
  title: string;
  address: string;
  timezone: string;
  aiName: string;
  aiGreeting: string;
  aiEscalationKeyword: string;
  assistantPaused: boolean;
  retentionDays: number;
  notificationPrefs: NotificationPrefs;
  // Grace-aware effective plan + derived entitlement flags (Phase 16 C6). Drive
  // the billing hub row + the upgrade-gate locks on assistant/account screens.
  plan: PlanId;
  planLifetime: boolean;
  maxActiveServices: number | null;
  customAssistantIdentity: boolean;
  retentionMaxDays: number;
  whatsappStatus: string | null;
  whatsappPhoneNumberId: string | null;
  whatsappDisplayPhoneNumber: string | null;
  whatsappTemplateStatus: 'approved' | 'pending' | 'rejected' | null;
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
  closed_at: string | null;
  unread_count: number;
  ai_paused_until: string | null;
  ai_pause_reason: string | null;
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

  const view: 'day' | 'week' | 'month' =
    input.view === 'month' || input.view === 'day' ? input.view : 'week';
  const todayKey = format(new TZDate(new Date(), timezone), 'yyyy-MM-dd');
  const anchorKey =
    input.date && DATE_RE.test(input.date) ? input.date : todayKey;
  const [ay, am, ad] = anchorKey.split('-').map(Number);
  const anchor = new TZDate(ay, am - 1, ad, timezone);

  const gridStart =
    view === 'day'
      ? startOfDay(anchor)
      : view === 'week'
        ? startOfWeek(anchor, { weekStartsOn: 1 })
        : startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd =
    view === 'day'
      ? endOfDay(anchor)
      : view === 'week'
        ? endOfWeek(anchor, { weekStartsOn: 1 })
        : endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });

  const [rows, activeServices] = await Promise.all([
    db
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
        reminderSkippedReason: reminderJobs.skippedReason,
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
        ),
      )
      .orderBy(asc(appointments.startsAt)),
    getServices(ptId, { activeOnly: true }),
  ]);

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
        ? {
            status: r.reminderStatus,
            responseType: r.reminderResponse,
            skippedReason: r.reminderSkippedReason,
          }
        : null,
      dayKey: format(tzStart, 'yyyy-MM-dd'),
      startLabel: format(tzStart, 'HH:mm'),
    };
  });

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekDays: WeekDaySnapshot[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, 'yyyy-MM-dd');
    return {
      key,
      label: `${formatWeekdayShort(d)} ${format(d, 'd')}`,
      isToday: key === todayKey,
    };
  });

  return {
    ptId,
    timezone,
    view,
    anchorKey,
    todayKey,
    monthLabel: formatMonthYear(anchor),
    weekDays,
    appointments: items,
    activeServices,
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
      closedAt: conversations.closedAt,
      escalationState: conversations.escalationState,
      aiPausedUntil: conversations.aiPausedUntil,
      aiPauseReason: conversations.aiPauseReason,
      patientId: conversations.patientId,
      patientName: patients.name,
      patientPhone: patients.phone,
    })
    .from(conversations)
    .innerJoin(patients, eq(conversations.patientId, patients.id))
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
    )
    .limit(1);

  if (!conversation) return null;

  const [rows, connectionRows, upcomingRows, usage] = await Promise.all([
    db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(50),
    db
      .select({ status: whatsappConnections.status })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
    db
      .select({
        startsAt: appointments.startsAt,
        serviceType: appointments.serviceType,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.ptId, ptId),
          eq(appointments.patientId, conversation.patientId),
          inArray(appointments.status, ['pending', 'confirmed']),
          gte(appointments.startsAt, new Date()),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(1),
    getConversationUsage(ptId),
  ]);

  return {
    conversationId: conversation.id,
    patientName: privacyName(conversation.patientName),
    patientPhone: conversation.patientPhone,
    initialMessages: [...rows].reverse().map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      createdAt: r.createdAt.toISOString(),
    })),
    aiActive: conversation.aiActive,
    windowOpen: conversation.lastInboundAt
      ? Date.now() - conversation.lastInboundAt.getTime() <= WINDOW_MS
      : false,
    closed: Boolean(conversation.closedAt),
    escalationState: conversation.escalationState,
    aiPausedUntil: conversation.aiPausedUntil?.toISOString() ?? null,
    aiPauseReason: conversation.aiPauseReason,
    connectionStatus: connectionRows[0]?.status ?? null,
    upcomingAppointment: upcomingRows[0]
      ? {
          startsAt: upcomingRows[0].startsAt.toISOString(),
          serviceType: upcomingRows[0].serviceType,
        }
      : null,
    conversationCap: {
      atCap: usage.atCap,
      used: usage.used,
      limit: usage.limit,
    },
  };
}

export async function getChatListSnapshot(
  ptId: string,
  input: { status?: 'active' | 'closed'; query?: string } = {},
): Promise<ChatListRowSnapshot[]> {
  const closed = input.status === 'closed';
  const query = input.query?.trim();
  return db.execute<ChatListRowSnapshot>(sql`
    SELECT
      c.id,
      c.ai_active,
      c.escalation_state,
      p.name AS patient_name,
      m.content AS last_content,
      m.role AS last_role,
      m.created_at AS last_at,
      c.closed_at,
      c.ai_paused_until,
      c.ai_pause_reason,
      (
        SELECT count(*)::integer
        FROM messages unread
        WHERE unread.conversation_id = c.id
          AND unread.role = 'patient'
          AND unread.created_at > COALESCE(c.last_read_at, '-infinity'::timestamptz)
      ) AS unread_count
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
      AND ${closed ? sql`c.closed_at IS NOT NULL` : sql`c.closed_at IS NULL`}
      ${
        query
          ? sql`AND (
              p.name ILIKE ${`%${query}%`}
              OR p.phone ILIKE ${`%${query}%`}
              OR EXISTS (
                SELECT 1 FROM messages searched
                WHERE searched.conversation_id = c.id
                  AND searched.content ILIKE ${`%${query}%`}
              )
            )`
          : sql``
      }
    ORDER BY
      CASE WHEN c.escalation_state <> 'idle' OR c.ai_active = false THEN 0 ELSE 1 END,
      COALESCE(c.last_inbound_at, c.created_at) DESC
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
  const [[pt], [connection], templateRows] = await Promise.all([
    db
      .select({
        practiceName: pts.practiceName,
        fullName: pts.fullName,
        title: pts.title,
        address: pts.address,
        timezone: pts.timezone,
        aiName: pts.aiName,
        aiGreeting: pts.aiGreeting,
        aiEscalationKeyword: pts.aiEscalationKeyword,
        assistantPaused: pts.assistantPaused,
        retentionDays: pts.retentionDays,
        notificationPrefs: pts.notificationPrefs,
        plan: pts.plan,
        planLifetime: pts.planLifetime,
        planExpiresAt: pts.planExpiresAt,
      })
      .from(pts)
      .where(eq(pts.id, ptId))
      .limit(1),
    db
      .select({
        status: whatsappConnections.status,
        phoneNumberId: whatsappConnections.phoneNumberId,
        displayPhoneNumber: whatsappConnections.displayPhoneNumber,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.ptId, ptId))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1),
    db
      .select({ status: messageTemplates.status })
      .from(messageTemplates)
      .where(
        and(
          eq(messageTemplates.ptId, ptId),
          inArray(
            messageTemplates.name,
            REMINDER_TEMPLATE_PRIORITY.map((tpl) => tpl.name),
          ),
        ),
      ),
  ]);

  // Best-of across the reminder-template variants: reminders send if any
  // priority template is approved, so the screen reports the best status.
  const templateStatuses = templateRows.map((r) => r.status);
  const whatsappTemplateStatus: 'approved' | 'pending' | 'rejected' | null =
    templateStatuses.includes('approved')
      ? 'approved'
      : templateStatuses.includes('pending')
        ? 'pending'
        : templateStatuses.includes('rejected')
          ? 'rejected'
          : null;

  const effectivePlan: PlanId = pt
    ? resolveEffectivePlan(
        {
          plan: pt.plan,
          planLifetime: pt.planLifetime,
          planExpiresAt: pt.planExpiresAt,
        },
        new Date(),
      )
    : 'free';
  const planConfig = getPlan(effectivePlan);

  return {
    practiceName: pt?.practiceName ?? '',
    fullName: pt?.fullName ?? '',
    title: pt?.title ?? '',
    address: pt?.address ?? '',
    timezone: pt?.timezone ?? 'Europe/Berlin',
    aiName: pt?.aiName ?? '',
    aiGreeting: pt?.aiGreeting ?? '',
    aiEscalationKeyword: pt?.aiEscalationKeyword ?? '',
    assistantPaused: pt?.assistantPaused ?? false,
    retentionDays: pt?.retentionDays ?? 90,
    notificationPrefs: resolveNotificationPrefs(pt?.notificationPrefs),
    plan: effectivePlan,
    planLifetime: pt?.planLifetime ?? false,
    maxActiveServices: planConfig.maxActiveServices,
    customAssistantIdentity: planConfig.customAssistantIdentity,
    retentionMaxDays: planConfig.retentionMaxDays,
    whatsappStatus: connection?.status ?? null,
    whatsappPhoneNumberId: connection?.phoneNumberId ?? null,
    whatsappDisplayPhoneNumber: connection?.displayPhoneNumber ?? null,
    whatsappTemplateStatus,
    metaAppIdConfigured: Boolean(process.env.NEXT_PUBLIC_META_APP_ID),
    metaConfigIdConfigured: Boolean(process.env.NEXT_PUBLIC_META_CONFIG_ID),
    graphVersion: GRAPH_VERSION,
  };
}
