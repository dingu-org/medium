import { formatAppointmentTime } from './appointment-time';

export type AppointmentConfirmationKind = 'booked' | 'rescheduled' | 'cancelled';

/**
 * The single customer-facing wording of an appointment change, whichever side
 * produced it: the conversation turn says it inline, the background job says it
 * for PT-side changes. It routes the instant through the shared
 * {@link formatAppointmentTime} for the same reason that formatter exists — a
 * customer comparing this line against a reminder for the same booking must not
 * be shown two different times.
 *
 * The bodies are shaped so they can be submitted to Meta as template bodies
 * unchanged: the dynamic parts stay positional and contiguous, and the service
 * is always substituted. An approved body is frozen and cannot drop a variable,
 * so a conditional omission here would have no expressible equivalent there.
 */
export function appointmentConfirmationContent(args: {
  kind: AppointmentConfirmationKind;
  startsAt: Date;
  timezone: string;
  serviceType: string | null;
}): string {
  const time = formatAppointmentTime(args.startsAt, args.timezone);
  // Only legacy rows reach the fallback: serviceType is required on a booking
  // and both reschedule and cancel carry the booked value forward.
  const service = args.serviceType ?? 'Takim';

  if (args.kind === 'booked') {
    return `Takimi juaj u rezervua për ${time} (${service}). Nëse doni ta ndryshoni ose ta anuloni, më shkruani këtu.`;
  }
  if (args.kind === 'rescheduled') {
    return `Takimi juaj u ricaktua për ${time} (${service}). Nëse doni ta ndryshoni sërish ose ta anuloni, më shkruani këtu.`;
  }
  return `Takimi juaj për ${time} u anulua. Nëse dëshironi një orar tjetër, më shkruani ditën ose orën që ju përshtatet.`;
}
