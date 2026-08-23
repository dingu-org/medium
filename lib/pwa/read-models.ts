import { TZDate } from '@date-fns/tz';
import {
  addDays,
  endOfDay,
  endOfWeek,
  format,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { and, asc, desc, eq, gte, inArray, lt, lte, or } from 'drizzle-orm';
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
  waMessageStatuses,
  whatsappConnections,
} from '@/lib/db/schema';
import {
  CHAT_LIST_PAGE_SIZE,
  type ChatListPage,
  getChatListPage,
} from '@/lib/chat/queries';
import { getConversationUsage } from '@/lib/billing/usage';
import { resolveEffectivePlan } from '@/lib/billing/entitlements';
import { getPlan, type PlanId } from '@/lib/billing/plans';
import { privacyName } from '@/lib/format/name';
import { REMINDER_TEMPLATE_PRIORITY } from '@/lib/inngest/functions/bootstrap-wa-connection';
import { formatWeekdayShort } from '@/lib/i18n';
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
  view: 'day' | 'week';
  anchorKey: string;
  todayKey: string;
  weekDays: WeekDaySnapshot[];
  appointments: CalendarAppointmentSnapshot[];
  activeServices: ServiceRecord[];
};

/** Meta's monotonic delivery status for an outbound WhatsApp message. */
export type WaDeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

const WA_DELIVERY_STATUSES: readonly WaDeliveryStatus[] = [
  'sent',
  'delivered',
  'read',
  'failed',
];

function normalizeDeliveryStatus(value: string | null): WaDeliveryStatus | null {
  return value != null &&
    (WA_DELIVERY_STATUSES as readonly string[]).includes(value)
    ? (value as WaDeliveryStatus)
    : null;
}

export type ChatMessageSnapshot = {
  id: string;
  role: 'patient' | 'ai' | 'pt';
  content: string;
  createdAt: string;
  /**
   * WhatsApp delivery status for outbound (`pt` / `ai`) messages, sourced from
   * `wa_message_statuses` (the Meta `statuses` webhook, joined on the message's
   * external id). `null` for inbound patient messages or outbound messages Meta
   * has not reported on yet. Server-snapshot only — captured at load and
   * refreshed on the next fetch; there is no realtime channel for it (the status
   * table is deny-all RLS, read only via the owner connection).
   */
  deliveryStatus: WaDeliveryStatus | null;
};

/**
 * A single `messages` row joined to its optional `wa_message_statuses` row, as
 * selected by both the thread snapshot and the load-older keyset query below.
 */
type ChatMessageRow = {
  id: string;
  role: 'patient' | 'ai' | 'pt';
  content: string;
  createdAt: Date;
  deliveryStatus: string | null;
};

/**
 * Shared mapping from a `messages` (+ delivery-status) row to the serializable
 * snapshot shape. Keeps the thread snapshot and the load-older page identical in
 * how they surface `deliveryStatus` (never on inbound patient messages) and how
 * they serialize timestamps to ISO strings.
 */
function toChatMessageSnapshot(row: ChatMessageRow): ChatMessageSnapshot {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    deliveryStatus:
      row.role === 'patient'
        ? null
        : normalizeDeliveryStatus(row.deliveryStatus),
  };
}

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

  const view: 'day' | 'week' = input.view === 'day' ? 'day' : 'week';
  const todayKey = format(new TZDate(new Date(), timezone), 'yyyy-MM-dd');
  const anchorKey =
    input.date && DATE_RE.test(input.date) ? input.date : todayKey;
  const [ay, am, ad] = anchorKey.split('-').map(Number);
  const anchor = new TZDate(ay, am - 1, ad, timezone);

  const gridStart =
    view === 'day'
      ? startOfDay(anchor)
      : startOfWeek(anchor, { weekStartsOn: 1 });
  const gridEnd =
    view === 'day' ? endOfDay(anchor) : endOfWeek(anchor, { weekStartsOn: 1 });

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
        deliveryStatus: waMessageStatuses.lastStatus,
      })
      .from(messages)
      // One status row per external id (unique index), so this cannot fan out
      // the message list. Inbound messages never match an outbound status row.
      .leftJoin(
        waMessageStatuses,
        eq(waMessageStatuses.externalId, messages.externalId),
      )
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
    initialMessages: [...rows].reverse().map(toChatMessageSnapshot),
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

/**
 * One older page of a conversation's messages, for the thread's "load older"
 * affordance. Keyset-paginated on `(created_at, id)` strictly BEFORE the cursor
 * (the oldest message the client currently holds), so it never re-fetches a
 * loaded row and never skips a tie at the boundary timestamp. `pt_id` is guarded
 * alongside `conversation_id` so a caller can only page a conversation they own.
 * Served by `messages_conversation_created_at_idx`.
 *
 * Fetches `limit + 1` rows newest-first to derive `hasMore`, then trims and
 * reverses to ascending so the caller can prepend the batch as-is.
 *
 * The cursor timestamp is millisecond-precision: the snapshot reads `timestamptz`
 * back as a JS `Date` (schema `mode: 'date'`), dropping the column's microseconds.
 * Comparing that truncated value against the raw microsecond column would make the
 * `created_at = cursor` tiebreaker never match, silently dropping any message that
 * shares the cursor's millisecond. So compare at millisecond granularity via a
 * one-millisecond window: rows in an earlier millisecond are unconditionally older;
 * rows within the cursor's own millisecond are older only when their id sorts
 * before the cursor's. Both branches compare the raw `created_at` column, so
 * `messages_conversation_created_at_idx` still serves the scan.
 */
export async function getOlderChatMessages(
  ptId: string,
  conversationId: string,
  cursor: { createdAt: string; id: string },
  limit = 50,
): Promise<{ messages: ChatMessageSnapshot[]; hasMore: boolean }> {
  const lo = new Date(cursor.createdAt);
  const hi = new Date(lo.getTime() + 1);
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      deliveryStatus: waMessageStatuses.lastStatus,
    })
    .from(messages)
    .leftJoin(
      waMessageStatuses,
      eq(waMessageStatuses.externalId, messages.externalId),
    )
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.ptId, ptId),
        or(
          lt(messages.createdAt, lo),
          and(
            gte(messages.createdAt, lo),
            lt(messages.createdAt, hi),
            lt(messages.id, cursor.id),
          ),
        ),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    messages: [...page].reverse().map(toChatMessageSnapshot),
    hasMore,
  };
}

/**
 * First page of the conversation list. Kept for the SSR entry point and existing
 * callers; pagination lives in `getChatListPage` (re-exported below). Returns the
 * page-0 rows so the shape stays `ChatListRowSnapshot[]`.
 */
export async function getChatListSnapshot(
  ptId: string,
  input: { status?: 'active' | 'closed'; query?: string } = {},
): Promise<ChatListRowSnapshot[]> {
  const { rows } = await getChatListPage(ptId, input);
  return rows;
}

// Pagination lives in the chat data layer (`lib/chat/queries`); re-export here so
// the chat surfaces have a single import site alongside the other read models.
export { CHAT_LIST_PAGE_SIZE, getChatListPage, type ChatListPage };

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
