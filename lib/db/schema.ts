import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
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
export const plan = pgEnum('plan', ['free', 'solo']);
export const billingPeriod = pgEnum('billing_period', ['monthly', 'yearly']);
export const billingOrderStatus = pgEnum('billing_order_status', [
  'created',
  'paid',
  'failed',
  'expired',
]);

export const pts = pgTable('pts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  practiceName: text('practice_name'),
  // Personal + practice profile (Phase 15). Optional; feed the assistant's
  // answers (title/address) and the profile screen. Null = not set.
  fullName: text('full_name'),
  title: text('title'),
  address: text('address'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  aiName: text('ai_name'),
  aiGreeting: text('ai_greeting'),
  // Global assistant kill-switch (Phase 15). When true the dispatcher generates
  // and sends NO AI reply to inbound patient messages; PT notifications +
  // appointment reminders still run.
  assistantPaused: boolean('assistant_paused').notNull().default(false),
  servicesConfiguredAt: tsTz('services_configured_at'),
  retentionDays: integer('retention_days').notNull().default(90),
  // Billing plan state (Phase 16). No internal subscription state machine:
  // plan + expiry only, prepaid via POK one-off payments. `plan_lifetime`
  // grants Solo forever (pilot PTs). `plan_downgraded_at` starts the retention
  // clamp grace window; `plan_step_seen_at` marks the onboarding plan step.
  // Entitlement resolution lives in lib/billing/entitlements.ts.
  plan: plan('plan').notNull().default('free'),
  planExpiresAt: tsTz('plan_expires_at'),
  planLifetime: boolean('plan_lifetime').notNull().default(false),
  planDowngradedAt: tsTz('plan_downgraded_at'),
  planStepSeenAt: tsTz('plan_step_seen_at'),
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
    // Human-readable connected number, e.g. "+355 69 …" (Phase 15). Fetched from
    // Graph at connect and backfilled for existing rows in a later Phase 15
    // task; NULL until then.
    displayPhoneNumber: text('display_phone_number'),
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
    // Optional price quote in whole Albanian Lekë (Phase 15). Null = no price
    // set; the assistant only quotes a price when this is present. Wired into
    // getServices/prompt in a later Phase 15 task.
    priceLek: integer('price_lek'),
    active: boolean('active').notNull().default(true),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    check('services_name_not_blank', sql`length(btrim(${t.name})) > 0`),
    check('services_duration_range', sql`${t.durationMin} BETWEEN 5 AND 480`),
    check('services_price_positive', sql`${t.priceLek} > 0`),
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
    // When the conversation-cap hard stop sent its one static handoff message
    // (Phase 16 C2). Null = never capped this cycle; reset on renewal.
    limitHandoffAt: tsTz('limit_handoff_at'),
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
    // pt_id was previously unindexed (FKs aren't auto-indexed). This composite
    // serves the admin funnel's `min(created_at) GROUP BY pt_id` and general
    // per-tenant message lookups.
    index('messages_pt_created_at_idx').on(t.ptId, t.createdAt),
    // Serves the admin "today live cost" scan, which filters messages by a bare
    // created_at range across all tenants.
    index('messages_created_at_idx').on(t.createdAt),
    // Serves the chat-list snapshot's per-conversation lateral lookups
    // (getChatListSnapshot in lib/pwa/read-models.ts): last-message fetch,
    // unread count, and search all filter by conversation_id ordered/bounded by
    // created_at, with no prior index leading on conversation_id.
    index('messages_conversation_created_at_idx').on(
      t.conversationId,
      t.createdAt,
    ),
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
    // Serves the admin funnel's `min(created_at) GROUP BY pt_id` (first-booking
    // window) — the existing starts_at index doesn't cover created_at.
    index('appointments_pt_created_at_idx').on(t.ptId, t.createdAt),
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
    // Set only when Meta confirms delivery via the `statuses` webhook (Phase 16
    // C3). Latest-cycle convenience for the appointment badge only: a reschedule
    // re-arms this row onto a new template, so one scalar cannot represent two
    // separately-billed deliveries. The metered fact is a `reminder_deliveries`
    // row per wamid — that, not this column, is what the plan quota counts.
    deliveredAt: tsTz('delivered_at'),
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
    // Serves the appointment badge's per-cycle delivery lookup; partial so it
    // only indexes confirmed deliveries.
    index('reminder_jobs_pt_delivered_idx')
      .on(t.ptId, t.deliveredAt)
      .where(sql`delivered_at IS NOT NULL`),
  ],
);

// Reminder billing fact table: one row per Meta-confirmed template delivery,
// keyed on the wamid. This is what the monthly plan quota counts
// (lib/billing/usage.ts countDeliveredReminders). It is a table of its own
// because `reminder_jobs` is unique per appointment and its `delivered_at` is a
// single scalar: a reschedule re-arms that row onto a second, separately-billed
// template, and both cycles collapsed into one counted delivery.
// Patient-free by construction, and `appointment_id` is ON DELETE SET NULL, so
// GDPR erasure and retention purges strip the link without deleting the billed
// fact — the contract `conversation_days` got in 0025, for the same reason:
// erasing a chatty patient must never refund quota already spent with Meta.
// `external_id` is the one patient-linked field (a wamid embeds the recipient's
// number), so erasePatient rewrites it to `erased:<row id>`, which keeps the row
// unique without keeping the identifier.
export const reminderDeliveries = pgTable(
  'reminder_deliveries',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    externalId: text('external_id').notNull(),
    deliveredAt: tsTz('delivered_at').notNull(),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    // Idempotency for a redelivered `delivered` webhook: one billed template,
    // one counted row, however many times Meta reports it.
    uniqueIndex('reminder_deliveries_external_id_uq').on(t.externalId),
    index('reminder_deliveries_pt_delivered_idx').on(t.ptId, t.deliveredAt),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    endpoint: text('endpoint').notNull(),
    keys: jsonb('keys').notNull(),
    userAgent: text('user_agent'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  // One row per browser endpoint so re-subscribing upserts instead of piling up
  // duplicate rows for the same device.
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint)],
);

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
  (t) => [
    index('events_pt_occurred_at_idx').on(t.ptId, t.occurredAt.desc()),
    // Serves the admin push-delivery aggregate, which filters by type +
    // occurred_at with no pt_id (so the pt-scoped index above can't be used).
    index('events_type_occurred_at_idx').on(t.type, t.occurredAt),
  ],
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

// Per-PT per-day cost rollup (Phase 11). Populated by the `daily-cost-rollup`
// Inngest cron from persisted `messages` cost fields + an estimated Meta
// conversation cost. Idempotent upsert on (pt_id, day).
export const costDaily = pgTable(
  'cost_daily',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    day: date('day', { mode: 'string' }).notNull(),
    aiCostMicrousd: bigint('ai_cost_microusd', { mode: 'number' })
      .notNull()
      .default(0),
    aiCachedTokens: bigint('ai_cached_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    metaConversations: integer('meta_conversations').notNull().default(0),
    metaCostMicroEur: bigint('meta_cost_micro_eur', { mode: 'number' })
      .notNull()
      .default(0),
    // Meta billing truth (Phase 16). Columns added by C3; POPULATED BY C4:
    // `metaBillableMessages` = count of billable `wa_message_statuses` per
    // PT-day; `metaCostSource` flips to 'actual' when the rollup uses the
    // per-message rate card, staying 'estimated' for the placeholder path.
    metaBillableMessages: integer('meta_billable_messages')
      .notNull()
      .default(0),
    metaCostSource: text('meta_cost_source').notNull().default('estimated'),
    computedAt: tsTz('computed_at').notNull().default(now),
  },
  (t) => [uniqueIndex('cost_daily_pt_day_uq').on(t.ptId, t.day)],
);

// Meta (WhatsApp) delivery-status truth per outbound message (Phase 16 C3).
// Content-free and patient-free, so it survives message-retention purge and
// patient erasure; FK'd only to `pts`. Written exclusively by the `statuses`
// webhook via the RLS-bypassing owner connection — deny-all RLS for
// authenticated (operator data, not PT-facing; mirrors `erasure_archive`).
// `delivered_at` is the authoritative signal for the reminder plan quota;
// `pricing_*`/`billable` feed C4's actual-cost rollup.
export const waMessageStatuses = pgTable(
  'wa_message_statuses',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    // Meta wamid; joins `messages.external_id` while that row lives.
    externalId: text('external_id').notNull(),
    // Highest status reached: sent | delivered | read | failed. Monotonic —
    // never regressed by an out-of-order webhook (see handleStatusesChange).
    lastStatus: text('last_status').notNull(),
    sentAt: tsTz('sent_at'),
    deliveredAt: tsTz('delivered_at'),
    readAt: tsTz('read_at'),
    failedAt: tsTz('failed_at'),
    // Meta pricing object (category/type/model + billable flag — no amount).
    billable: boolean('billable'),
    pricingCategory: text('pricing_category'),
    pricingType: text('pricing_type'),
    pricingModel: text('pricing_model'),
    errorCode: integer('error_code'),
    createdAt: tsTz('created_at').notNull().default(now),
    updatedAt: tsTz('updated_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('wa_message_statuses_external_id_uq').on(t.externalId),
    index('wa_message_statuses_pt_delivered_idx').on(t.ptId, t.deliveredAt),
    index('wa_message_statuses_pt_created_idx').on(t.ptId, t.createdAt),
  ],
);

// Conversation metering fact table (Phase 16): one row per active patient-day
// in the PT's timezone. "Conversation" for billing = a patient-day, inserted
// idempotently on the first patient message of that local day (C2 writes it).
// `month_key` (e.g. '2026-07', PT timezone) serves the monthly usage count;
// `first_message_id` is a bare uuid breadcrumb (no FK — the message may be
// retention-erased while the billing fact must survive).
// Same reason `patient_id` / `conversation_id` are nullable ON DELETE SET NULL
// (0025): GDPR per-patient erasure and retention purges strip the personal-data
// link but must NOT delete the metered day, or the month's count (the only store
// of Free-plan usage) would drop retroactively. countConversationDays filters on
// pt_id + month_key alone and joins nothing, so anonymised rows keep counting;
// the unique index below still dedupes live patient-days (every insert supplies a
// real patient_id) and simply stops constraining erased ones.
// ACCEPTED CONSEQUENCE of that last point: NULLs are distinct, so if a PT erases
// a patient and the same person messages again on the SAME local day, the
// webhook creates a new patient row and inserts a SECOND fact for one real
// patient-day. There is no fix that keeps the erasure promise — deduping across
// the erasure would need a patient-derived key on the surviving row, and a hash
// of the number is re-derivable by this controller, so it would be
// pseudonymisation, not erasure. The error is bounded (one extra day per
// erasure, and only for a same-day re-contact) and always runs against the PT,
// never in their favour.
export const conversationDays = pgTable(
  'conversation_days',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    patientId: uuid('patient_id').references(() => patients.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    localDay: date('local_day', { mode: 'string' }).notNull(),
    monthKey: text('month_key').notNull(),
    firstMessageId: uuid('first_message_id'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('conversation_days_pt_patient_day_uq').on(
      t.ptId,
      t.patientId,
      t.localDay,
    ),
    index('conversation_days_pt_month_idx').on(t.ptId, t.monthKey),
  ],
);

// POK one-off payment ledger (Phase 16 C5). One row per checkout: a POK order id
// plus the plan/period/amount purchased and the settle outcome. This is the money
// ledger — tenants may READ their own receipts (RLS read-own, C6 /settings/billing)
// but NEVER write; all writes go through the RLS-bypassing owner connection in
// lib/billing/payments.ts. `previous/new_expires_at` snapshot the extension the
// settle applied; `pok_payload` is a PII-free order snapshot (id/status/amount).
export const billingOrders = pgTable(
  'billing_orders',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: ptIdRef(),
    pokOrderId: text('pok_order_id').notNull(),
    plan: plan('plan').notNull(),
    period: billingPeriod('period').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('ALL'),
    status: billingOrderStatus('status').notNull().default('created'),
    previousExpiresAt: tsTz('previous_expires_at'),
    newExpiresAt: tsTz('new_expires_at'),
    pokPayload: jsonb('pok_payload'),
    createdAt: tsTz('created_at').notNull().default(now),
    paidAt: tsTz('paid_at'),
  },
  (t) => [
    uniqueIndex('billing_orders_pok_order_id_uq').on(t.pokOrderId),
    index('billing_orders_pt_created_idx').on(t.ptId, t.createdAt),
    // Partial index for the reconcile cron's scan of still-open orders.
    index('billing_orders_pending_idx')
      .on(t.createdAt)
      .where(sql`status = 'created'`),
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

// Long-term compliance record of an erasure event itself — survives the PT
// deletion it describes, so pt_id is a bare uuid with no FK cascade. Written
// only by the service role (RLS is deny-all for authenticated).
export const erasureArchive = pgTable(
  'erasure_archive',
  {
    id: uuid('id').primaryKey().default(genUuid),
    ptId: uuid('pt_id').notNull(),
    scope: text('scope').notNull(),
    targetId: uuid('target_id'),
    beforeStateHash: text('before_state_hash'),
    metadata: jsonb('metadata'),
    occurredAt: tsTz('occurred_at').notNull().default(now),
  },
  (t) => [
    check(
      'erasure_archive_scope_check',
      sql`${t.scope} in ('patient','account')`,
    ),
  ],
);
