export type ReminderResponseIntent =
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
//     booking), so recognising it costs nothing and the patient can always
//     write AKTIVIZO to come back.
const KEYWORDS: Record<ReminderResponseIntent, Set<string>> = {
  confirm: new Set(['konfirmo', 'konfirmoj', 'dakord', 'po', 'ok', 'okay']),
  cancel: new Set(['anulo', 'anuloj', 'jo']),
  reschedule: new Set(['ricakto', 'ricaktoj']),
  opt_out: new Set(['ndal', 'stop']),
  opt_in: new Set(['aktivizo', 'aktivizoj']),
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

/** Message tokens, normalised for keyword lookup. */
function words(input: string): string[] {
  return (input.match(/[\p{L}\p{N}]+/gu) ?? []).map((word) =>
    word.normalize('NFC').toLocaleLowerCase('en-US'),
  );
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

function intentOf(word: string): ReminderResponseIntent | null {
  for (const intent of INTENT_PRECEDENCE) {
    if (KEYWORDS[intent].has(word)) return intent;
  }
  return null;
}

/**
 * An explicit command word ("anulo", "ricakto", "ndal", "aktivizo") — never a
 * particle.
 */
function explicitIntent(token: string): ReminderResponseIntent | null {
  return AMBIGUOUS_KEYWORDS.has(token) ? null : intentOf(token);
}

/**
 * Albanian negators. A command that is negated means the opposite of itself —
 * "mos ndal kujtesat" ("do NOT stop the reminders") is a request to keep them —
 * so a keyword directly behind one of these must not be obeyed.
 */
const NEGATORS = new Set(['mos', 'nuk', 'ska', 'spo']);

export function parseReminderResponse(
  input: string,
): ReminderResponseIntent | null {
  const tokens = words(input);
  if (tokens.length === 0) return null;

  if (tokens.length <= MAX_AMBIGUOUS_MESSAGE_WORDS) {
    // Only these three may be recognised away from the front of a short reply,
    // so "Jo, ricakto nesër" moves the appointment instead of cancelling it.
    // Cancel and confirm are excluded on purpose: a trailing keyword is as
    // likely to be negated ("mos anulo" = "don't cancel") as meant, and both
    // change state. Opt-out and opt-in only ever change who gets a reminder,
    // and each is the other's undo.
    for (const intent of ['opt_out', 'opt_in', 'reschedule'] as const) {
      if (
        tokens.some(
          (token, index) =>
            explicitIntent(token) === intent &&
            !(index > 0 && NEGATORS.has(tokens[index - 1])),
        )
      ) {
        return intent;
      }
    }
    const leading = intentOf(tokens[0]);
    if (!leading) return null;
    // Cancelling destroys the booking, so a particle only cancels when the
    // message IS that particle: "Jo" cancels, but "Jo, ndryshoj orën" ("no, I'll
    // change the time") must not — keywords cannot tell it from "Jo, nuk mundem",
    // so the AI turn reads it instead. Confirming is not destructive, so a short
    // "Po, vij" / "Ok faleminderit" still resolves deterministically.
    if (leading === 'cancel' && tokens.length > 1) return null;
    return leading;
  }

  // Longer than a bare answer: trust only an explicit command in FIRST position
  // ("Anulo takimin te lutem"). Scanning the whole sentence would misread
  // "Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën" — which says the
  // opposite — as a cancellation, so everything else goes to the AI turn.
  return explicitIntent(tokens[0]);
}
