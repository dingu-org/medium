/**
 * How a short customer reply is read, for every subsystem that reads one.
 *
 * It lives here rather than in `lib/reminders` because two subsystems ask the
 * customer a yes/no question and both get answered in the same words: an
 * unanswered reminder ("do you confirm?") and the handoff offer ("reply PO and
 * I'll pass this on"). While both are outstanding they compete for the same
 * message, and the rule that settles it is which question was asked most
 * recently (`resolveInboundClaim` in
 * lib/inngest/functions/handle-inbound-message.ts). That rule only works if the
 * two agree on what an affirmative IS. They did not: the offer demanded exact
 * equality with PO while the reminder accepted 'dakord', 'ok', and 'po' plus one
 * word, so "po faleminderit" was never weighed at all — the reminder took it,
 * the appointment was confirmed, and the customer's real question was dropped.
 * One definition, one place, no spelling technicality deciding the winner.
 */
export type ReplyIntent =
  | 'confirm'
  | 'cancel'
  | 'reschedule'
  | 'opt_out'
  | 'opt_in';

// Albanian only. The product is single-language (lib/i18n/sq.ts), and the old
// German/Italian/French/Spanish/English sets bought nothing but collisions:
// Italian 'si' is the Albanian interrogative "how" ("Si mund ta ndryshoj
// orën?") and German 'ja' is the Albanian "here you go" — both would have
// confirmed a real appointment on a misread. Exactly two non-Albanian tokens
// survive, each for its own reason:
//   • 'ok' / 'okay' — an everyday loanword in Albanian texting, written far
//     more often than "dakord" and unambiguous in a reply to a reminder.
//   • 'stop' — the universal, Meta-conventional opt-out word. Opting OUT is the
//     conservative direction (it can only stop messages, never change a
//     booking), so recognising it costs nothing and the customer can always
//     write AKTIVIZO to come back.
const KEYWORDS: Record<ReplyIntent, Set<string>> = {
  confirm: new Set(['konfirmo', 'konfirmoj', 'dakord', 'po', 'ok', 'okay']),
  cancel: new Set(['anulo', 'anuloj', 'jo']),
  reschedule: new Set(['ricakto', 'ricaktoj']),
  // Both switches also carry the polite 2pl imperative ("ndalni", "aktivizoni"),
  // which is the register a customer writes to a business in. NDAL is reversible
  // only by the customer, so an AKTIVIZO the parser does not know is a dead end:
  // the two sets have to be equally forgiving.
  opt_out: new Set(['ndal', 'ndalo', 'ndalni', 'ndaloni', 'stop']),
  opt_in: new Set(['aktivizo', 'aktivizoj', 'aktivizoni', 'aktivizoje']),
};

/**
 * Bare particles that answer a yes/no question but are also high-frequency
 * function words: Albanian 'po' is the progressive particle ("Po pyesja…" = "I
 * was asking…") and 'jo' opens plenty of sentences that are not a cancellation
 * ("Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën"). 'ok'/'okay' and
 * 'dakord' are acknowledgements rather than commands and can just as easily
 * preface a question. They only speak for the message when the message IS
 * essentially that answer, so they are gated on length. Punctuation cannot
 * rescue them: "Po, do të vij" and "Po, por a mund ta zhvendos?" are
 * indistinguishable by their comma, and cancelling or confirming a real
 * appointment on a misread is far worse than handing the reply to the AI turn,
 * which answers it conversationally and can still call the tools.
 */
const AMBIGUOUS_KEYWORDS = new Set(['po', 'jo', 'ok', 'okay', 'dakord']);

/** Longest message an {@link AMBIGUOUS_KEYWORDS} token may still speak for. */
const MAX_AMBIGUOUS_MESSAGE_WORDS = 3;

/**
 * Tighter bound for 'po', which is the only particle with a second grammatical
 * life: as the progressive marker it heads an ordinary statement ("Po pyesja
 * diçka", "Po flas seriozisht"). One trailing word still reads as the answer
 * ("Po, vij"); two make a verb phrase likelier than a bare "yes".
 */
const MAX_PROGRESSIVE_PARTICLE_WORDS = 2;

/**
 * Message tokens, normalised for keyword lookup.
 *
 * Decompose first and drop the combining marks, so every way of typing the same
 * word lands on one token. Albanian keyboards routinely drop 'ë'/'ç' and phone
 * keyboards rewrite ' into U+2019, and the lookup has to be blind to all of it —
 * folding carried over from the deleted deterministic detector, whose patterns
 * were the problem; this normalisation never was. Two hazards it settles:
 *   • the character class carries no \p{M}, so a decomposed "ë" left as-is would
 *     lose its diaeresis to the split and break the word in two;
 *   • both apostrophes fall out for free — nothing but letters and digits
 *     survives, so "s'ndal" and "s’ndal" tokenise identically.
 */
function words(input: string): string[] {
  return (
    input
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).map((word) => word.toLocaleLowerCase('en-US'));
}

/**
 * "Ju lutem" / "të lutem" softens a request without changing it, so the command
 * behind it is still the message: "Ju lutem aktivizoni kujtesat" has to resolve
 * exactly like "Aktivizoni kujtesat".
 */
const POLITENESS_SUBJECTS = new Set(['ju', 'të', 'te']);
const POLITENESS_VERBS = new Set(['lutem', 'lutemi']);

function stripPoliteness(tokens: string[]): string[] {
  return tokens.length > 2 &&
    POLITENESS_SUBJECTS.has(tokens[0]) &&
    POLITENESS_VERBS.has(tokens[1])
    ? tokens.slice(2)
    : tokens;
}

/**
 * Reschedule outranks cancel: "Jo, ricakto nesër" is a request to MOVE the
 * appointment, and reading it as a cancellation destroys the booking. Opt-out
 * outranks opt-in for the same reason it keeps 'stop': stopping messages is the
 * recoverable direction.
 */
const INTENT_PRECEDENCE = [
  'opt_out',
  'opt_in',
  'reschedule',
  'cancel',
  'confirm',
] as const;

function intentOf(word: string): ReplyIntent | null {
  for (const intent of INTENT_PRECEDENCE) {
    if (KEYWORDS[intent].has(word)) return intent;
  }
  return null;
}

/**
 * An explicit command word ("anulo", "ricakto", "ndal", "aktivizo") — never a
 * particle.
 */
function explicitIntent(token: string): ReplyIntent | null {
  return AMBIGUOUS_KEYWORDS.has(token) ? null : intentOf(token);
}

/**
 * Only these three may be recognised away from the front of a short reply, so
 * "Jo, ricakto nesër" moves the appointment instead of cancelling it. Cancel
 * and confirm are excluded on purpose: both change a booking, and a trailing
 * one is as likely to be talked about as meant. Opt-out and opt-in only ever
 * change who gets a reminder, and each is the other's undo.
 */
const OUT_OF_POSITION_INTENTS: ReadonlySet<ReplyIntent> = new Set([
  'opt_out',
  'opt_in',
  'reschedule',
]);

/**
 * Out-of-position matching exists for the "answer + command" shape, so only a
 * run of answer particles may sit in front of the command. Anything else there
 * changes what the verb means and must not be obeyed:
 *   • a negator — "mos e ndal", "nuk ricakto", and the contracted "s'ndal",
 *     whose apostrophe (U+0027 or U+2019) splits off a bare "s";
 *   • a future or progressive marker — "do ta ndal" / "Po e ndal" is "I'm
 *     stopping it", a customer describing something, not an instruction;
 *   • an English modifier — "full stop", "non-stop".
 */
function followsAnswerParticlesOnly(tokens: string[], index: number): boolean {
  return tokens.slice(0, index).every((token) => AMBIGUOUS_KEYWORDS.has(token));
}

export function parseReplyIntent(input: string): ReplyIntent | null {
  const tokens = stripPoliteness(words(input));
  if (tokens.length === 0) return null;

  if (tokens.length <= MAX_AMBIGUOUS_MESSAGE_WORDS) {
    const commands = tokens.flatMap((token, index) => {
      const intent = explicitIntent(token);
      return intent ? [{ intent, index }] : [];
    });
    const obeyed = commands.filter(
      (command) =>
        command.index === 0 ||
        (OUT_OF_POSITION_INTENTS.has(command.intent) &&
          followsAnswerParticlesOnly(tokens, command.index)),
    );
    for (const intent of INTENT_PRECEDENCE) {
      if (obeyed.some((command) => command.intent === intent)) return intent;
    }

    const leading = intentOf(tokens[0]);
    // A command the scan refused to obey must never be downgraded to the
    // particle in front of it: "Ok, anuloj" ("OK, I'm cancelling") is not the
    // confirmation a bare "Ok" would be, and confirming it strands a customer
    // who believes they cancelled. Only a command that says the same thing as
    // the particle is harmless ("Po, konfirmo").
    if (commands.some((command) => command.intent !== leading)) return null;
    if (!leading) return null;
    // Cancelling destroys the booking, so a particle only cancels when the
    // message IS that particle: "Jo" cancels, but "Jo, ndryshoj orën" ("no, I'll
    // change the time") must not — keywords cannot tell it from "Jo, nuk mundem",
    // so the AI turn reads it instead. Confirming is not destructive, so a short
    // "Po, vij" / "Ok faleminderit" still resolves deterministically.
    if (leading === 'cancel' && tokens.length > 1) return null;
    if (tokens[0] === 'po' && tokens.length > MAX_PROGRESSIVE_PARTICLE_WORDS) {
      return null;
    }
    return leading;
  }

  // Longer than a bare answer: trust only an explicit command in FIRST position
  // ("Anulo takimin te lutem"). Scanning the whole sentence would misread
  // "Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën" — which says the
  // opposite — as a cancellation, so everything else goes to the AI turn.
  return explicitIntent(tokens[0]);
}

/**
 * Whether this message says yes — the product's only definition of it.
 *
 * Deliberately the full parse and not a keyword lookup, because everything that
 * makes a "yes" *not* a yes lives in the parse: "Ok, anuloj" is a cancellation
 * wearing an acknowledgement (so it is not affirmative for anyone), and
 * "Po pyesja për oraret" is the progressive particle heading an ordinary
 * question. Whatever a subsystem does with an affirmative — confirm a booking,
 * accept a handoff offer — it has to agree with every other subsystem about
 * which messages are one, or the message goes to whoever happens to run first.
 */
export function isAffirmative(input: string): boolean {
  return parseReplyIntent(input) === 'confirm';
}
