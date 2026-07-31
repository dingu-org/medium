import { describe, expect, it } from 'vitest';
import { appointmentConfirmationContent } from '../appointment-confirmation';
import { formatAppointmentTime } from '../appointment-time';

const timezone = 'Europe/Tirane';
// Monday 6 July 2026, 09:00 in Tirane.
const startsAt = new Date('2026-07-06T07:00:00.000Z');
const time = formatAppointmentTime(startsAt, timezone);

describe('appointmentConfirmationContent', () => {
  it('names the booked time, the service, and the way back into the thread', () => {
    expect(
      appointmentConfirmationContent({
        kind: 'booked',
        startsAt,
        timezone,
        serviceType: 'Vlerësim i parë',
      }),
    ).toBe(
      `Takimi juaj u rezervua për ${time} (Vlerësim i parë). Nëse doni ta ndryshoni ose ta anuloni, më shkruani këtu.`,
    );
  });

  it('names the reschedule target time and the service', () => {
    expect(
      appointmentConfirmationContent({
        kind: 'rescheduled',
        startsAt,
        timezone,
        serviceType: 'Vlerësim i parë',
      }),
    ).toBe(
      `Takimi juaj u ricaktua për ${time} (Vlerësim i parë). Nëse doni ta ndryshoni sërish ose ta anuloni, më shkruani këtu.`,
    );
  });

  it('names the cancelled time and invites a replacement', () => {
    expect(
      appointmentConfirmationContent({
        kind: 'cancelled',
        startsAt,
        timezone,
        serviceType: 'Vlerësim i parë',
      }),
    ).toBe(
      `Takimi juaj për ${time} u anulua. Nëse dëshironi një orar tjetër, më shkruani ditën ose orën që ju përshtatet.`,
    );
  });

  // The bodies have to survive being frozen as Meta templates, which cannot drop
  // a variable, so a legacy row without a service must still substitute one.
  it.each(['booked', 'rescheduled'] as const)(
    'substitutes a neutral service on a %s row that has none',
    (kind) => {
      const content = appointmentConfirmationContent({
        kind,
        startsAt,
        timezone,
        serviceType: null,
      });
      expect(content).toContain('(Takim)');
      expect(content).not.toContain('(null)');
      expect(content).not.toContain('()');
    },
  );

  it('renders a reschedule from the new start, never the old one', () => {
    const movedTo = new Date('2026-07-07T11:00:00.000Z');
    const content = appointmentConfirmationContent({
      kind: 'rescheduled',
      startsAt: movedTo,
      timezone,
      serviceType: 'Terapi',
    });

    expect(content).toContain(formatAppointmentTime(movedTo, timezone));
    expect(content).not.toContain(time);
  });

  // A patient comparing this line against the reminder for the same booking must
  // not be shown two different times.
  it('quotes the instant through the shared formatter, in the PT timezone', () => {
    expect(
      appointmentConfirmationContent({
        kind: 'booked',
        startsAt,
        timezone: 'America/New_York',
        serviceType: 'Terapi',
      }),
    ).toContain(formatAppointmentTime(startsAt, 'America/New_York'));
  });
});
