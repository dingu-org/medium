import { describe, expect, it } from 'vitest';
import { appointmentConfirmationContent } from '../appointment-confirmation';
import { formatAppointmentTime } from '../appointment-time';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';

const timezone = 'Europe/Tirane';
// A derived Monday at 09:00 in Tirane. Which Monday is irrelevant — every
// expectation below is rendered from this same instant — but it must not be a
// literal that quietly ages into the past.
const startsAt = zonedTime(testNow({ weekday: 1 }), 9, 0, timezone);
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
    const movedTo = zonedTime(
      new Date(startsAt.getTime() + DAY),
      13,
      0,
      timezone,
    );
    const content = appointmentConfirmationContent({
      kind: 'rescheduled',
      startsAt: movedTo,
      timezone,
      serviceType: 'Terapi',
    });

    expect(content).toContain(formatAppointmentTime(movedTo, timezone));
    expect(content).not.toContain(time);
  });

  // A customer comparing this line against the reminder for the same booking must
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

  describe('location facts', () => {
    const base = { startsAt, timezone, serviceType: 'Vlerësim i parë' };
    const bookedLine = `Takimi juaj u rezervua për ${time} (Vlerësim i parë). Nëse doni ta ndryshoni ose ta anuloni, më shkruani këtu.`;
    const atBusiness = {
      mode: 'at_business' as const,
      address: 'Rr. Elbasanit 5',
      city: null,
      country: null,
      directions: null,
      parking: null,
      entrance: null,
      floor: null,
    };

    it('appends the full in-person block with every detail', () => {
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'booked',
          facts: {
            ...atBusiness,
            city: 'Tiranë',
            country: 'Shqipëri',
            directions: 'Pas bankës.',
            parking: 'Para ndërtesës',
            entrance: 'Porta e kuqe',
            floor: '2',
          },
        }),
      ).toBe(
        `${bookedLine}\nAdresa: Rr. Elbasanit 5, Tiranë, Shqipëri.\nUdhëzime: Pas bankës.\nParkimi: Para ndërtesës.\nHyrja: Porta e kuqe.\nKati: 2.`,
      );
    });

    it('appends only the address when no details are filled in', () => {
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'rescheduled',
          facts: atBusiness,
        }),
      ).toBe(
        `Takimi juaj u ricaktua për ${time} (Vlerësim i parë). Nëse doni ta ndryshoni sërish ose ta anuloni, më shkruani këtu.\nAdresa: Rr. Elbasanit 5.`,
      );
    });

    it('adds nothing in person when the business has no address', () => {
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'booked',
          facts: { ...atBusiness, address: null, city: 'Tiranë' },
        }),
      ).toBe(bookedLine);
    });

    it('names the client address for an at-client booking, or nothing without one', () => {
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'booked',
          facts: { mode: 'at_client', clientAddress: 'Rr. Durrësit 10' },
        }),
      ).toBe(
        `${bookedLine}\nProfesionisti do të vijë në adresën tuaj: Rr. Durrësit 10.`,
      );
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'booked',
          facts: { mode: 'at_client', clientAddress: null },
        }),
      ).toBe(bookedLine);
    });

    it('says online and that the professional sends the link, without any link', () => {
      const content = appointmentConfirmationContent({
        ...base,
        kind: 'booked',
        facts: { mode: 'online' },
      });
      expect(content).toBe(
        `${bookedLine}\nTakimi do të bëhet online. Linkun do t'jua dërgojë profesionisti.`,
      );
      expect(content).not.toMatch(/https?:|link:\/\//i);
    });

    it('is byte-identical to no facts for mode null, and never adds to a cancellation', () => {
      for (const kind of ['booked', 'rescheduled', 'cancelled'] as const) {
        const plain = appointmentConfirmationContent({ ...base, kind });
        expect(
          appointmentConfirmationContent({
            ...base,
            kind,
            facts: { mode: null },
          }),
        ).toBe(plain);
      }
      expect(
        appointmentConfirmationContent({
          ...base,
          kind: 'cancelled',
          facts: { mode: 'online' },
        }),
      ).toBe(appointmentConfirmationContent({ ...base, kind: 'cancelled' }));
    });
  });
});
