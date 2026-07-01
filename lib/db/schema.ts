import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

const tsTz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });
const now = sql`now()`;
const genUuid = sql`gen_random_uuid()`;

export const connectionStatus = pgEnum('connection_status', [
  'pending',
  'active',
  'revoked',
]);
export const whatsappConnectionMode = pgEnum('whatsapp_connection_mode', [
  'cloud_api',
  'coexistence',
]);
export const coexistenceSyncStatus = pgEnum('coexistence_sync_status', [
  'not_applicable',
  'pending',
  'syncing',
  'complete',
  'failed',
  'history_declined',
]);
export const messageRole = pgEnum('message_role', ['patient', 'ai', 'pt']);
export const appointmentStatus = pgEnum('appointment_status', [
  'pending',
  'confirmed',
  'cancelled',
  'no_show',
  'completed',
  'rescheduled',
]);
export const cancellationActor = pgEnum('cancellation_actor', [
  'patient',
  'pt',
  'ai',
]);
export const templateStatus = pgEnum('template_status', [
  'pending',
  'approved',
  'rejected',
]);
export const reminderStatus = pgEnum('reminder_status', [
  'scheduled',
  'requeued',
  'sent',
  'skipped',
  'failed',
  'cancelled',
]);
export const reminderResponseType = pgEnum('reminder_response_type', [
  'confirm',
  'cancel',
  'reschedule_requested',
  'opt_out',
]);

export const pts = pgTable('pts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  practiceName: text('practice_name'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  aiName: text('ai_name'),
  aiGreeting: text('ai_greeting'),
  aiEscalationKeyword: text('ai_escalation_keyword'),
  servicesConfiguredAt: tsTz('services_configured_at'),
  retentionDays: integer('retention_days').notNull().default(90),
  // Web Push notification preferences (event type → enabled). Wired in Phase 9;
  // the settings UI persists the toggles now. Null = use defaults.
  notificationPrefs: jsonb('notification_prefs'),
  // Watermark for the notification bell unread count: events with
  // occurred_at > this are "unread". "Mark all read" sets it to now().
  notificationsSeenAt: tsTz('notifications_seen_at'),
  createdAt: tsTz('created_at').notNull().default(now),
});

const ptIdRef = () =>
  uuid('pt_id')
    .notNull()
    .references(() => pts.id, { onDelete: 'cascade' });

export const whatsappConnections = pgTable(
  'whatsapp_connections',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    phoneNumberId: text('phone_number_id').notNull(),
    wabaId: text('waba_id').notNull(),
    accessTokenEncrypted: bytea('access_token_encrypted'),
    mode: whatsappConnectionMode('mode').notNull().default('cloud_api'),
    coexistenceSyncStatus: coexistenceSyncStatus('coexistence_sync_status')
      .notNull()
      .default('not_applicable'),
    coexistenceSyncDeadlineAt: tsTz('coexistence_sync_deadline_at'),
    coexistenceContactsRequestId: text('coexistence_contacts_request_id'),
    coexistenceHistoryRequestId: text('coexistence_history_request_id'),
    coexistenceLastProgress: integer('coexistence_last_progress'),
    coexistenceLastError: text('coexistence_last_error'),
    tier: text('tier'),
    qualityRating: text('quality_rating'),
    connectedAt: tsTz('connected_at'),
    tokenExpiresAt: tsTz('token_expires_at'),
    expiryWarningSentAt: tsTz('expiry_warning_sent_at'),
    status: connectionStatus('status').notNull().default('pending'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  // Unique: a phone number maps to exactly one PT. Makes the webhook lookup
  // unambiguous and lets the Embedded Signup callback detect a duplicate connect.
  (t) => [
    uniqueIndex('whatsapp_connections_phone_number_id_uq').on(t.phoneNumberId),
  ],
);

export const whatsappContacts = pgTable(
  'whatsapp_contacts',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    phone: text('phone').notNull(),
    waId: text('wa_id'),
    fullName: text('full_name'),
    firstName: text('first_name'),
    sourceAction: text('source_action'),
    lastSyncedAt: tsTz('last_synced_at').notNull().default(now),
    deletedAt: tsTz('deleted_at'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('whatsapp_contacts_pt_phone_uq').on(t.ptId, t.phone),
    uniqueIndex('whatsapp_contacts_pt_wa_id_uq')
      .on(t.ptId, t.waId)
      .where(sql`${t.waId} IS NOT NULL`),
  ],
);

export const patients = pgTable(
  'patients',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    waId: text('wa_id'),
    notes: text('notes'),
    reminderOptedOutAt: tsTz('reminder_opted_out_at'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('patients_pt_wa_id_uq').on(t.ptId, t.waId)],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    name: text('name').notNull(),
    durationMin: integer('duration_min').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    check('services_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('services_duration_range', sql`${t.durationMin} BETWEEN 5 AND 480`),
    uniqueIndex('services_pt_name_uq').on(t.ptId, sql`lower(btrim(${t.name}))`),
    index('services_pt_active_idx').on(t.ptId, t.active, t.createdAt),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    lastInboundAt: tsTz('last_inbound_at'),
    lastReadAt: tsTz('last_read_at'),
    closedAt: tsTz('closed_at'),
    aiActive: boolean('ai_active').notNull().default(true),
    aiPausedUntil: tsTz('ai_paused_until'),
    aiPauseReason: text('ai_pause_reason'),
    escalationState: text('escalation_state').notNull().default('idle'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('conversations_patient_channel_uq').on(t.patientId, t.channel),
    index('conversations_pt_last_inbound_idx').on(
      t.ptId,
      t.lastInboundAt.desc(),
    ),
    index('conversations_pt_closed_last_inbound_idx').on(
      t.ptId,
      t.closedAt,
      t.lastInboundAt.desc(),
    ),
    index('conversations_ai_pause_idx')
      .on(t.ptId, t.aiPausedUntil)
      .where(sql`${t.aiPausedUntil} IS NOT NULL`),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    sourceEventId: uuid('source_event_id'),
    replyToMessageId: uuid('reply_to_message_id').references(
      (): AnyPgColumn => messages.id,
      {
        onDelete: 'set null',
      },
    ),
    role: messageRole('role').notNull(),
    channel: text('channel').notNull(),
    content: text('content').notNull(),
    templateId: uuid('template_id'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    cachedTokens: integer('cached_tokens'),
    model: text('model'),
    provider: text('provider'),
    aiCostMicrousd: integer('ai_cost_microusd'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('messages_external_id_uq').on(t.externalId),
    uniqueIndex('messages_ai_reply_to_uq')
      .on(t.replyToMessageId)
      .where(sql`role = 'ai' AND reply_to_message_id IS NOT NULL`),
    uniqueIndex('messages_source_event_id_uq')
      .on(t.sourceEventId)
      .where(sql`source_event_id IS NOT NULL`),
  ],
);

export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    patientId: uuid('patient_id')
      .notNull()
      .references(() => patients.id, { onDelete: 'cascade' }),
    startsAt: tsTz('starts_at').notNull(),
    endsAt: tsTz('ends_at').notNull(),
    serviceType: text('service_type'),
    status: appointmentStatus('status').notNull().default('pending'),
    notes: text('notes'),
    cancelledBy: cancellationActor('cancelled_by'),
    cancellationReason: text('cancellation_reason'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    check('appointments_valid_range', sql`${t.endsAt} > ${t.startsAt}`),
    index('appointments_pt_starts_at_idx').on(t.ptId, t.startsAt),
    index('appointments_starts_at_active_idx')
      .on(t.startsAt)
      .where(sql`status IN ('pending', 'confirmed')`),
    uniqueIndex('appointments_active_idempotency_uq')
      .on(t.ptId, t.patientId, t.startsAt)
      .where(sql`status IN ('pending', 'confirmed')`),
  ],
);

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    check(
      'availability_rules_valid_weekday',
      sql`${t.weekday} BETWEEN 0 AND 6`,
    ),
    check('availability_rules_valid_range', sql`${t.endTime} > ${t.startTime}`),
  ],
);

export const blockedPeriods = pgTable(
  'blocked_periods',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    startsAt: tsTz('starts_at').notNull(),
    endsAt: tsTz('ends_at').notNull(),
    label: text('label'),
  },
  (t) => [
    check('blocked_periods_valid_range', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  name: text('name').notNull(),
  language: text('language').notNull(),
  status: templateStatus('status').notNull().default('pending'),
  metaId: text('meta_id'),
  body: text('body').notNull(),
  lastStatusAt: tsTz('last_status_at'),
});

export const reminderJobs = pgTable(
  'reminder_jobs',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    scheduledFor: tsTz('scheduled_for').notNull(),
    inngestRunId: text('inngest_run_id'),
    status: reminderStatus('status').notNull().default('scheduled'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    skippedReason: text('skipped_reason'),
    sentAt: tsTz('sent_at'),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    responseType: reminderResponseType('response_type'),
    respondedAt: tsTz('responded_at'),
    responseMessageId: uuid('response_message_id').references(
      () => messages.id,
      {
        onDelete: 'set null',
      },
    ),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('reminder_jobs_appointment_id_uq').on(t.appointmentId),
    uniqueIndex('reminder_jobs_response_message_id_uq')
      .on(t.responseMessageId)
      .where(sql`response_message_id IS NOT NULL`),
  ],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').notNull(),
  userAgent: text('user_agent'),
  createdAt: tsTz('created_at').notNull().default(now),
});

export const pwaMutations = pgTable(
  'pwa_mutations',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    clientMutationId: text('client_mutation_id').notNull(),
    type: text('type').notNull(),
    status: text('status').notNull().default('processing'),
    result: jsonb('result'),
    error: text('error'),
    createdAt: tsTz('created_at').notNull().default(now),
    updatedAt: tsTz('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('pwa_mutations_pt_client_id_uq').on(t.ptId, t.clientMutationId),
    index('pwa_mutations_pt_status_idx').on(t.ptId, t.status, t.createdAt),
  ],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: tsTz('occurred_at').notNull().default(now),
  },
  (t) => [index('events_pt_occurred_at_idx').on(t.ptId, t.occurredAt.desc())],
);

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: tsTz('available_at').notNull().default(now),
    lockedAt: tsTz('locked_at'),
    publishedAt: tsTz('published_at'),
    lastError: text('last_error'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('event_outbox_event_id_uq').on(t.eventId),
    index('event_outbox_due_idx')
      .on(t.availableAt)
      .where(sql`published_at IS NULL`),
  ],
);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: uuid('target_id'),
  metadata: jsonb('metadata'),
  occurredAt: tsTz('occurred_at').notNull().default(now),
});
