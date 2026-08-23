import { and, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  billingOrders,
  blockedPeriods,
  conversationDays,
  conversations,
  costDaily,
  events,
  messageTemplates,
  messages,
  customers,
  accounts,
  pushSubscriptions,
  pwaMutations,
  reminderJobs,
  services,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  contactMatchesCustomer,
  customerWhatsappContactsFilter,
} from '@/lib/customers/whatsapp-contacts';

export type CustomerExport = {
  customer: Record<string, unknown>;
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
  reminder_jobs: Record<string, unknown>[];
  conversation_days: Record<string, unknown>[];
  whatsapp_contacts: Record<string, unknown>[];
  audit_log_entries_for_customer: Record<string, unknown>[];
};

export type AccountExport = {
  account: Record<string, unknown>;
  customers: Record<string, unknown>[];
  conversations: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  appointments: Record<string, unknown>[];
  services: Record<string, unknown>[];
  availability_rules: Record<string, unknown>[];
  blocked_periods: Record<string, unknown>[];
  whatsapp_connection: Record<string, unknown> | null;
  whatsapp_contacts: Record<string, unknown>[];
  message_templates: Record<string, unknown>[];
  reminder_jobs: Record<string, unknown>[];
  conversation_days: Record<string, unknown>[];
  wa_message_statuses: Record<string, unknown>[];
  cost_daily: Record<string, unknown>[];
  pwa_mutations: Record<string, unknown>[];
  events: Record<string, unknown>[];
  billing_orders: Record<string, unknown>[];
  push_subscriptions: Record<string, unknown>[];
  audit_log: Record<string, unknown>[];
};

/** Map top-level Date columns to ISO strings so the row is JSON-serializable. */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

export async function buildCustomerExport(input: {
  accountId: string;
  customerId: string;
}): Promise<CustomerExport | null> {
  const { accountId, customerId } = input;

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)))
    .limit(1);
  if (!customer) return null;

  const convRows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.accountId, accountId),
        eq(conversations.customerId, customerId),
      ),
    );

  const convIds = convRows.map((c) => c.id);
  const messageRows = convIds.length
    ? await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
    : [];

  const appointmentRows = await db
    .select()
    .from(appointments)
    .where(
      and(eq(appointments.accountId, accountId), eq(appointments.customerId, customerId)),
    );

  const reminderRows = appointmentRows.length
    ? await db
        .select()
        .from(reminderJobs)
        .where(
          inArray(
            reminderJobs.appointmentId,
            appointmentRows.map((a) => a.id),
          ),
        )
    : [];

  const conversationDayRows = await db
    .select()
    .from(conversationDays)
    .where(
      and(
        eq(conversationDays.accountId, accountId),
        eq(conversationDays.customerId, customerId),
      ),
    );

  // The erasure path deletes these rows as part of the same customer's right to
  // erasure (lib/customers/erase.ts), so access has to disclose them — same
  // matcher on both sides keeps the subject boundary symmetric.
  //
  // Except when the number is shared: nothing stops two customers of one PT from
  // having the same phone (family, carer), and they then resolve to ONE contact
  // row that names whoever WhatsApp says owns the number. That row is not this
  // subject's data alone, so it is withheld rather than disclosed to either of
  // them.
  const contactCandidates = await db
    .select()
    .from(whatsappContacts)
    .where(customerWhatsappContactsFilter(customer));
  const otherCustomers = contactCandidates.length
    ? await db
        .select({ phone: customers.phone, waId: customers.waId })
        .from(customers)
        .where(and(eq(customers.accountId, accountId), ne(customers.id, customerId)))
    : [];
  const contactRows = contactCandidates.filter(
    (contact) =>
      !otherCustomers.some((other) => contactMatchesCustomer(contact, other)),
  );

  // Access to a customer's data is audited against whichever row the operation
  // touched, so targetId is not always the customer id: AI conversation reads and
  // failure handoffs log the inbound message id, and AI appointment tools log the
  // appointment id (see lib/conversation/engine.ts and lib/ai/dispatcher.ts).
  // Matching only targetId = customerId would silently drop nearly every real
  // access event, so match (targetTable, targetId) across all of the customer's
  // conversation, message, and appointment ids as well.
  const messageIds = messageRows.map((m) => m.id);
  const appointmentIds = appointmentRows.map((a) => a.id);

  const targetMatchers = [
    and(eq(auditLog.targetTable, 'customers'), eq(auditLog.targetId, customerId)),
  ];
  if (convIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'conversations'),
        inArray(auditLog.targetId, convIds),
      ),
    );
  }
  if (messageIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'messages'),
        inArray(auditLog.targetId, messageIds),
      ),
    );
  }
  if (appointmentIds.length) {
    targetMatchers.push(
      and(
        eq(auditLog.targetTable, 'appointments'),
        inArray(auditLog.targetId, appointmentIds),
      ),
    );
  }

  const auditRows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.accountId, accountId), or(...targetMatchers)))
    .orderBy(auditLog.occurredAt);

  return {
    customer: serializeRow(customer),
    conversations: convRows.map(serializeRow),
    messages: messageRows.map(serializeRow),
    appointments: appointmentRows.map(serializeRow),
    reminder_jobs: reminderRows.map(serializeRow),
    conversation_days: conversationDayRows.map(serializeRow),
    whatsapp_contacts: contactRows.map(serializeRow),
    audit_log_entries_for_customer: auditRows.map(serializeRow),
  };
}

export async function buildAccountExport(accountId: string): Promise<AccountExport> {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.accountId, accountId));
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId));
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.accountId, accountId));
  const appointmentRows = await db
    .select()
    .from(appointments)
    .where(eq(appointments.accountId, accountId));
  const serviceRows = await db
    .select()
    .from(services)
    .where(eq(services.accountId, accountId));
  const availabilityRows = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId));
  const blockedRows = await db
    .select()
    .from(blockedPeriods)
    .where(eq(blockedPeriods.accountId, accountId));
  const templateRows = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.accountId, accountId));
  // Tenant-scoped tables a single customer's DSAR already discloses (plus the
  // operational ones): without them the PT's own subject access would return
  // LESS about their practice than one of their customers can ask for.
  const contactRows = await db
    .select()
    .from(whatsappContacts)
    .where(eq(whatsappContacts.accountId, accountId));
  const reminderRows = await db
    .select()
    .from(reminderJobs)
    .where(eq(reminderJobs.accountId, accountId));
  const conversationDayRows = await db
    .select()
    .from(conversationDays)
    .where(eq(conversationDays.accountId, accountId));
  const statusRows = await db
    .select()
    .from(waMessageStatuses)
    .where(eq(waMessageStatuses.accountId, accountId));
  const costRows = await db
    .select()
    .from(costDaily)
    .where(eq(costDaily.accountId, accountId));
  const mutationRows = await db
    .select()
    .from(pwaMutations)
    .where(eq(pwaMutations.accountId, accountId));
  const eventRows = await db
    .select()
    .from(events)
    .where(eq(events.accountId, accountId));
  const orderRows = await db
    .select()
    .from(billingOrders)
    .where(eq(billingOrders.accountId, accountId));
  const auditRows = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.accountId, accountId))
    .orderBy(auditLog.occurredAt);
  // endpoint + keys are the push credentials for the PT's own browser — the
  // subject already knows their devices, and the values must never leave the
  // database, so disclose only the metadata and redact both like the WA token.
  const pushRows = await db
    .select({
      id: pushSubscriptions.id,
      accountId: pushSubscriptions.accountId,
      userAgent: pushSubscriptions.userAgent,
      createdAt: pushSubscriptions.createdAt,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, accountId));

  // Explicitly omit access_token_encrypted — the bytea must never enter this
  // module; the redacted marker is attached below instead.
  const [connection] = await db
    .select({
      id: whatsappConnections.id,
      accountId: whatsappConnections.accountId,
      phoneNumberId: whatsappConnections.phoneNumberId,
      wabaId: whatsappConnections.wabaId,
      mode: whatsappConnections.mode,
      coexistenceSyncStatus: whatsappConnections.coexistenceSyncStatus,
      coexistenceSyncDeadlineAt: whatsappConnections.coexistenceSyncDeadlineAt,
      coexistenceContactsRequestId:
        whatsappConnections.coexistenceContactsRequestId,
      coexistenceHistoryRequestId:
        whatsappConnections.coexistenceHistoryRequestId,
      coexistenceLastProgress: whatsappConnections.coexistenceLastProgress,
      coexistenceLastError: whatsappConnections.coexistenceLastError,
      tier: whatsappConnections.tier,
      qualityRating: whatsappConnections.qualityRating,
      displayPhoneNumber: whatsappConnections.displayPhoneNumber,
      connectedAt: whatsappConnections.connectedAt,
      tokenExpiresAt: whatsappConnections.tokenExpiresAt,
      expiryWarningSentAt: whatsappConnections.expiryWarningSentAt,
      status: whatsappConnections.status,
      createdAt: whatsappConnections.createdAt,
    })
    .from(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId))
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  return {
    account: account ? serializeRow(account) : {},
    customers: customerRows.map(serializeRow),
    conversations: convRows.map(serializeRow),
    messages: messageRows.map(serializeRow),
    appointments: appointmentRows.map(serializeRow),
    services: serviceRows.map(serializeRow),
    availability_rules: availabilityRows.map(serializeRow),
    blocked_periods: blockedRows.map(serializeRow),
    whatsapp_connection: connection
      ? { ...serializeRow(connection), accessTokenEncrypted: 'REDACTED' }
      : null,
    whatsapp_contacts: contactRows.map(serializeRow),
    message_templates: templateRows.map(serializeRow),
    reminder_jobs: reminderRows.map(serializeRow),
    conversation_days: conversationDayRows.map(serializeRow),
    wa_message_statuses: statusRows.map(serializeRow),
    cost_daily: costRows.map(serializeRow),
    pwa_mutations: mutationRows.map(serializeRow),
    events: eventRows.map(serializeRow),
    billing_orders: orderRows.map(serializeRow),
    push_subscriptions: pushRows.map((row) => ({
      ...serializeRow(row),
      endpoint: 'REDACTED',
      keys: 'REDACTED',
    })),
    audit_log: auditRows.map(serializeRow),
  };
}
