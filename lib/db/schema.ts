import { sql } from 'drizzle-orm';
import {
  boolean,
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

const tsTz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const now = sql`now()`;
const genUuid = sql`gen_random_uuid()`;

export const connectionStatus = pgEnum('connection_status', ['pending', 'active', 'revoked']);
export const messageRole = pgEnum('message_role', ['patient', 'ai', 'pt']);
export const appointmentStatus = pgEnum('appointment_status', [
  'pending',
  'confirmed',
  'cancelled',
  'no_show',
  'completed',
  'rescheduled',
]);
export const templateStatus = pgEnum('template_status', ['pending', 'approved', 'rejected']);
export const reminderStatus = pgEnum('reminder_status', [
  'scheduled',
  'sent',
  'failed',
  'cancelled',
]);

export const pts = pgTable('pts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  practiceName: text('practice_name'),
  timezone: text('timezone').notNull().default('Europe/Berlin'),
  aiName: text('ai_name'),
  aiGreeting: text('ai_greeting'),
  aiEscalationKeyword: text('ai_escalation_keyword'),
  retentionDays: integer('retention_days').notNull().default(90),
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
    tier: text('tier'),
    qualityRating: text('quality_rating'),
    connectedAt: tsTz('connected_at'),
    status: connectionStatus('status').notNull().default('pending'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [index('whatsapp_connections_phone_number_id_idx').on(t.phoneNumberId)],
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
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('patients_pt_wa_id_uq').on(t.ptId, t.waId)],
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
    aiActive: boolean('ai_active').notNull().default(true),
    escalationState: text('escalation_state').notNull().default('idle'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    uniqueIndex('conversations_patient_channel_uq').on(t.patientId, t.channel),
    index('conversations_pt_last_inbound_idx').on(t.ptId, t.lastInboundAt.desc()),
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
    role: messageRole('role').notNull(),
    channel: text('channel').notNull(),
    content: text('content').notNull(),
    templateId: uuid('template_id'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    cachedTokens: integer('cached_tokens'),
    model: text('model'),
    provider: text('provider'),
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('messages_external_id_uq').on(t.externalId)],
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
    createdAt: tsTz('created_at').notNull().default(now),
  },
  (t) => [
    index('appointments_pt_starts_at_idx').on(t.ptId, t.startsAt),
    index('appointments_starts_at_active_idx')
      .on(t.startsAt)
      .where(sql`status IN ('pending', 'confirmed')`),
  ],
);

export const availabilityRules = pgTable('availability_rules', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  weekday: smallint('weekday').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
});

export const blockedPeriods = pgTable('blocked_periods', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  startsAt: tsTz('starts_at').notNull(),
  endsAt: tsTz('ends_at').notNull(),
  label: text('label'),
});

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

export const reminderJobs = pgTable('reminder_jobs', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  appointmentId: uuid('appointment_id')
    .notNull()
    .references(() => appointments.id, { onDelete: 'cascade' }),
  scheduledFor: tsTz('scheduled_for').notNull(),
  inngestRunId: text('inngest_run_id'),
  status: reminderStatus('status').notNull().default('scheduled'),
  createdAt: tsTz('created_at').notNull().default(now),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  endpoint: text('endpoint').notNull(),
  keys: jsonb('keys').notNull(),
  userAgent: text('user_agent'),
  createdAt: tsTz('created_at').notNull().default(now),
});

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

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().default(genUuid),
  ptId: ptIdRef(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  targetTable: text('target_table').notNull(),
  targetId: uuid('target_id'),
  occurredAt: tsTz('occurred_at').notNull().default(now),
});
