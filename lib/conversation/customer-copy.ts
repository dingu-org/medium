/**
 * Every fixed sentence the assistant sends a customer, in one file (2026-08-30).
 *
 * These exist for exactly one reason: the assistant cannot speak. Either it has
 * just handed the thread to a person, or it cannot read what arrived. Everywhere
 * else the model writes its own words — nothing in this product classifies
 * customer text any more.
 *
 * They live here and not in `lib/i18n/`, which is professional-facing only.
 * Customer copy is Albanian, singular, and inlined at the point of use; a
 * dictionary would imply a locale switch the product does not have.
 *
 * Two rules every sentence here obeys:
 *
 *  - **It names no vertical.** Medium books appointments for barbers and nail
 *    salons as much as for physiotherapists, and it is not an emergency channel,
 *    so no sentence may name a discipline or give urgent-care guidance.
 *  - **It never explains why.** The escalation sentence is sent for a model
 *    escalation, an accepted offer, a crashed turn AND a billing cap. A customer
 *    told "we hit our monthly limit" or "the assistant crashed" learns something
 *    about the business that is true, useless to them, and damaging to it. All
 *    four say the same thing, because all four mean the same thing to the
 *    customer: a person has this now.
 */

/**
 * Stand-in for a business that never filled its name in. Vertical-neutral by
 * requirement. In Albanian this sits in the dative, which is the case every
 * sentence below needs ("ia kalova biznesit" = "I passed it to the business").
 */
export const DEFAULT_BUSINESS_LABEL_SQ = 'biznesit';

export function businessLabel(name: string | null): string {
  return name?.trim() || DEFAULT_BUSINESS_LABEL_SQ;
}

/**
 * The one static offer, used for every out-of-scope request there is.
 *
 * It asks a plain question and names no answer word. It used to end with
 * "përgjigjuni me PO", because acceptance was decided by matching that word
 * against the reply — and the matching is what failed: `"ok, jo"`,
 * `"ok nuk dua"` and `"Ok, e kuptova"` all parsed as a yes. The model reads the
 * answer now, so asking for a keyword would only teach the customer a ritual
 * nothing depends on.
 */
export function handoffOfferMessage(business: string): string {
  return `Mund të ndihmoj vetëm me takimet. Dëshironi t'ia kaloj këtë pyetje ${business}?`;
}

/**
 * Sent whenever a person takes the thread: the model called
 * `escalate_to_human`, the customer accepted the offer, the turn died, or the
 * account hit its conversation cap. One sentence for all four — see the "never
 * explains why" rule above.
 *
 * It promises a person and no time, which is the only promise the product can
 * keep: the professional is a human being with a working day, and every path
 * that sends this leaves the conversation waiting on them.
 */
export function escalationMessage(business: string): string {
  return `Këtë bisedë ia kalova ${business} — do t'ju përgjigjen personalisht sa më shpejt.`;
}

/**
 * The answer to a voice note, a photo or a document.
 *
 * One message doing both halves of the job, because the customer needs both:
 * what just happened to the thing they sent (a person has it), and what to do
 * next if they wanted an appointment (write text). Saying only the first leaves
 * them waiting; saying only the second throws their message away.
 *
 * Unlike every other sentence here, this one does NOT mean the assistant has
 * stopped: non-text notifies the professional without taking the conversation
 * away from the AI, so the customer's next typed message still gets a normal
 * turn. That is exactly what the last clause invites.
 */
export function nonTextNoticeMessage(business: string): string {
  return `Mund të lexoj vetëm mesazhe me tekst, ndaj këtë ia kalova ${business} — do t'ju përgjigjen së shpejti. Për takimet mund të më shkruani këtu me tekst.`;
}
