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
    'si',
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

function firstWord(input: string): string | null {
  const match = input.trim().match(/^[^\p{L}\p{N}]*([\p{L}\p{N}]+)/u);
  return match?.[1]?.normalize('NFC').toLocaleLowerCase('en-US') ?? null;
}

export function parseReminderResponse(
  input: string,
): ReminderResponseIntent | null {
  const word = firstWord(input);
  if (!word) return null;

  for (const intent of [
    'opt_out',
    'confirm',
    'cancel',
    'reschedule',
  ] as const) {
    if (KEYWORDS[intent].has(word)) return intent;
  }
  return null;
}
