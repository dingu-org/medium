export type ReminderResponseIntent =
  | 'confirm'
  | 'cancel'
  | 'reschedule'
  | 'opt_out';

const KEYWORDS: Record<ReminderResponseIntent, Set<string>> = {
  confirm: new Set([
    'confirm',
    'confirmed',
    'yes',
    'y',
    'ok',
    'okay',
    'sure',
    'ja',
    'bestätige',
    'bestaetige',
    'bestätigen',
    'bestaetigen',
    // NOT bare 'si': in Albanian (the canonical patient language) it is the
    // interrogative "how", so "Si mund ta ndryshoj orën?" must not confirm.
    'sì',
    'confermo',
    'conferma',
    'oui',
    'confirme',
    'confirmer',
    'sí',
    'confirmo',
    'confirmar',
    'konfirmo',
    'konfirmoj',
    'po',
  ]),
  cancel: new Set([
    'cancel',
    'cancelled',
    'canceled',
    'no',
    'n',
    'nein',
    'absagen',
    'storniere',
    'annulla',
    'annullare',
    'cancella',
    'non',
    'annuler',
    'annule',
    'cancelar',
    'cancelo',
    'anulo',
    'anuloj',
    'jo',
  ]),
  reschedule: new Set([
    'reschedule',
    'change',
    'move',
    'verschieben',
    'ändern',
    'aendern',
    'sposta',
    'spostare',
    'cambia',
    'déplacer',
    'deplacer',
    'changer',
    'cambiar',
    'mover',
    'reprogramar',
    'ricakto',
    'ricaktoj',
  ]),
  opt_out: new Set(['stop', 'ndal']),
};

/**
 * Bare particles that answer a yes/no question but are also high-frequency
 * function words: Albanian 'po' is the progressive particle ("Po pyesja…" = "I
 * was asking…") and 'jo' opens plenty of sentences that are not a cancellation
 * ("Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën"). They only speak for
 * the message when the message IS essentially that answer, so they are gated on
 * length. Punctuation cannot rescue them: "Po, do të vij" and "Po, por a mund ta
 * zhvendos?" are indistinguishable by their comma, and cancelling or confirming
 * a real appointment on a misread is far worse than handing the reply to the AI
 * turn, which answers it conversationally and can still call the tools.
 */
const AMBIGUOUS_KEYWORDS = new Set([
  'po',
  'jo',
  'yes',
  'y',
  'no',
  'n',
  'ok',
  'okay',
  'sure',
  'ja',
  'sì',
  'sí',
  'oui',
  'non',
  'nein',
]);

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
 * appointment, and reading it as a cancellation destroys the booking.
 */
const INTENT_PRECEDENCE = [
  'opt_out',
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

/** An explicit command word ("anulo", "ricakto", "ndal") — never a particle. */
function explicitIntent(token: string): ReminderResponseIntent | null {
  return AMBIGUOUS_KEYWORDS.has(token) ? null : intentOf(token);
}

export function parseReminderResponse(
  input: string,
): ReminderResponseIntent | null {
  const tokens = words(input);
  if (tokens.length === 0) return null;

  if (tokens.length <= MAX_AMBIGUOUS_MESSAGE_WORDS) {
    // Only these two may be recognised away from the front of a short reply, so
    // "Jo, ricakto nesër" moves the appointment instead of cancelling it. Cancel
    // and confirm are excluded on purpose: a trailing keyword is as likely to be
    // negated ("mos anulo" = "don't cancel") as meant, and both change state.
    for (const intent of ['opt_out', 'reschedule'] as const) {
      if (tokens.some((token) => explicitIntent(token) === intent)) {
        return intent;
      }
    }
    const leading = intentOf(tokens[0]);
    if (!leading) return null;
    // Cancelling destroys the booking, so a particle only cancels when the
    // message IS that particle: "Jo" cancels, but "Jo, ndryshoj orën" ("no, I'll
    // change the time") must not — keywords cannot tell it from "Jo, nuk mundem",
    // so the AI turn reads it instead. Confirming is not destructive, so a short
    // "Po, vij" / "yes thanks" still resolves deterministically.
    if (leading === 'cancel' && tokens.length > 1) return null;
    return leading;
  }

  // Longer than a bare answer: trust only an explicit command in FIRST position
  // ("Anulo takimin te lutem"). Scanning the whole sentence would misread
  // "Jo, nuk dua ta anuloj, thjesht dua ta ndryshoj orën" — which says the
  // opposite — as a cancellation, so everything else goes to the AI turn.
  return explicitIntent(tokens[0]);
}
