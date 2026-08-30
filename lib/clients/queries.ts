import { and, asc, count, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import type { AppointmentView } from '@/components/appointments/types';
import { DEFAULT_COUNTRY_CODE } from '@/lib/clients/phone';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  customers,
  accounts,
  reminderJobs,
} from '@/lib/db/schema';
import { remindersEnabled } from '@/lib/reminders/flag';

const DIRECTORY_LIMIT = 250;
// The directory only needs recent history for the "last visit" line, so bound
// the enrichment instead of dragging every appointment ever on each refresh.
const DIRECTORY_HISTORY_MONTHS = 12;
// `unaccent` is not installed, so fold the diacritics that actually show up in
// WhatsApp profile names with translate(). Both strings must stay aligned.
const ACCENTED_CHARS = 'ëçáàâäéèêíìîóòôöúùûüñ';
const PLAIN_CHARS = 'ecaaaaeeeiiioooouuuun';
// A length mismatch silently shifts every mapping past the extra character
// (Postgres translate() just drops the surplus), so 'ú' would fold to 'o' and a
// search for 'u' could never match it. Fail loudly at import instead.
if (ACCENTED_CHARS.length !== PLAIN_CHARS.length) {
  throw new Error('ACCENTED_CHARS and PLAIN_CHARS must stay aligned');
}

// A PT searching from a phone keyboard types 'ermira', not 'Ërmira'.
function foldAccents(value: string): string {
  return Array.from(value.toLowerCase(), (char) => {
    const index = ACCENTED_CHARS.indexOf(char);
    return index === -1 ? char : PLAIN_CHARS[index];
  }).join('');
}

// '%' and '_' typed in the search box are literals, not wildcards.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type ClientDirectoryRow = {
  id: string;
  name: string;
  phone: string;
  manual: boolean;
  conversationId: string | null;
  nextAppointment: { startsAt: string; serviceType: string | null } | null;
  lastAppointment: { startsAt: string; serviceType: string | null } | null;
};

export type ClientDirectorySnapshot = {
  accountId: string;
  timezone: string;
  query: string;
  total: number;
  truncated: boolean;
  rows: ClientDirectoryRow[];
};

export type ClientDetailSnapshot = {
  id: string;
  accountId: string;
  name: string;
  phone: string;
  waId: string | null;
  manual: boolean;
  notes: string | null;
  reminderOptedOutAt: string | null;
  createdAt: string;
  conversationId: string | null;
  aiActive: boolean | null;
  timezone: string;
  upcoming: AppointmentView[];
  history: AppointmentView[];
};

export async function getClientDirectory(
  accountId: string,
  query = '',
): Promise<ClientDirectorySnapshot> {
  const normalized = query.trim();
  const [account] = await db
    .select({ timezone: accounts.timezone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const digits = normalized.replace(/\D/g, '');
  // Stored numbers are compact E.164, so match on digits only — '069 123 4567'
  // is the same number as '+355691234567', trunk prefix included.
  const phoneCandidates = digits
    ? digits.startsWith('0')
      ? [digits, `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`]
      : [digits]
    : [];
  const filter = normalized
    ? and(
        eq(customers.accountId, accountId),
        or(
          sql`translate(lower(${customers.name}), ${ACCENTED_CHARS}, ${PLAIN_CHARS}) like ${`%${escapeLike(foldAccents(normalized))}%`}`,
          ...phoneCandidates.map(
            (candidate) =>
              sql`regexp_replace(${customers.phone}, '[^0-9]', '', 'g') like ${`%${candidate}%`}`,
          ),
        ),
      )
    : eq(customers.accountId, accountId);

  // Counted separately: `rows` is capped, so its length is not the total.
  const [totals] = await db
    .select({ value: count() })
    .from(customers)
    .where(filter);
  const customerRows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      waId: customers.waId,
      conversationId: conversations.id,
    })
    .from(customers)
    .leftJoin(
      conversations,
      and(
        eq(conversations.customerId, customers.id),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .where(filter)
    .orderBy(asc(customers.name))
    .limit(DIRECTORY_LIMIT);

  const historyFrom = new Date();
  historyFrom.setMonth(historyFrom.getMonth() - DIRECTORY_HISTORY_MONTHS);
  const ids = customerRows.map((customer) => customer.id);
  const appointmentRows = ids.length
    ? await db
        .select({
          customerId: appointments.customerId,
          startsAt: appointments.startsAt,
          serviceType: appointments.serviceType,
          status: appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.accountId, accountId),
            inArray(appointments.customerId, ids),
            gte(appointments.startsAt, historyFrom),
          ),
        )
        .orderBy(desc(appointments.startsAt))
    : [];

  const now = Date.now();
  const byCustomer = new Map<string, typeof appointmentRows>();
  for (const appointment of appointmentRows) {
    const list = byCustomer.get(appointment.customerId) ?? [];
    list.push(appointment);
    byCustomer.set(appointment.customerId, list);
  }

  const rows = customerRows.map((customer) => {
    const list = byCustomer.get(customer.id) ?? [];
    const next = list
      .filter(
        (appointment) =>
          appointment.startsAt.getTime() >= now &&
          (appointment.status === 'pending' ||
            appointment.status === 'confirmed'),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const last = list.find(
      (appointment) => appointment.startsAt.getTime() < now,
    );
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      manual: !customer.waId,
      conversationId: customer.conversationId,
      nextAppointment: next
        ? {
            startsAt: next.startsAt.toISOString(),
            serviceType: next.serviceType,
          }
        : null,
      lastAppointment: last
        ? {
            startsAt: last.startsAt.toISOString(),
            serviceType: last.serviceType,
          }
        : null,
    };
  });

  return {
    accountId,
    timezone: account?.timezone ?? 'Europe/Tirane',
    query: normalized,
    total: totals?.value ?? rows.length,
    truncated: (totals?.value ?? rows.length) > rows.length,
    rows,
  };
}

export async function getClientDetail(
  accountId: string,
  customerId: string,
): Promise<ClientDetailSnapshot | null> {
  const [customer] = await db
    .select({
      id: customers.id,
      accountId: customers.accountId,
      name: customers.name,
      phone: customers.phone,
      waId: customers.waId,
      notes: customers.notes,
      reminderOptedOutAt: customers.reminderOptedOutAt,
      createdAt: customers.createdAt,
      conversationId: conversations.id,
      aiActive: conversations.aiActive,
      timezone: accounts.timezone,
    })
    .from(customers)
    .innerJoin(accounts, eq(customers.accountId, accounts.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.customerId, customers.id),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .where(
      and(eq(customers.id, customerId), eq(customers.accountId, accountId)),
    )
    .limit(1);
  if (!customer) return null;

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      notes: appointments.notes,
      reminderStatus: reminderJobs.status,
      reminderResponse: reminderJobs.responseType,
    })
    .from(appointments)
    .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
    .where(
      and(
        eq(appointments.accountId, accountId),
        eq(appointments.customerId, customerId),
      ),
    )
    .orderBy(desc(appointments.startsAt));

  // Reminders are parked — see lib/reminders/flag.ts. Every `reminder_jobs` row
  // still on disk predates the switch, so the read model must not report one:
  // an appointment carries no reminder while the feature is off.
  const showReminders = remindersEnabled();
  const mapped: AppointmentView[] = rows.map((row) => ({
    id: row.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerWaId: customer.waId,
    conversationId: customer.conversationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    serviceType: row.serviceType,
    status: row.status,
    notes: row.notes,
    reminder:
      showReminders && row.reminderStatus
        ? { status: row.reminderStatus, responseType: row.reminderResponse }
        : null,
  }));
  const now = Date.now();
  const upcoming = mapped
    .filter(
      (appointment) =>
        new Date(appointment.startsAt).getTime() >= now &&
        (appointment.status === 'pending' ||
          appointment.status === 'confirmed'),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id));

  return {
    id: customer.id,
    accountId: customer.accountId,
    name: customer.name,
    phone: customer.phone,
    waId: customer.waId,
    manual: !customer.waId,
    notes: customer.notes,
    reminderOptedOutAt: customer.reminderOptedOutAt?.toISOString() ?? null,
    createdAt: customer.createdAt.toISOString(),
    conversationId: customer.conversationId,
    aiActive: customer.aiActive,
    timezone: customer.timezone,
    upcoming,
    history: mapped.filter((appointment) => !upcomingIds.has(appointment.id)),
  };
}
