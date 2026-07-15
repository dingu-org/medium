import { describe, expect, it } from 'vitest';
import { buildPushPayload, type PushEvent, pushPrefKey } from '../push-payload';

const PT = '55555555-5555-5555-5555-555555555555';
const APPT = '11111111-1111-1111-1111-111111111111';
const PATIENT = '22222222-2222-2222-2222-222222222222';
const CONV = '33333333-3333-3333-3333-333333333333';
const CONN = '44444444-4444-4444-4444-444444444444';
const TZ = 'Europe/Tirane';
const NAME = 'Alex Patient';

const booked: PushEvent = {
  name: 'notification.requested',
  data: {
    ptId: PT,
    kind: 'appointment.booked',
    appointmentId: APPT,
    patientId: PATIENT,
    startsAt: '2026-07-02T09:00:00.000Z',
    previousStartsAt: null,
  },
};
const cancelled: PushEvent = {
  name: 'notification.requested',
  data: { ...booked.data, kind: 'appointment.cancelled' },
};
const rescheduled: PushEvent = {
  name: 'notification.requested',
  data: { ...booked.data, kind: 'appointment.rescheduled' },
};
const escalated: PushEvent = {
  name: 'conversation.escalated',
  data: { ptId: PT, conversationId: CONV, patientId: PATIENT },
};
const needsReply: PushEvent = {
  name: 'conversation.needs_reply',
  data: { ptId: PT, conversationId: CONV, patientId: PATIENT },
};
const resumeOffered: PushEvent = {
  name: 'conversation.resume_offered',
  data: { ptId: PT, conversationId: CONV, patientId: PATIENT },
};
const revoked: PushEvent = {
  name: 'wa.connection.revoked',
  data: { ptId: PT, connectionId: CONN, reason: 'unauthorized' },
};
const reminderFailed: PushEvent = {
  name: 'reminder.failed',
  data: { ptId: PT, appointmentId: APPT, reason: 'window_closed' },
};
const EXPIRES = '2026-08-01T00:00:00.000Z';
const renewalDay5: PushEvent = {
  name: 'billing.renewal_due',
  data: { ptId: PT, expiresAt: EXPIRES, daysLeft: 5, offset: 5 },
};
const renewalDay0: PushEvent = {
  name: 'billing.renewal_due',
  data: { ptId: PT, expiresAt: EXPIRES, daysLeft: 0, offset: 0 },
};
const graceStarted: PushEvent = {
  name: 'billing.grace_started',
  data: { ptId: PT, expiresAt: EXPIRES },
};
const downgraded: PushEvent = {
  name: 'billing.downgraded',
  data: { ptId: PT, from: 'solo', to: 'free' },
};

describe('pushPrefKey', () => {
  it('maps every push event to its Settings toggle', () => {
    expect(pushPrefKey(booked)).toBe('booking');
    expect(pushPrefKey(cancelled)).toBe('cancellation');
    expect(pushPrefKey(rescheduled)).toBe('reschedule');
    expect(pushPrefKey(escalated)).toBe('escalation');
    expect(pushPrefKey(needsReply)).toBe('manualReply');
    expect(pushPrefKey(resumeOffered)).toBe('resumeOffer');
    expect(pushPrefKey(revoked)).toBe('connection');
    expect(pushPrefKey(reminderFailed)).toBe('reminderFailure');
  });

  it('routes every billing lifecycle push through the billing toggle', () => {
    expect(pushPrefKey(renewalDay5)).toBe('billing');
    expect(pushPrefKey(renewalDay0)).toBe('billing');
    expect(pushPrefKey(graceStarted)).toBe('billing');
    expect(pushPrefKey(downgraded)).toBe('billing');
  });
});

describe('buildPushPayload — billing lifecycle', () => {
  it('deep-links every billing push to /settings/billing', () => {
    for (const event of [renewalDay5, renewalDay0, graceStarted, downgraded]) {
      expect(buildPushPayload(event, { timezone: TZ })?.url).toBe(
        '/settings/billing',
      );
    }
  });

  it('differentiates the day-0 reminder from the grace notice (same expiry)', () => {
    const day0 = buildPushPayload(renewalDay0, { timezone: TZ });
    const grace = buildPushPayload(graceStarted, { timezone: TZ });
    expect(day0?.title).not.toBe(grace?.title);
    // Tags carry the expiry so the two pushes don't collapse on-device.
    expect(day0?.tag).not.toBe(grace?.tag);
    expect(day0?.tag).toContain(EXPIRES);
    expect(grace?.tag).toContain(EXPIRES);
  });

  it('tags the 5-day and day-0 reminders distinctly', () => {
    expect(buildPushPayload(renewalDay5, { timezone: TZ })?.tag).not.toBe(
      buildPushPayload(renewalDay0, { timezone: TZ })?.tag,
    );
  });
});

describe('buildPushPayload', () => {
  it('deep-links appointment events to the calendar with a dedupe tag', () => {
    const p = buildPushPayload(booked, { patientName: NAME, timezone: TZ });
    expect(p).toMatchObject({
      title: 'Rezervim i ri',
      url: `/calendar?appointmentId=${APPT}`,
      tag: `appointment-${APPT}-booked`,
    });
    expect(p?.body).toContain(NAME);
    expect(buildPushPayload(cancelled, { patientName: NAME, timezone: TZ })?.tag).toBe(
      `appointment-${APPT}-cancelled`,
    );
    expect(
      buildPushPayload(rescheduled, { patientName: NAME, timezone: TZ })?.tag,
    ).toBe(`appointment-${APPT}-rescheduled`);
  });

  it('keeps the patient name out of the title (iOS lock-screen privacy)', () => {
    for (const event of [booked, cancelled, rescheduled, escalated, needsReply]) {
      const p = buildPushPayload(event, { patientName: NAME, timezone: TZ });
      expect(p?.title).not.toContain(NAME);
    }
  });

  it('nudges a manual reply to the thread with a per-conversation dedupe tag', () => {
    const p = buildPushPayload(needsReply, { patientName: NAME, timezone: TZ });
    expect(p).toMatchObject({
      url: `/chat/${CONV}`,
      // Per-conversation (not per-message) so a burst collapses on-device.
      tag: `conversation-${CONV}-reply`,
    });
    expect(p?.body).toContain(NAME);
    // Falls back to the neutral label when the patient is unknown.
    expect(
      buildPushPayload(needsReply, { timezone: TZ })?.body,
    ).toContain('Një klient');
  });

  it('falls back to a neutral name when the patient is unknown', () => {
    const p = buildPushPayload(booked, { timezone: TZ });
    expect(p?.body).toContain('Një klient');
  });

  it('deep-links conversation events to the thread', () => {
    expect(
      buildPushPayload(escalated, { patientName: NAME, timezone: TZ }),
    ).toMatchObject({
      url: `/chat/${CONV}`,
      tag: `conversation-${CONV}-escalated`,
    });
    expect(
      buildPushPayload(resumeOffered, { patientName: NAME, timezone: TZ })?.url,
    ).toBe(`/chat/${CONV}`);
  });

  it('routes a revoked connection to settings and a failed reminder to the appointment', () => {
    expect(buildPushPayload(revoked, { timezone: TZ })).toMatchObject({
      title: 'WhatsApp u shkëput',
      url: '/settings',
      tag: `connection-${CONN}-revoked`,
    });
    expect(buildPushPayload(reminderFailed, { timezone: TZ })?.url).toBe(
      `/calendar?appointmentId=${APPT}`,
    );
  });
});
