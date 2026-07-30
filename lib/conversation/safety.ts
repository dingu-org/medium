export type SafetyEscalationReason =
  | 'human_requested'
  | 'urgent_health_concern'
  | 'legal_or_billing'
  | 'insurance_question'
  | 'high_frustration';

// Albanian keyboards routinely drop 'ë'/'ç', phone keyboards rewrite ' into
// U+2019, and WhatsApp messages are often multi-line. Every comparison below
// therefore runs on a folded copy of the message: diacritics stripped, curly
// apostrophes flattened to ASCII, and whitespace runs collapsed to one space so
// a line break inside a phrase cannot defeat a `.{0,n}` gap. The patterns are
// written in that folded alphabet — 'frymemarrje', not 'frymëmarrje'.
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case- and diacritic-insensitive whole-string equality ('NDIHME' = 'ndihmë'). */
function equalsFolded(value: string, candidate: string): boolean {
  return (
    fold(value).localeCompare(fold(candidate), undefined, {
      sensitivity: 'base',
    }) === 0
  );
}

// Albanian patterns must not use `\b`: it is ASCII-only, so a boundary next to
// a folded-away letter is unreliable. They use Unicode letter lookarounds plus
// `\p{L}*` to absorb Albanian inflection ('urgjencë' → 'urgjencën', 'avokat' →
// 'avokatin') under the `u` flag.
//
// The human nouns are the exception: an open `\p{L}*` on 'person' also swallows
// the unrelated adjective ('terapi personale'), so they take an explicit
// declension set closed by a letter boundary — 'fizioterapistin' still matches,
// 'personale' no longer does. The verb must be an explicit talk/connect one too:
// with 'dua' in the alternation, 'Dua një takim me fizioterapistin' — the single
// most common booking phrasing — escalated instead of reaching the model.
const HUMAN_PATTERNS = [
  /\breal person\b/i,
  /\b(?:speak|talk|connect)\b.{0,24}\b(?:human|person|therapist|physio|pt)\b/i,
  /\b(?:human|person)\b.{0,24}\b(?:please|now)\b/i,
  /(?<![\p{L}\p{N}])(?:person|njeri|fizioterapist|terapist)(?:i|in|it|e|et)?(?![\p{L}\p{N}])\s+(?:real|te vertet)\p{L}*/iu,
  // 'lidh' takes explicit verb endings rather than an open stem: 'lidh\p{L}*'
  // also matched the noun 'lidhje', so "Në lidhje me takimin…" ("regarding the
  // appointment") turned a routine reschedule into a permanent handoff.
  /(?<![\p{L}\p{N}])(?:flas\p{L}*|lidh(?:ni|me|eni)?(?![\p{L}\p{N}])).{0,24}(?<![\p{L}\p{N}])(?:dike|person|njeri|fizioterapist|terapist)(?:i|in|it|e|et)?(?![\p{L}\p{N}])/iu,
];

const URGENT_PATTERNS = [
  /\bemergency\b/i,
  /\bambulance\b/i,
  /\bchest pain\b/i,
  /\b(?:can'?t|cannot|unable to)\s+(?:walk|stand|breathe)\b/i,
  /\bdifficulty breathing\b/i,
  /\bsevere pain\b/i,
  /\b(?:just|recently|today|yesterday)\s+(?:fell|had a fall)\b/i,
  /\b(?:fell|had a fall)\b.{0,32}\b(?:hurt|injured|pain|bleeding|dizzy|can'?t|cannot|unable)\b/i,
  /(?<![\p{L}\p{N}])urgjenc\p{L}*/iu,
  // 'ambulancë' is also the Albanian word for an outpatient clinic, so a bare
  // stem escalated "Ku ndodhet ambulanca juaj?". The inflected forms need a
  // call-for-one verb or an immediacy word; the bare indefinite still escalates
  // on its own because it folds onto the English `\bambulance\b` above, which is
  // the reading we want for a lone "ambulancë". The adjective 'urgjent' needs a
  // copula for the mirror reason: "orare urgjente" is a scheduling question,
  // "është urgjente" is not.
  /(?<![\p{L}\p{N}])(?:me\s+)?(?:duhet|nevojitet|thirrni|thirr|therrisni|dergoni|kerkoj|dua)\s+(?:nje\s+)?(?:auto)?ambulanc\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:auto)?ambulanc\p{L}*\s+(?:tani|menjehere|urgjent\p{L}*)/iu,
  /(?<![\p{L}\p{N}])(?:eshte|ishte)\s+urgjent\p{L}*/iu,
  // Chest pain is far more often 'dhimbje në gjoks' than the genitive 'dhimbje
  // gjoksi', and the severity adjective agrees with the noun's number, so both
  // 'dhimbje e fortë' and 'dhimbje shumë të forta' have to land here.
  /(?<![\p{L}\p{N}])dhimbje\p{L}*\s+(?:ne\s+)?(?:gjoks|kraharor)\p{L}*/iu,
  /(?<![\p{L}\p{N}])dhimbje\p{L}*(?:\s+(?:shume|teper|jashtezakonisht|goxha))?\s+(?:e|te|i)\s+fort\p{L}*/iu,
  /(?<![\p{L}\p{N}])veshtiresi\p{L}*\s+(?:ne\s+)?frymemarrje\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:nuk mund|s'mund)(?![\p{L}\p{N}]).{0,16}(?<![\p{L}\p{N}])(?:te ec|te qendroj|te marr fryme)\p{L}*/iu,
];

// Scoped to genuine disputes only. Bare price words (bill/charge/faturë/pagesë)
// used to land here and switch the assistant off, even though the prompt
// carries each service's price and is told to quote it — a plain "how much do
// you charge?" must reach the model.
const LEGAL_BILLING_PATTERNS = [
  /\b(?:lawyer|legal action|lawsuit|sue|solicitor)\b/i,
  // 'reimbursement' sits next to 'refund' rather than under insurance because
  // Albanian has one word for both ('rimbursim'); splitting them handed the same
  // request two different canned replies depending on the patient's language.
  /\b(?:payment dispute|billing dispute|refund|reimbursement|chargeback|overcharged|wrong(?:ly)? charged|dispute the (?:bill|invoice|charge))\b/i,
  /(?<![\p{L}\p{N}])(?:avokat|ligjor|rimbursim)\p{L}*/iu,
  // The adjective agrees with the noun's gender ('faturim i gabuar', 'faturë e
  // gabuar'), may sit behind a copula, or the complaint is phrased as a verb.
  /(?<![\p{L}\p{N}])(?:fatur|pages)\p{L}*\s+(?:eshte\s+|ishte\s+)?(?:e|te|i)\s+gabuar\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:me\s+)?(?:keni|kane|ke)\s+(?:faturuar|tarifuar|ngarkuar)\s+(?:gabim|padrejtesisht|dyfish|me\s+shume)/iu,
];

const INSURANCE_PATTERNS = [
  /\b(?:insurance|insurer)\b/i,
  /\b(?:health|medical)\s+(?:plan|policy)\b/i,
  /\b(?:plan|policy)\s+coverage\b/i,
  /\bcovered by (?:my|the|an?) (?:insurance|health plan|medical plan|policy)\b/i,
  /(?<![\p{L}\p{N}])(?:sigurim|siguracion)\p{L}*/iu,
  /(?<![\p{L}\p{N}])mbulim\p{L}*\s+shendetesor\p{L}*/iu,
];

const FRUSTRATION_PATTERNS = [
  /\bthis isn'?t working\b/i,
  /\byou(?:'re| are) not (?:understanding|listening)\b/i,
  /\bthis is useless\b/i,
  /\b(?:very|really|extremely) frustrated\b/i,
  // A bare 'nuk funksionon' is how a patient declines a proposed slot ("E marta
  // nuk funksionon, a keni të mërkurën?") — the most common reschedule reply of
  // all — so it needs an explicit "nothing works at all" to count as anger.
  /(?<![\p{L}\p{N}])(?:asgje\s+nuk\s+(?:po\s+)?funksionon|nuk\s+(?:po\s+)?funksionon\s+(?:asgje|fare|hic))/iu,
  /(?<![\p{L}\p{N}])nuk\s+(?:po\s+)?kupton\p{L}*/iu,
  /(?<![\p{L}\p{N}])(?:jam|jemi|jeni)\s+(?:shume\s+|teper\s+)?(?:[ie]\s+)?frustruar/iu,
];

export function detectSafetyEscalation(
  content: string,
  escalationKeyword: string | null,
): SafetyEscalationReason | null {
  const normalized = fold(content);
  const keyword = escalationKeyword?.trim();
  if (
    equalsFolded(normalized, 'HELP') ||
    equalsFolded(normalized, 'NDIHMË') ||
    (keyword && equalsFolded(normalized, keyword)) ||
    HUMAN_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return 'human_requested';
  }
  if (URGENT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'urgent_health_concern';
  }
  if (LEGAL_BILLING_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'legal_or_billing';
  }
  if (INSURANCE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'insurance_question';
  }
  if (FRUSTRATION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'high_frustration';
  }
  return null;
}

export function safetyEscalationResponse(
  reason: SafetyEscalationReason,
  practiceName: string,
): string {
  if (reason === 'urgent_health_concern') {
    return `Nuk mund të vlerësoj shqetësime urgjente mjekësore. Ju lutem kontaktoni menjëherë shërbimet vendore të urgjencës. Këtë bisedë ia kalova edhe ${practiceName}.`;
  }
  if (reason === 'human_requested') {
    return `Patjetër. Këtë bisedë ia kalova ${practiceName}; do t'ju përgjigjen sapo të jenë të lirë.`;
  }
  if (reason === 'insurance_question') {
    return `Nuk kam qasje në informacionin për mbulimin e sigurimit. Këtë bisedë ia kalova ${practiceName} që t'ju ndihmojnë.`;
  }
  if (reason === 'legal_or_billing') {
    return `Mund të ndihmoj vetëm me caktimin e takimeve. Për këtë kërkesë, bisedën ia kalova ${practiceName}.`;
  }
  return `Dua të sigurohem që të merrni ndihmën e duhur. Këtë bisedë ia kalova ${practiceName}; do t'ju përgjigjen sapo të jenë të lirë.`;
}
