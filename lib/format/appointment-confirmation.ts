import { formatAppointmentTime } from './appointment-time';
import type { ConfirmationFacts } from './confirmation-facts';

export type AppointmentConfirmationKind =
  | 'booked'
  | 'rescheduled'
  | 'cancelled';

/** Ends the value with a full stop unless it already ends with punctuation. */
function sentence(value: string): string {
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

// DRAFTED Albanian copy, pending KD's review.
function locationBlock(facts: ConfirmationFacts | undefined): string | null {
  if (!facts) return null;
  if (facts.mode === 'online') {
    return "Takimi do të bëhet online. Linkun do t'jua dërgojë profesionisti.";
  }
  if (facts.mode === 'at_client') {
    return facts.clientAddress
      ? sentence(
          `Profesionisti do të vijë në adresën tuaj: ${facts.clientAddress}`,
        )
      : null;
  }
  if (facts.mode === 'at_business') {
    // No stored address: say nothing rather than invent one.
    if (!facts.address) return null;
    const place = [facts.address, facts.city, facts.country]
      .filter(Boolean)
      .join(', ');
    const lines = [sentence(`Adresa: ${place}`)];
    if (facts.directions) lines.push(sentence(`Udhëzime: ${facts.directions}`));
    if (facts.parking) lines.push(sentence(`Parkimi: ${facts.parking}`));
    if (facts.entrance) lines.push(sentence(`Hyrja: ${facts.entrance}`));
    if (facts.floor) lines.push(sentence(`Kati: ${facts.floor}`));
    return lines.join('\n');
  }
  return null;
}

function withLocation(
  body: string,
  facts: ConfirmationFacts | undefined,
): string {
  const block = locationBlock(facts);
  return block ? `${body}\n${block}` : body;
}

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
 *
 * The first sentence is that template-shaped part. For booked and rescheduled,
 * `facts` appends a separate trailing paragraph (where it happens: address and
 * details, the client's own address, or the online notice). It is the part that
 * would become a second template if confirmations ever move off `sendFreeForm`.
 * It adds nothing for `mode: null`, so a service with no known mode is worded
 * exactly as before, and never for a cancellation.
 */
export function appointmentConfirmationContent(args: {
  kind: AppointmentConfirmationKind;
  startsAt: Date;
  timezone: string;
  serviceType: string | null;
  facts?: ConfirmationFacts;
}): string {
  const time = formatAppointmentTime(args.startsAt, args.timezone);
  // Only legacy rows reach the fallback: serviceType is required on a booking
  // and both reschedule and cancel carry the booked value forward.
  const service = args.serviceType ?? 'Takim';

  if (args.kind === 'booked') {
    return withLocation(
      `Takimi juaj u rezervua për ${time} (${service}). Nëse doni ta ndryshoni ose ta anuloni, më shkruani këtu.`,
      args.facts,
    );
  }
  if (args.kind === 'rescheduled') {
    return withLocation(
      `Takimi juaj u ricaktua për ${time} (${service}). Nëse doni ta ndryshoni sërish ose ta anuloni, më shkruani këtu.`,
      args.facts,
    );
  }
  return `Takimi juaj për ${time} u anulua. Nëse dëshironi një orar tjetër, më shkruani ditën ose orën që ju përshtatet.`;
}
